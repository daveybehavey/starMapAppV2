/**
 * hdExportFulfillment.ts — credit-safe user-facing message + consume-token shape.
 *
 * Regression targets:
 * - credit-preserved vs credit-uncertain failure copy stays distinct
 * - consume-failed copy never claims the credit was spent
 * - createHdConsumeToken returns a non-empty string (UUID shape when crypto present)
 *
 * Network helpers (postHdCreditConsume / verifyStripeSessionForDownload) stay
 * out of this file — they need live Stripe / fetch seams.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  createHdConsumeToken,
  formatHdExportFailedMessage,
  formatHdExportConsumeFailedMessage,
} = await import("../../src/lib/hdExportFulfillment.ts");

test("formatHdExportFailedMessage distinguishes credit-preserved vs uncertain", () => {
  const preserved = formatHdExportFailedMessage(true);
  const uncertain = formatHdExportFailedMessage(false);
  assert.match(preserved, /credit was not used/i);
  assert.doesNotMatch(preserved, /Restore my credit/i);
  assert.match(uncertain, /Restore my credit/i);
  assert.notEqual(preserved, uncertain);
  // Default arg preserves credit.
  assert.equal(formatHdExportFailedMessage(), preserved);
});

test("formatHdExportConsumeFailedMessage never claims credit was spent", () => {
  const msg = formatHdExportConsumeFailedMessage();
  assert.match(msg, /credit should still be available/i);
  assert.doesNotMatch(msg, /credit was used/i);
  assert.doesNotMatch(msg, /credit has been consumed/i);
});

test("createHdConsumeToken returns a non-empty UUID-like token under Node crypto", () => {
  const token = createHdConsumeToken();
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 8);
  assert.match(token, /^[0-9a-f-]{36}$/i);
  assert.notEqual(createHdConsumeToken(), token);
});
