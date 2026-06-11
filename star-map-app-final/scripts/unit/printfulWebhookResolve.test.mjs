import assert from "node:assert/strict";
import test from "node:test";
import { resolvePrintfulWebhookSessionId } from "./printFulfillmentIndex.harness.mjs";

test("printful webhook resolution matches production smc external_id + index pattern", () => {
  const session = "cs_live_b1SMZnwizGDOHJAlX86rCGxyH2b2au2pNugxoHTfu9gyOhAoB4t2JJzIrh";
  const resolved = resolvePrintfulWebhookSessionId({
    printfulOrderId: "161064930",
    externalId: "smc_af0af9b8e67d370c7cddb89f",
    indexedSessionId: session,
  });
  assert.equal(resolved, session);
});
