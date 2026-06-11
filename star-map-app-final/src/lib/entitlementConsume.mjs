/**
 * Pure HD credit consume / compensate helpers (unit-tested).
 * @typedef {import("./pricing").CheckoutPlan} CheckoutPlan
 */

/** Window in which a failed delivery can restore the last consumed credit. */
export const HD_CREDIT_COMPENSATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * @param {{
 *   paid?: boolean;
 *   revoked?: boolean;
 *   plan?: CheckoutPlan;
 *   creditsRemaining?: number;
 *   creditsTotal?: number;
 *   lastConsumeToken?: string;
 *   lastConsumeRemaining?: number;
 *   lastConsumeAt?: number;
 *   lastCompensatedToken?: string;
 * }} record
 * @param {string | null | undefined} consumeToken
 */
export function applyHdCreditConsume(record, consumeToken) {
  if (record.revoked) {
    return { ok: false, error: "revoked" };
  }

  if (record.plan === "subscription") {
    if (!record.subscriptionActive && !record.paid) {
      return { ok: false, error: "subscription_inactive" };
    }
    return { ok: true, record, plan: "subscription", creditsRemaining: null, idempotent: false };
  }

  if (consumeToken && record.lastConsumeToken === consumeToken) {
    return {
      ok: true,
      record,
      plan: record.plan ?? "single",
      creditsRemaining:
        typeof record.lastConsumeRemaining === "number" ? record.lastConsumeRemaining : record.creditsRemaining ?? 0,
      idempotent: true,
    };
  }

  const creditsRemaining = record.creditsRemaining ?? 0;
  if (creditsRemaining <= 0) {
    return { ok: false, error: "no_credits" };
  }

  const nextRemaining = Math.max(0, creditsRemaining - 1);
  const nextRecord = {
    ...record,
    creditsRemaining: nextRemaining,
    paid: true,
    lastConsumeToken: consumeToken ?? record.lastConsumeToken,
    lastConsumeRemaining: nextRemaining,
    lastConsumeAt: Date.now(),
  };

  return {
    ok: true,
    record: nextRecord,
    plan: record.plan ?? "single",
    creditsRemaining: nextRemaining,
    idempotent: false,
  };
}

/**
 * Restore one HD credit after a confirmed consume when delivery did not succeed.
 * @param {Parameters<typeof applyHdCreditConsume>[0]} record
 * @param {string} token
 * @param {number} [now]
 * @param {number} [windowMs]
 */
export function applyHdCreditCompensate(record, token, now = Date.now(), windowMs = HD_CREDIT_COMPENSATE_WINDOW_MS) {
  if (record.revoked) {
    return { ok: false, error: "revoked" };
  }
  if (record.plan === "subscription") {
    return { ok: false, error: "subscription" };
  }
  if (!token || record.lastConsumeToken !== token) {
    return { ok: false, error: "token_mismatch" };
  }
  if (record.lastCompensatedToken === token) {
    return {
      ok: true,
      record,
      plan: record.plan ?? "single",
      creditsRemaining: record.creditsRemaining ?? 0,
      idempotent: true,
    };
  }

  const lastConsumeAt = typeof record.lastConsumeAt === "number" ? record.lastConsumeAt : 0;
  if (!lastConsumeAt || now - lastConsumeAt > windowMs) {
    return { ok: false, error: "window_expired" };
  }

  const current = record.creditsRemaining ?? 0;
  const total = typeof record.creditsTotal === "number" ? record.creditsTotal : null;
  const nextRemaining = total === null ? current + 1 : Math.min(total, current + 1);

  const nextRecord = {
    ...record,
    creditsRemaining: nextRemaining,
    paid: true,
    lastCompensatedToken: token,
  };

  return {
    ok: true,
    record: nextRecord,
    plan: record.plan ?? "single",
    creditsRemaining: nextRemaining,
    idempotent: false,
  };
}

/**
 * Client/server orchestration: trigger download first, consume credit only after.
 * @param {{
 *   triggerDownload: () => { ok: boolean; error?: string };
 *   consumeCredit: () => Promise<{ ok: boolean; creditsRemaining?: number | null; plan?: CheckoutPlan | null; consumeToken?: string } | false>;
 * }} steps
 */
export async function fulfillHdDownloadAfterTrigger(steps) {
  const trigger = steps.triggerDownload();
  if (!trigger.ok) {
    return {
      status: "trigger_failed",
      consumed: false,
      message: "export_trigger_failed",
      triggerError: trigger.error ?? null,
    };
  }

  const consumed = await steps.consumeCredit();
  if (!consumed || consumed.ok === false) {
    return {
      status: "consume_failed",
      consumed: false,
      message: "consume_after_trigger_failed",
      creditLikelyAvailable: true,
    };
  }

  return {
    status: "success",
    consumed: true,
    creditsRemaining: consumed.creditsRemaining ?? null,
    plan: consumed.plan ?? null,
    consumeToken: consumed.consumeToken ?? null,
  };
}
