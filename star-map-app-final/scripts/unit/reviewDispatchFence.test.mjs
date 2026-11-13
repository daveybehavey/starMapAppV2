import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./tsAliasLoader.mjs", import.meta.url);
const { executeReviewDispatch } = await import("../../src/lib/reviewRequestSuppression.ts");
const { createSendCapClient } = await import("../../src/lib/sharedSendCap.ts");
const { reserveSendSlot, settleSendSlot } = await import("../../src/lib/sharedSendCapState.ts");
const { applyReviewLedgerOp, createEmptyReviewLedgerState } = await import("../../src/lib/reviewRequestLedgerState.ts");

const NOW = Date.UTC(2026, 10, 13);
const input = { sessionId: "review-fence-fixture", claimId: "claim" };
const refused = { outcome: "refused", reason: "promotion_dispatch_disabled" };

async function fixture() {
  const payload = {
    to: "buyer@example.invalid", from: "shop@example.invalid", replyTo: null,
    subject: "Review", text: "Review", html: "<p>Review</p>", headers: {},
    idempotencyKey: "review-fence-fixture", tags: { type: "review_request", kind: "digital" },
  };
  let row = createEmptyReviewLedgerState(input.sessionId);
  const ledger = {
    async getState() { return row; },
    async apply(id, op) {
      assert.equal(id, input.sessionId);
      const result = applyReviewLedgerOp(row, op);
      row = result.state;
      return result;
    },
  };
  assert.equal((await ledger.apply(input.sessionId, {
    type: "begin_claim", claimId: input.claimId, kind: "digital",
    email: payload.to, anchorAt: NOW - 4 * 86400000, dueAt: NOW - 86400000,
    eligibilityEndsAt: NOW + 86400000, payload, now: NOW,
  })).outcome, "claimed");
  // A pre-existing charged slot makes a mistaken refund/reset observable.
  let state = { kind: "send_cap", slots: [
    { id: "prior", family: "promotion", reservedAt: NOW - 1, attemptedAt: NOW - 1 },
  ] };
  const prior = structuredClone(state);
  const calls = [];
  const sends = [];
  let capConfigured = true;
  const env = {
    PROMOTION_DISPATCH_ENABLED: "true",
    SEND_CAP_SERVICE: {
      async fetch(request) {
        const op = new URL(request.url).pathname;
        calls.push(op);
        const body = await request.json();
        if (op === "/peek") return Response.json(capConfigured
          ? { permitted: true } : { permitted: false, reason: "send_cap_unset" });
        if (op === "/reserve") {
          assert.equal(body.family, "review");
          const result = reserveSendSlot(state, { id: body.idempotencyKey, family: body.family, now: NOW, cap: 25 });
          state = result.state;
          assert.equal(result.reserved, true);
          return Response.json({ permitted: true, reservation: { id: body.idempotencyKey, reservedAt: NOW } });
        }
        assert.ok(op === "/release" || op === "/commit");
        state = settleSendSlot(state, { id: body.id, attemptedAt: op === "/release" ? null : body.attemptedAt, now: NOW });
        return Response.json({ persisted: true });
      },
    },
  };
  const deps = {
    env, ledger, sendCap: createSendCapClient(env), now: () => NOW,
    isSuppressed: async () => false,
    checkEligibility: async () => ({ status: "eligible" }),
    send: async (message) => { sends.push(message); return { ok: true, id: "fake-provider" }; },
  };
  return { env, deps, calls, sends, prior, payload, state: () => state, row: () => row,
    unsetCap: () => { capConfigured = false; } };
}

test("review fence A: disabled before dispatch never reserves or sends", async () => {
  const h = await fixture();
  h.env.PROMOTION_DISPATCH_ENABLED = "false";
  assert.deepEqual(await executeReviewDispatch(input, h.deps), refused);
  assert.equal(h.sends.length, 0);
  assert.deepEqual(h.state(), h.prior);
  // This trace assertion kills removal of the pre-check even if the final
  // recheck would subsequently refund the unused slot.
  assert.equal(h.calls.includes("/reserve"), false);
  assert.equal(h.row().status, "claimed");
});

