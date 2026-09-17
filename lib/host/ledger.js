// dsh-deepseek-usage-panel · balance-observation ledger (account-scoped).
//
// The official balance API is a snapshot, not a transaction API: DeepSeek
// exposes no spend/recharge ledger. Following the whale-widget's accounting
// design, we track the OBSERVED balance per local day:
//
//   - balance goes DOWN  → accumulated as observed consumption (debit)
//   - balance goes UP    → recorded as credit (recharge/grant) and flagged
//                          "needs review" — it never cancels existing debits
//   - a manual correction (reconcile) fills in "actual credits received" and
//     "other non-call debits" for the day, producing the corrected consumption
//
// All money math is fixed-point: amounts are integers in 1e-8 units, so no
// floating-point drift. The ledger is persisted to ledger.json next to
// state.json (separate file so the token accumulator stays untouched).
import { join } from "node:path";
import { readJson, writeJsonAtomic } from "./util.js";

const SCALE = 100000000;
const LEDGER_FILE = "ledger.json";
const LEDGER_VERSION = 1;
const MAX_DAYS = 60;

export function moneyUnits(value) {
  const n = Number(value);
  const units = Math.round(n * SCALE);
  if (!Number.isFinite(n) || !Number.isSafeInteger(units)) {
    const err = new Error("金额无效或超出可记账范围");
    err.status = 400;
    throw err;
  }
  return units;
}
export function preciseMoney(units) {
  return units / SCALE;
}

