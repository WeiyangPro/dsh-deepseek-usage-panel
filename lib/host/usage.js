// dsh-usage-hud · rolling token-usage accumulator.
//
// DeepSeek has no public usage-history REST API, so all usage numbers are
// measured locally from the harness's own session events:
//
//   ctx.on("session/event", (session, event) => …)
//
// and only the `assistant/message` event is consumed. Verified live event
// shape (dsh 0.1.1-rc.2):
//
//   { type: "assistant/message", time: <ms>, data: {
//       message: { …, source: { kind, provider, model } },
//       usage:   { inputTokens, outputTokens, cacheReadTokens,
//                  cacheWriteTokens?, reasoningTokens? } } }
//
// TokenUsage fields are DISJOINT: inputTokens is the uncached input,
// cacheReadTokens the context-cache hits, outputTokens includes reasoning.
//
// Records are bucketed by (local hour, model) and rolled into a bounded JSON
// state file under the plugin data dir (state.json). Everything shown in the
// HUD (today / 24 h trend / per-model) is derived from these buckets. Hour
// buckets align to local wall-clock hour boundaries (see util.hourStart) so
// chart labels match the aggregated slots.
import { join } from "node:path";
import { hourStart, dayStartLocal, readJson, writeJsonAtomic } from "./util.js";

const STATE_FILE = "state.json";
const STATE_VERSION = 1;