test("review fence B: closes while eligibility awaits after reservation", async () => {
  const h = await fixture();
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  let resume;
  const blocked = new Promise(resolve => { resume = resolve; });
  h.deps.checkEligibility = async () => {
    entered();
    await blocked;
    return { status: "eligible" };
  };
  const attempt = executeReviewDispatch(input, h.deps);
  await waiting;
  assert.equal(h.row().status, "dispatching");
  assert.equal(h.state().slots.length, h.prior.slots.length + 1);
  assert.equal(h.state().slots.at(-1).attemptedAt, null);
  h.env.PROMOTION_DISPATCH_ENABLED = "false";
  resume();
  assert.deepEqual(await attempt, refused);
  assert.equal(h.sends.length, 0);
  assert.deepEqual(h.state(), h.prior);
  assert.equal(h.calls.filter(op => op === "/release").length, 1);
  assert.equal(h.calls.includes("/commit"), false);
  assert.equal(h.row().status, "failed");
  assert.equal(h.row().lastError, "promotion_dispatch_disabled");
});

test("review fence: closes during final suppression await", async () => {
  const h = await fixture();
  let checks = 0;
  h.deps.isSuppressed = async () => {
    if (++checks === 2) h.env.PROMOTION_DISPATCH_ENABLED = "false";
    return false;
  };
  assert.deepEqual(await executeReviewDispatch(input, h.deps), refused);
  assert.equal(h.sends.length, 0);
  assert.deepEqual(h.state(), h.prior);
});

test("review fence: open throughout sends frozen payload once and commits one review slot", async () => {
  const h = await fixture();
  assert.deepEqual(await executeReviewDispatch(input, h.deps), { outcome: "sent", providerId: "fake-provider" });
  assert.deepEqual(h.sends, [h.payload]);
  assert.equal(h.row().status, "sent");
  assert.deepEqual(h.state().slots[0], h.prior.slots[0]);
  assert.equal(h.state().slots.length, 2);
  assert.equal(h.state().slots[1].family, "review");
  assert.equal(h.state().slots[1].attemptedAt, NOW);
  assert.equal(h.calls.filter(op => op === "/reserve").length, 1);
  assert.equal(h.calls.filter(op => op === "/commit").length, 1);
  assert.equal(h.calls.includes("/release"), false);
});

test("review fence: absent explicit flag cannot fall back to enabled process env", async t => {
  const previous = process.env.PROMOTION_DISPATCH_ENABLED;
  t.after(() => {
    if (previous === undefined) delete process.env.PROMOTION_DISPATCH_ENABLED;
    else process.env.PROMOTION_DISPATCH_ENABLED = previous;
  });
  process.env.PROMOTION_DISPATCH_ENABLED = "true";
  const h = await fixture();
  delete h.env.PROMOTION_DISPATCH_ENABLED;
  assert.deepEqual(await executeReviewDispatch(input, h.deps), refused);
  assert.equal(h.calls.includes("/reserve"), false);
  assert.equal(h.sends.length, 0);
});

test("review fence: missing cap binding remains fail closed", async () => {
  const h = await fixture();
  delete h.env.SEND_CAP_SERVICE;
  assert.deepEqual(await executeReviewDispatch(input, h.deps), { outcome: "refused", reason: "send_cap_unavailable" });
  assert.equal(h.sends.length, 0);
  assert.deepEqual(h.state(), h.prior);
});

test("review fence: cap unset after reservation releases without send", async () => {
  const h = await fixture();
  h.deps.checkEligibility = async () => { h.unsetCap(); return { status: "eligible" }; };
  assert.deepEqual(await executeReviewDispatch(input, h.deps), { outcome: "refused", reason: "send_cap_unset" });
  assert.equal(h.sends.length, 0);
  assert.deepEqual(h.state(), h.prior);
  assert.equal(h.row().lastError, "send_cap_unset");
});
