import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateClaimPaid,
  hasRecoverableAccess,
  isValidMapId,
} from "../../src/lib/accountAccessEntitlements.mjs";

test("hasRecoverableAccess denies revoked and print-only", () => {
  assert.equal(hasRecoverableAccess({ revoked: true, paid: true }), false);
  assert.equal(
    hasRecoverableAccess({ orderType: "print", includesDigitalAddOn: false, paid: true }),
    false,
  );
});

test("hasRecoverableAccess allows print with digital add-on", () => {
  assert.equal(
    hasRecoverableAccess({
      orderType: "print",
      includesDigitalAddOn: true,
      paid: true,
      creditsRemaining: 0,
    }),
    true,
  );
});

test("hasRecoverableAccess subscription requires active flag", () => {
  assert.equal(
    hasRecoverableAccess({ plan: "subscription", subscriptionActive: false, paid: true }),
    false,
  );
  assert.equal(
    hasRecoverableAccess({ plan: "subscription", subscriptionActive: true }),
    true,
  );
});

test("hasRecoverableAccess credits or paid for single/pack", () => {
  assert.equal(hasRecoverableAccess({ plan: "single", creditsRemaining: 0, paid: false }), false);
  assert.equal(hasRecoverableAccess({ plan: "single", creditsRemaining: 1 }), true);
  assert.equal(hasRecoverableAccess({ plan: "pack3", creditsRemaining: 0, paid: true }), true);
});

test("evaluateClaimPaid aligns with claim route rules", () => {
  assert.deepEqual(evaluateClaimPaid({ revoked: true, paid: true }), {
    paid: false,
    revoked: true,
    isPrintOnly: false,
  });
  assert.deepEqual(
    evaluateClaimPaid({ orderType: "print", includesDigitalAddOn: false, paid: true }),
    { paid: false, revoked: false, isPrintOnly: true },
  );
  assert.deepEqual(
    evaluateClaimPaid({ plan: "pack3", creditsRemaining: 2, paid: true }),
    { paid: true, revoked: false, isPrintOnly: false },
  );
});

test("isValidMapId accepts UUIDs and rejects junk", () => {
  assert.equal(isValidMapId("123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(isValidMapId("not-a-map"), false);
  assert.equal(isValidMapId(""), false);
});