function localDay(time = Date.now()) {
  const d = new Date(time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function validCurrency(currency) {
  const c = String(currency || "CNY").toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) {
    const err = new Error("余额币种无效");
    err.status = 400;
    throw err;
  }
  return c;
}

export function createLedger(dataDir) {
  let loaded = false;
  let books = {}; // currency → { currency, days: { day → row } }
  let active = null; // last seen currency
  let lastAt = 0; // last observed timestamp (dedupe out-of-order samples)

  async function load() {
    if (loaded) return;
    loaded = true;
    const data = await readJson(join(dataDir, LEDGER_FILE), null);
    if (!data || data.v !== LEDGER_VERSION || !data.books) return;
    for (const currency of Object.keys(data.books)) {
      const rawBook = data.books[currency];
      if (!rawBook || typeof rawBook.days !== "object" || rawBook.days === null) continue;
      const days = {};
      for (const day of Object.keys(rawBook.days)) {
        const r = rawBook.days[day];
        if (!r || typeof r.day !== "string") continue;
        days[day] = {
          day: r.day,
          currency: r.currency || currency,
          firstAt: Number(r.firstAt) || 0,
          lastAt: Number(r.lastAt) || 0,
          openingUnits: Number(r.openingUnits) || 0,
          lastUnits: Number(r.lastUnits) || 0,
          debitUnits: Number(r.debitUnits) || 0,
          creditUnits: Number(r.creditUnits) || 0,
          revision: Number(r.revision) || 0,
          correction: r.correction && typeof r.correction === "object"
            ? {
                at: Number(r.correction.at) || 0,
                creditsUnits: Number(r.correction.creditsUnits) || 0,
                otherDebitsUnits: Number(r.correction.otherDebitsUnits) || 0,
                amountUnits: Number(r.correction.amountUnits) || 0,
              }
            : null,
          correctionLog: Array.isArray(r.correctionLog) ? r.correctionLog.slice(-50) : [],
        };
      }
      books[currency] = { currency, days };
      active = active || currency;
      for (const d of Object.keys(days)) lastAt = Math.max(lastAt, days[d].lastAt);
    }
  }

  function prune() {
    const keep = [];
    for (const book of Object.values(books)) {
      for (const day of Object.keys(book.days)) keep.push(book.days[day]);
    }
    keep.sort((a, b) => (a.lastAt || 0) - (b.lastAt || 0));
    if (keep.length <= MAX_DAYS) return;
    const drop = keep.slice(0, keep.length - MAX_DAYS);
    for (const row of drop) {
      const book = books[row.currency || active];
      if (book && book.days[row.day]) delete book.days[row.day];
    }
  }

  async function save() {
    prune();
    const payload = { v: LEDGER_VERSION, savedAt: new Date().toISOString(), books };
    await writeJsonAtomic(join(dataDir, LEDGER_FILE), payload);
  }

  function bookFor(currency) {
    if (!books[currency]) books[currency] = { currency, days: {} };
    return books[currency];
  }

  function currentRow(day = localDay()) {
    const book = active ? books[active] : null;
    return book && book.days[day] ? book.days[day] : null;
  }

  function summary(day = localDay()) {
    const row = currentRow(day);
    if (!row) return null;
    const book = books[active];
    const correction = row.correction;
    const needsReview = row.creditUnits > (correction ? correction.creditUnits : 0);
    const amountUnits = correction ? correction.amountUnits : row.debitUnits;
    const source = needsReview ? "balance-needs-review" : correction ? "balance-corrected" : "balance-observed";
    const label = needsReview
      ? "已观测消费 · 待核对余额调整"
      : correction
        ? "已校正消费（余额口径）"
        : "已观测消费（余额口径）";
    return {
      day,
      amount: preciseMoney(amountUnits),
      currency: book.currency,
      source,
      label,
      needsReview,
      openingBalance: preciseMoney(row.openingUnits),
      currentBalance: preciseMoney(row.lastUnits),
      observedDecrease: preciseMoney(row.debitUnits),
      observedIncrease: preciseMoney(row.creditUnits),
      firstObservedAt: row.firstAt,
      lastObservedAt: row.lastAt,
      revision: revisionOf(row), // 完整修订串（客户端回传用于 409 乐观并发校验）
      credits: correction ? preciseMoney(correction.creditsUnits) : null,
      otherDebits: correction ? preciseMoney(correction.otherDebitsUnits) : null,
      correctedAt: correction ? correction.at : null,
    };
  }

  /**
   * Observe one balance sample. Returns the summary for the sample's day.
   * Mutates the in-memory ledger; caller decides when to save().
   */
  function observe(snapshot) {
    const at = Number(snapshot.at);
    if (!Number.isFinite(at) || at <= 0) {
      const err = new Error("观测时间无效");
      err.status = 400;
      throw err;
    }
    const units = moneyUnits(snapshot.balance);
    const currency = validCurrency(snapshot.currency || "CNY");
    const day = localDay(at);
    const book = bookFor(currency);
    // Out-of-order / duplicate samples (incl. a late sample from a past day).
    if (at <= lastAt) return summary(day);
    lastAt = at;
    active = currency;
    let row = book.days[day];
    if (!row) {
      row = book.days[day] = {
        day, currency, firstAt: at, lastAt: at,
        openingUnits: units, lastUnits: units,
        debitUnits: 0, creditUnits: 0, revision: 0,
        correction: null, correctionLog: [],
      };
    } else {
      const delta = row.lastUnits - units;
      if (delta > 0) row.debitUnits += delta; // balance decreased → consumption
      if (delta < 0) row.creditUnits -= delta; // balance increased → recharge (needs review)
      row.lastUnits = units;
      row.lastAt = at;
    }
    return summary(day);
  }

  function adjustmentUnits(value, required) {
    if (value === "" || value === null || value === undefined) {
      if (required) {
        const err = new Error("请填写本统计区间的累计到账金额，未充值请填 0");
        err.status = 400;
        throw err;
      }
      return 0;
    }
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(String(value))) {
      const err = new Error("金额须为非负数，最多保留 8 位小数");
      err.status = 400;
      throw err;
    }
    const units = moneyUnits(value);
    if (units < 0) {
      const err = new Error("金额不能为负数");
      err.status = 400;
      throw err;
    }
    return units;
  }

  function revisionOf(row) {
    return [active, row.day, row.firstAt, row.lastUnits, row.debitUnits, row.creditUnits, row.revision || 0].join(":");
  }

  /**
   * Manual correction for one day: user fills in "credits actually received"
   * and "other non-call debits" for the observation window.
   */
  function reconcile(input, now = Date.now()) {
    const day = String(input.day || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const err = new Error("请选择有效的记账日期");
      err.status = 400;
      throw err;
    }
    const book = active ? books[active] : null;
    const row = book && book.days[day];
    if (!row) {
      const err = new Error("这一天没有余额观测记录，无法校正");
      err.status = 400;
      throw err;
    }
    if (input.revision !== revisionOf(row)) {
      const err = new Error("余额或校正记录已更新，请重新核对金额");
      err.status = 409;
      throw err;
    }
    if (input.action !== "reset" && input.confirmed !== true) {
      const err = new Error("请先确认已核对本统计区间的全部余额调整");
      err.status = 400;
      throw err;
    }
    let correction = null;
    if (input.action !== "reset") {
      const creditsUnits = adjustmentUnits(input.credits, true);
      const otherDebitsUnits = adjustmentUnits(input.otherDebits);
      const amountUnits = row.openingUnits + creditsUnits - otherDebitsUnits - row.lastUnits;
      if (!Number.isSafeInteger(amountUnits) || amountUnits < 0) {
        const err = new Error("校正后消费为负或超出范围，请核对统计起点与累计到账金额");
        err.status = 400;
        throw err;
      }
      correction = {
        at: Number(now),
        creditsUnits,
        otherDebitsUnits,
        amountUnits,
      };
    }
    row.correctionLog.push({ at: Number(now), previous: row.correction, next: correction });
    if (row.correctionLog.length > 50) row.correctionLog.splice(0, row.correctionLog.length - 50);
    row.correction = correction;
    row.revision = (row.revision || 0) + 1;
    return summary(day);
  }

  return { load, save, observe, reconcile, summary };
}
