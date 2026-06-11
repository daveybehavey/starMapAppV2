import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHdCreditCompensate,
  applyHdCreditConsume,
  fulfillHdDownloadAfterTrigger,
  HD_CREDIT_COMPENSATE_WINDOW_MS,
} from "../../src/lib/entitlementConsume.mjs";

test("applyHdCreditConsume decrements once and is idempotent per token", () => {
  const token = "consume-token-1";
  const base = { paid: true, plan: "single", creditsRemaining: 1, creditsTotal: 1 };

  const first = applyHdCreditConsume(base, token);
  assert.equal(first.ok, true);
  assert.equal(first.idempotent, false);
  assert.equal(first.creditsRemaining, 0);

  const second = applyHdCreditConsume(first.record, token);
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, true);
  assert.equal(second.creditsRemaining, 0);
});

test("applyHdCreditConsume blocks second export when single-plan credit is exhausted", () => {
  const exhausted = { paid: true, plan: "single", creditsRemaining: 0, creditsTotal: 1, lastConsumeToken: "used" };
  const blocked = applyHdCreditConsume(exhausted, "new-token");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "no_credits");
});

test("applyHdCreditCompensate restores one credit within window", () => {
  const now = 1_000_000;
  const token = "consume-token-restore";
  const consumed = applyHdCreditConsume(
    { paid: true, plan: "single", creditsRemaining: 1, creditsTotal: 1 },
    token,
  );
  assert.equal(consumed.ok, true);

  const restored = applyHdCreditCompensate(consumed.record, token, now + 1000, HD_CREDIT_COMPENSATE_WINDOW_MS);
  assert.equal(restored.ok, true);
  assert.equal(restored.creditsRemaining, 1);
  assert.equal(restored.idempotent, false);

  const again = applyHdCreditCompensate(restored.record, token, now + 2000, HD_CREDIT_COMPENSATE_WINDOW_MS);
  assert.equal(again.ok, true);
  assert.equal(again.idempotent, true);
});

test("applyHdCreditCompensate rejects expired window", () => {
  const token = "expired-token";
  const consumed = applyHdCreditConsume(
    { paid: true, plan: "single", creditsRemaining: 1, creditsTotal: 1 },
    token,
  );
  const lastAt = consumed.record.lastConsumeAt;
  const restored = applyHdCreditCompensate(
    consumed.record,
    token,
    lastAt + HD_CREDIT_COMPENSATE_WINDOW_MS + 1,
  );
  assert.equal(restored.ok, false);
  assert.equal(restored.error, "window_expired");
});

test("fulfillHdDownloadAfterTrigger skips consume when trigger fails", async () => {
  let consumeCalls = 0;
  const result = await fulfillHdDownloadAfterTrigger({
    triggerDownload: () => ({ ok: false, error: "blocked" }),
    consumeCredit: async () => {
      consumeCalls += 1;
      return { ok: true, creditsRemaining: 0, consumeToken: "x" };
    },
  });
  assert.equal(result.status, "trigger_failed");
  assert.equal(result.consumed, false);
  assert.equal(consumeCalls, 0);
});

test("fulfillHdDownloadAfterTrigger consumes once on happy path", async () => {
  let consumeCalls = 0;
  const result = await fulfillHdDownloadAfterTrigger({
    triggerDownload: () => ({ ok: true }),
    consumeCredit: async () => {
      consumeCalls += 1;
      return { ok: true, creditsRemaining: 0, plan: "single", consumeToken: "happy" };
    },
  });
  assert.equal(result.status, "success");
  assert.equal(result.consumed, true);
  assert.equal(consumeCalls, 1);
});

test("fulfillHdDownloadAfterTrigger allows retry after trigger failure", async () => {
  let attempts = 0;
  const first = await fulfillHdDownloadAfterTrigger({
    triggerDownload: () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, error: "blocked" } : { ok: true };
    },
    consumeCredit: async () => ({ ok: true, creditsRemaining: 0, consumeToken: "retry" }),
  });
  assert.equal(first.status, "trigger_failed");

  const second = await fulfillHdDownloadAfterTrigger({
    triggerDownload: () => ({ ok: true }),
    consumeCredit: async () => ({ ok: true, creditsRemaining: 0, consumeToken: "retry" }),
  });
  assert.equal(second.status, "success");
});
