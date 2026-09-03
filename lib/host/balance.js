// dsh-usage-hud · balance polling against the official DeepSeek balance API.
//
// Endpoint (official): GET {baseURL}/user/balance  (baseURL defaults to
// https://api.deepseek.com) with `Authorization: Bearer <api key>`.
// Response: { is_available, balance_infos: [{ currency, total_balance,
// granted_balance, topped_up_balance }] } — amounts serialized as strings.
//
// The API key never leaves the host half; the browser only ever receives the
// parsed numbers via the snapshot route.

const BACKOFF_CAP_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;

const EMPTY = {
  configured: false,
  currency: null,
  totalBalance: null,
  grantedBalance: null,
  toppedUpBalance: null,
  isAvailable: null,
  updatedAt: null,
  lastOkAt: null,
  lastAttemptAt: null,
  error: null,
};

export function createBalanceStore({ resolver, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const state = { ...EMPTY };
  let failureStreak = 0;

  function fail(code, message, now) {
    state.lastAttemptAt = now;
    state.error = { code, message };
    failureStreak += 1;
    return { ...state };
  }

  function ok(entry, isAvailable, now) {
    state.configured = true;
    state.currency = entry.currency || state.currency;
    state.totalBalance = entry.total_balance ?? state.totalBalance;
    state.grantedBalance = entry.granted_balance ?? state.grantedBalance;
    state.toppedUpBalance = entry.topped_up_balance ?? state.toppedUpBalance;
    state.isAvailable = isAvailable;
    state.updatedAt = new Date(now).toISOString();
    state.lastOkAt = new Date(now).toISOString();
    state.lastAttemptAt = new Date(now).toISOString();
    state.error = null;
    failureStreak = 0;
    return { ...state };
  }

  /** Suggested delay until the next poll (grows on failure, caps out). */
  function nextDelayMs(baseMs) {
    if (failureStreak <= 0) return baseMs;
    const grow = baseMs * 2 ** Math.min(failureStreak, 6);
    return Math.min(grow, BACKOFF_CAP_MS);
  }

  /** Poll once. Never throws — errors land in `state.error`. */
  async function poll() {
    const now = Date.now();
    let resolved = null;
    try {
      resolved = await resolver();
    } catch {
      resolved = null;
    }
    const key = resolved && resolved.apiKey;
    if (!key) {
      return fail(
        "no-key",
        "No DeepSeek API key found. Add DEEPSEEK_API_KEY to ~/.dsh/.credentials.yaml or set DSH_USAGE_HUD_API_KEY.",
        now,
      );
    }
    const baseURL = String(resolved.baseURL || "https://api.deepseek.com").replace(/\/+$/, "");
    let res;
    try {
      res = await fetchImpl(`${baseURL}/user/balance`, {
        method: "GET",
        headers: { authorization: `Bearer ${key}`, accept: "application/json" },
        signal: typeof AbortSignal !== "undefined" ? AbortSignal.timeout(timeoutMs) : undefined,
        cache: "no-store",
      });
    } catch (err) {
      const name = err && err.name;
      if (name === "TimeoutError" || name === "AbortError") {
        return fail("timeout", `Balance request timed out after ${timeoutMs} ms.`, now);
      }
      return fail("network", `Balance request failed: ${err && err.message ? err.message : String(err)}`, now);
    }
    if (res.status === 401) {
      failureStreak = 0;
      return fail("unauthorized", "Balance API rejected the key (401). Rotate it in ~/.dsh/.credentials.yaml.", now);
    }
    if (res.status === 429) {
      return fail("rate-limited", "Balance API rate limited (429). Will retry with backoff.", now);
    }
    if (!res.ok) {
      return fail("http", `Balance API responded ${res.status}.`, now);
    }
    let body;
    try {
      body = await res.json();
    } catch {
      return fail("bad-body", "Balance API returned a non-JSON body.", now);
    }
    const infos = body && Array.isArray(body.balance_infos) ? body.balance_infos : [];
    const entry =
      infos.find((x) => x && x.currency === "CNY") ||
      infos.find((x) => x && x.currency === "USD") ||
      infos[0];
    if (!entry) {
      return fail("bad-body", "Balance API response had no balance_infos.", now);
    }
    return ok(entry, body.is_available !== false, now);
  }

  function snapshot() {
    return { ...state };
  }

  return { poll, snapshot, nextDelayMs };
}
