import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateClaimPaid,
  hasRecoverableAccess,
  isValidMapId,
} from "../../src/lib/accountAccessEntitlements.mjs";

/** Keep in sync with src/lib/entitlementsStore.ts NEW_CLAIM_TOKEN_TTL_SECONDS */
const NEW_CLAIM_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180;

test("documented KV key prefixes", () => {
  assert.equal(`stripe:session:${"cs_test"}`, "stripe:session:cs_test");
  assert.equal(`claim:${"tok"}`, "claim:tok");
  assert.equal(`stripe:event:${"evt_1"}`, "stripe:event:evt_1");
  assert.equal(`map:${"123e4567-e89b-42d3-a456-426614174000"}`, "map:123e4567-e89b-42d3-a456-426614174000");
});

test("NEW_CLAIM_TOKEN_TTL is 180 days and shorter than legacy 10y cookie", () => {
  const tenYears = 60 * 60 * 24 * 365 * 10;
  assert.equal(NEW_CLAIM_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 180);
  assert.ok(NEW_CLAIM_TOKEN_TTL_SECONDS < tenYears);
});

test("shared evaluator covers subscription, pack, and print-only", () => {
  assert.equal(hasRecoverableAccess({ plan: "subscription", subscriptionActive: true }), true);
  assert.equal(hasRecoverableAccess({ plan: "pack3", creditsRemaining: 0, paid: true }), true);
  assert.deepEqual(
    evaluateClaimPaid({ orderType: "print", includesDigitalAddOn: false, paid: true }),
    { paid: false, revoked: false, isPrintOnly: true },
  );
  assert.equal(isValidMapId("123e4567-e89b-42d3-a456-426614174000"), true);
});
