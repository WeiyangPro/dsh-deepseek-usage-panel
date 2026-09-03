// dsh-deepseek-usage-panel 路 host half.
//
// A profile "bundle" plugin: loaded by the profile Cordis Loader through the
// row inserted by cordis.patch.yml ({id: usage-hud, name: dsh-deepseek-usage-panel}).
//
// What this half does:
//   1. Resolves the DeepSeek API key (credentials/settings) and polls
//      GET {baseURL}/user/balance on a self-rescheduling timer.
//   2. Subscribes to session/event and accumulates per-(hour, model) token
//      usage from `assistant/message` events into a bounded rolling state.
//   3. Serves the assembled snapshot to the browser HUD over same-origin JSON
//      routes under /dsh-usage/api (the browser half fetches these).
//
// The browser half (client.js) never sees the API key.
import { createBalanceStore } from "./lib/host/balance.js";
import { createUsageState, usageFromSessionEvent } from "./lib/host/usage.js";
import { buildSnapshot } from "./lib/host/snapshot.js";
import { resolveApiKey } from "./lib/host/key.js";
import { ensureDataDir, fenceOk, writeRes, migrateLegacyState } from "./lib/host/util.js";

export const name = "dsh-deepseek-usage-panel";

// webServer (JSON routes) and timer (ctx.timeout / ctx.interval mixin) are
// hard dependencies 鈥?Cordis guards property access to undeclared services.
// Everything else is read defensively through ctx.get(...) inside apply().
export const inject = ["webServer", "timer"];

const DEFAULTS = {
  pollIntervalMs: 5 * 60 * 1000, // balance poll cadence
  saveIntervalMs: 60 * 1000, // history flush cadence
  historyHours: 72, // hourly buckets retained in state.json
  timeoutMs: 15 * 1000, // balance request timeout
  dataDir: null, // override plugin data dir (default: <profile>/.dsh-usage)
};

export function apply(ctx, rawConfig = {}) {
  const config = { ...DEFAULTS, ...(rawConfig && typeof rawConfig === "object" ? rawConfig : {}) };
  config.pollIntervalMs = Math.max(60 * 1000, Number(config.pollIntervalMs) || DEFAULTS.pollIntervalMs);

  let started = false;

  ctx.effect(() => {
    if (started) return () => {};
    started = true;
    const disposers = [];
    let stopped = false;

    const cleanup = () => {
      stopped = true;
      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {
          /* ignore */
        }
      }
    };

    // Listen for usage events immediately: records that arrive while the
    // async boot below is still opening the accumulator are buffered and
    // drained once it is ready, so no `assistant/message` is ever missed.
    const pendingRecords = [];
    let usageRef = null;
    const onSessionEvent = (session, event) => {
      const record = usageFromSessionEvent(session, event);
      if (!record) return;
      if (usageRef) usageRef.addRecord(record);
      else pendingRecords.push(record);
    };
    if (typeof ctx.on === "function") {
      disposers.push(ctx.on("session/event", onSessionEvent));
    }

    const run = async () => {
        try {
          const dataDir = await ensureDataDir(config.dataDir);
          await migrateLegacyState(dataDir);
          const usage = createUsageState(dataDir, config.historyHours);
          await usage.load();
          usageRef = usage;
          for (const record of pendingRecords.splice(0)) usage.addRecord(record);
          const balance = createBalanceStore({
            resolver: () => resolveApiKey(ctx, config),
            timeoutMs: config.timeoutMs,
          });

          const send = (res, payload) => writeRes(res, 200, { ok: true, value: payload });
          const sendError = (res, code, message, status = 500) =>
            writeRes(res, status, { ok: false, error: { code, message } });

          const snapshotNow = (now) => buildSnapshot({ balance, usage, config, now: now || Date.now() });

          // ---- routes (browser HUD) ----
          disposers.push(
            ctx.webServer.register({
              kind: "exact",
              path: "/dsh-usage/api/snapshot",
              handler: async (req, res) => {
                if (!fenceOk(req)) return sendError(res, "forbidden", "forbidden", 403);
                if (req.method !== "GET" && req.method !== "HEAD") {
                  return sendError(res, "method-not-allowed", "GET only", 405);
                }
                try {
                  send(res, snapshotNow());
                } catch (err) {
                  sendError(res, "handler-error", String((err && err.message) || err));
                }
              },
            }),
          );
          disposers.push(
            ctx.webServer.register({
              kind: "exact",
              path: "/dsh-usage/api/refresh",
              handler: async (req, res) => {
                if (!fenceOk(req)) return sendError(res, "forbidden", "forbidden", 403);
                if (req.method !== "POST") return sendError(res, "method-not-allowed", "POST only", 405);
                try {
                  await balance.poll();
                  await usage.save();
                  send(res, snapshotNow());
                } catch (err) {
                  sendError(res, "handler-error", String((err && err.message) || err));
                }
              },
            }),
          );

          // ---- self-rescheduling balance poller (timers are fiber-scoped) ----
          const runPoll = async () => {
            if (stopped) return;
            await balance.poll().catch(() => {});
            if (stopped) return;
            const delay = balance.nextDelayMs(config.pollIntervalMs);
            try {
              ctx.timeout(runPoll, delay);
            } catch {
              // timer service unexpectedly unavailable 鈫?degrade to a plain timer
              if (typeof setTimeout === "function") setTimeout(runPoll, delay);
            }
          };
          runPoll();

          // ---- history flush (fiber-scoped ctx.interval, injected via "timer") ----
          disposers.push(
            ctx.interval(() => {
              usage.save().catch(() => {});
            }, config.saveIntervalMs),
          );

          // ---- first flush (persist anything already accumulated) ----
          await usage.save().catch(() => {});
        } catch (err) {
          // Route/timer wiring failed; degrade to no-op instead of breaking boot.
          if (typeof console !== "undefined" && console.error) {
            console.error("[dsh-deepseek-usage-panel] host init failed:", err);
          }
        }
      };

      run();
      return cleanup;
    }, "dsh-deepseek-usage-panel: host half");
}

export { resolveApiKey };

