import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePrintfulOrderId,
  printFulfillmentIndexKey,
  resolvePrintfulWebhookSessionId,
} from "./printFulfillmentIndex.harness.mjs";

test("printFulfillmentIndexKey normalizes numeric ids", () => {
  assert.equal(printFulfillmentIndexKey(161064930), "print:fulfillment:by-printful:161064930");
});

test("normalizePrintfulOrderId accepts numbers and numeric strings", () => {
  assert.equal(normalizePrintfulOrderId(161064930), "161064930");
  assert.equal(normalizePrintfulOrderId("161064930"), "161064930");
  assert.equal(normalizePrintfulOrderId("smc_deadbeef"), null);
});

test("resolvePrintfulWebhookSessionId prefers indexed session over external_id", () => {
  const session = "cs_live_b1SMZnwizGDOHJAlX86rCGxyH2b2au2pNugxoHTfu9gyOhAoB4t2JJzIrh";
  assert.equal(
    resolvePrintfulWebhookSessionId({
      printfulOrderId: "161064930",
      externalId: "smc_af0af9b8e67d370c7cddb89f",
      indexedSessionId: session,
    }),
    session,
  );
});

test("resolvePrintfulWebhookSessionId falls back to raw cs_live external_id", () => {
  const session = "cs_live_b1OukUkmbrE4VT2xE3az7TJGBDkeMlLL2vYXwUCOSMoOdJ0kiDt4H6YvUL";
  assert.equal(
    resolvePrintfulWebhookSessionId({
      printfulOrderId: null,
      externalId: session,
      indexedSessionId: null,
    }),
    session,
  );
});

test("resolvePrintfulWebhookSessionId returns null when unresolved", () => {
  assert.equal(
    resolvePrintfulWebhookSessionId({
      printfulOrderId: "161064930",
      externalId: "smc_af0af9b8e67d370c7cddb89f",
      indexedSessionId: null,
    }),
    null,
  );
});
