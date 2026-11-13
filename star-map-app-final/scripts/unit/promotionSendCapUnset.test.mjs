import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);
register("./hcapNull.hooks.mjs", import.meta.url);

const { PROMOTION_SEND_CAP_H } = await import("../../src/lib/promotionSendCap.ts");
const guard = await import("../../src/lib/promotionDispatchGuard.ts");
const promotions = await import("../../src/lib/promotions.ts");
const refusal = { permitted: false, reason: "send_cap_unset" };
const deliveryRefusal = { outcome: "refused", provider: "none", reason: "send_cap_unset" };
const state = (overrides = {}) => ({
  kind: "promotion", emailHash: "test-hash", subscribedAt: null,
  unsubscribedAt: null, unsubscribeReason: null, lastSource: null,
  legacySubscribed: false, legacyImportCompleted: true, updatedAt: 1,
  jobs: {}, ...overrides,
});

test("GC-2: production H is unset and the global prerequisite refuses", async () => {
  assert.equal(PROMOTION_SEND_CAP_H, null);
  assert.deepEqual(await guard.evaluatePromotionSendCap(), refusal);
});

const recipients = [
  ["coordinator subscriber (otherwise permitted)", state({ subscribedAt: 10 }), null, false],
  ["coordinator legacy import", state({ legacySubscribed: true }), null, false],
  ["coordinator unsubscribed", state({ subscribedAt: 10, unsubscribedAt: 20 }), null, true],
  ["coordinator without permission", state(), null, true],
  ["deliverability suppressed", state({ subscribedAt: 10, suppressions: { deliverability: { at: 20, reason: "bounce" } } }), null, false],
  ["legacy subscriber", null, { subscribedAt: 10 }, false],
  ["legacy list member", null, null, true],
  ["legacy unsubscribed", null, { subscribedAt: 10, unsubscribedAt: 20 }, true],
  ["unknown recipient", null, null, false],
];
for (const [label, coordinatorState, legacyState, legacyListMember] of recipients) {
  test(`GC-2 unset: ${label} refuses before authority I/O`, async () => {
    let reads = 0;
    const checker = guard.createPromotionDispatchPermissionChecker({
      async getPromotionState() { reads++; return coordinatorState; },
    });
    assert.deepEqual(await checker("recipient@example.com"), refusal);
    assert.equal(reads, 0);
  });
}

test("GC-2 unset: invalid address and unreadable authority still return the distinct cap refusal", async () => {
  const checker = guard.createPromotionDispatchPermissionChecker({
    async getPromotionState() { assert.fail("authority must not be read"); },
  });
  assert.deepEqual(await checker(""), refusal);
  assert.deepEqual(await checker("recipient@example.com"), refusal);
});

test("GC-2 unset: both send kinds refuse even an injected permit, without any provider attempt", async (t) => {
  let fetches = 0;
  let checks = 0;
  t.mock.method(globalThis, "fetch", async () => { fetches++; throw new Error("unexpected send"); });
  for (const kind of ["coupon", "followup"]) {
    const payload = {
      email: "recipient@example.com", couponCode: "TEST", kind,
      subject: "Test", text: "Test", html: "<p>Test</p>",
      complianceFormatVersion: promotions.PROMOTION_COMPLIANCE_FORMAT_VERSION,
      headers: { "List-Unsubscribe": "<https://example.com/unsubscribe>" },
    };
    for (const checkDispatchPermission of [
      async () => { checks++; return { permitted: true }; },
      async () => { checks++; return { permitted: false, reason: "unsubscribed" }; },
      async () => { checks++; throw new Error("unreadable authority"); },
    ]) {
      assert.deepEqual(await promotions.deliverPromotionSend(payload, "test-only", { checkDispatchPermission }), deliveryRefusal);
    }
    assert.deepEqual(await promotions.deliverPromotionSend(payload), deliveryRefusal);
  }
  assert.equal(checks, 0);
  assert.equal(fetches, 0);
});

test("GC-2 unset: legacy wrappers expose the cap refusal and never fetch", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { assert.fail("unexpected send"); });
  for (const send of [promotions.runPromotionAutomation, promotions.runPromotionFollowup]) {
    assert.deepEqual(await send("recipient@example.com", "TEST"), {
      delivered: false, provider: "none", error: "promotion_dispatch_refused:send_cap_unset",
    });
  }
});