export function createUsageState(dataDir, historyHours = 72) {
  const buckets = new Map(); // key `${hourMs}|${model}` → bucket
  const sessions = new Map(); // sessionId → latest per-session totals
  let loaded = false;

  function keyOf(h, model) {
    return `${h}|${model || "unknown"}`;
  }

  function addRecord({ t = Date.now(), sessionId = "?", model = null, usage = {} } = {}) {
    const h = hourStart(t);
    const m = model || "unknown";
    const k = keyOf(h, m);
    let b = buckets.get(k);
    if (!b) {
      b = { h, m, i: 0, o: 0, cr: 0, cw: 0, n: 0, last: t };
      buckets.set(k, b);
    }
    const input = Number(usage.inputTokens) || 0;
    const output = Number(usage.outputTokens) || 0;
    const cacheRead = Number(usage.cacheReadTokens) || 0;
    const cacheWrite = Number(usage.cacheWriteTokens) || 0;
    b.i += input;
    b.o += output;
    b.cr += cacheRead;
    b.cw += cacheWrite;
    b.n += 1;
    b.last = Math.max(b.last, t);

    const sid = typeof sessionId === "string" && sessionId ? sessionId : "session";
    let s = sessions.get(sid);
    if (!s) {
      s = { id: sid, m: m, i: 0, o: 0, cr: 0, cw: 0, n: 0, first: t, last: t };
      sessions.set(sid, s);
    }
    s.i += input;
    s.o += output;
    s.cr += cacheRead;
    s.cw += cacheWrite;
    s.n += 1;
    s.m = m;
    s.last = Math.max(s.last, t);

    prune(historyHours, t);
  }

  /** Drop buckets older than historyHours and stale session entries. */
  function prune(hours, now = Date.now()) {
    const cutoff = now - hours * 3600000;
    for (const [k, b] of buckets) if (b.h < cutoff) buckets.delete(k);
    const sessionCutoff = now - 48 * 3600000;
    for (const [id, s] of sessions) if (s.last < sessionCutoff) sessions.delete(id);
    if (sessions.size > 40) {
      const sorted = [...sessions.values()].sort((a, b) => b.last - a.last);
      for (const s of sorted.slice(40)) sessions.delete(s.id);
    }
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    const data = await readJson(join(dataDir, STATE_FILE), null);
    if (!data || data.v !== STATE_VERSION || !Array.isArray(data.buckets)) return;
    for (const raw of data.buckets) {
      if (!raw || typeof raw.h !== "number" || typeof raw.m !== "string") continue;
      const b = {
        h: raw.h,
        m: raw.m,
        i: Number(raw.i) || 0,
        o: Number(raw.o) || 0,
        cr: Number(raw.cr) || 0,
        cw: Number(raw.cw) || 0,
        n: Number(raw.n) || 0,
        last: Number(raw.last) || raw.h,
      };
      const k = keyOf(b.h, b.m);
      const prev = buckets.get(k);
      if (prev) {
        prev.i += b.i; prev.o += b.o; prev.cr += b.cr; prev.cw += b.cw; prev.n += b.n;
        prev.last = Math.max(prev.last, b.last);
      } else {
        buckets.set(k, b);
      }
    }
    if (Array.isArray(data.sessions)) {
      for (const raw of data.sessions) {
        if (!raw || typeof raw.id !== "string") continue;
        const s = {
          id: raw.id, m: raw.m || "unknown",
          i: Number(raw.i) || 0, o: Number(raw.o) || 0,
          cr: Number(raw.cr) || 0, cw: Number(raw.cw) || 0,
          n: Number(raw.n) || 0,
          first: Number(raw.first) || 0, last: Number(raw.last) || 0,
        };
        sessions.set(s.id, s);
      }
    }
    prune(historyHours);
  }

  async function save() {
    prune(historyHours);
    const payload = {
      v: STATE_VERSION,
      savedAt: new Date().toISOString(),
      buckets: [...buckets.values()].sort((a, b) => a.h - b.h || (a.m < b.m ? -1 : a.m > b.m ? 1 : 0)),
      sessions: [...sessions.values()].sort((a, b) => b.last - a.last),
    };
    await writeJsonAtomic(join(dataDir, STATE_FILE), payload);
  }

  /**
   * Derive the client-facing usage summary at time `now`:
   *  - history: hourly totals merged across models for the last 24 h (asc)
   *  - byModel: per-model totals for the local calendar day
   *  - day:     aggregate totals for the local calendar day
   *  - lastSession: most recent session (active when seen < 20 min ago)
   */
  function currentSummary(now = Date.now()) {
    const day0 = dayStartLocal(now);
    const h24 = now - 24 * 3600000;

    const history = [];
    const merged = new Map();
    const day = { i: 0, o: 0, cr: 0, cw: 0, n: 0 };
    const byModel = new Map();

    for (const b of buckets.values()) {
      if (b.h >= h24) {
        const m = merged.get(b.h);
        if (m) {
          m.i += b.i; m.o += b.o; m.cr += b.cr; m.cw += b.cw; m.n += b.n;
        } else {
          merged.set(b.h, { h: b.h, i: b.i, o: b.o, cr: b.cr, cw: b.cw, n: b.n });
        }
      }
      if (b.h >= day0) {
        day.i += b.i; day.o += b.o; day.cr += b.cr; day.cw += b.cw; day.n += b.n;
        const bm = byModel.get(b.m) || { model: b.m, i: 0, o: 0, cr: 0, cw: 0, n: 0 };
        bm.i += b.i; bm.o += b.o; bm.cr += b.cr; bm.cw += b.cw; bm.n += b.n;
        byModel.set(b.m, bm);
      }
    }

    for (const [h, m] of merged) {
      history.push({ t: h, inputTokens: m.i, outputTokens: m.o, cacheReadTokens: m.cr, cacheWriteTokens: m.cw, calls: m.n });
    }
    history.sort((a, b) => a.t - b.t);

    const modelList = [...byModel.values()]
      .map((m) => ({ model: m.model, inputTokens: m.i, outputTokens: m.o, cacheReadTokens: m.cr, cacheWriteTokens: m.cw, calls: m.n }))
      .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));

    let lastSession = null;
    const recent = [...sessions.values()].sort((a, b) => b.last - a.last)[0];
    if (recent) {
      lastSession = {
        id: recent.id,
        model: recent.m,
        inputTokens: recent.i,
        outputTokens: recent.o,
        cacheReadTokens: recent.cr,
        cacheWriteTokens: recent.cw,
        calls: recent.n,
        lastAt: recent.last,
        active: now - recent.last < 20 * 60 * 1000,
      };
    }

    return {
      day: { inputTokens: day.i, outputTokens: day.o, cacheReadTokens: day.cr, cacheWriteTokens: day.cw, calls: day.n },
      byModel: modelList,
      history,
      lastSession,
    };
  }

  return { addRecord, load, save, currentSummary, prune };
}

/** Adapt a raw session/event payload into a usage record (safe on odd shapes). */
export function usageFromSessionEvent(session, event) {
  if (!event || event.type !== "assistant/message") return null;
  const data = event.data;
  if (!data || !data.usage) return null;
  const usage = data.usage;
  const model =
    data.message && data.message.source && typeof data.message.source.model === "string"
      ? data.message.source.model
      : null;
  const sid =
    typeof session === "string"
      ? session
      : session && (session.id || session.sessionId)
        ? String(session.id || session.sessionId)
        : "session";
  return {
    t: typeof event.time === "number" ? event.time : Date.now(),
    sessionId: sid,
    model,
    usage,
  };
}
