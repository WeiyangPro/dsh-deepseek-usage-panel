// dsh-usage-panel · assemble the JSON snapshot served to the browser panel.
//
// Contract: schema "dsh-usage-panel/snapshot@1" — see docs/DESIGN.md.
// All numbers for tokens are integers; balance amounts are strings exactly as
// the DeepSeek API returned them (client formats them with the currency).
//
// Only OFFICIAL balance fields from GET /user/balance are shown (total /
// topped-up). No locally estimated spend is produced — DeepSeek's public API
// does not expose a cumulative-spend field, so the panel deliberately omits it.
export function buildSnapshot({ balance, usage, config = {}, now = Date.now() } = {}) {
  const summary = usage ? usage.currentSummary(now) : emptySummary();
  const bal = balance && typeof balance.snapshot === "function" ? balance.snapshot() : balance || {};

  return {
    schema: "dsh-usage-panel/snapshot@1",
    generatedAt: new Date(now).toISOString(),
    balance: {
      configured: bal.configured !== false,
      currency: bal.currency || null,
      totalBalance: bal.totalBalance ?? null,
      grantedBalance: bal.grantedBalance ?? null,
      toppedUpBalance: bal.toppedUpBalance ?? null,
      isAvailable: bal.isAvailable ?? null,
      updatedAt: bal.updatedAt || null,
      lastOkAt: bal.lastOkAt || null,
      lastAttemptAt: bal.lastAttemptAt || null,
      error: bal.error || null,
    },
    day: summary.day,
    byModel: summary.byModel,
    history: summary.history,
    historyByModel: summary.historyByModel || [],
    lastSession: summary.lastSession,
    lastTurn: summary.lastTurn || null,
    meta: {
      pollIntervalMs: Number(config.pollIntervalMs) || 300000,
      historyHours: Number(config.historyHours) || 72,
    },
  };
}

function emptySummary() {
  return {
    day: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0 },
    byModel: [],
    history: [],
    lastSession: null,
  };
}
