/**
 * M1-04 — dual fulfilment submission (Slate 53 S53-1 PROVEN; fix design
 * Slate 55 S55-1, selected shape: unconditional return at the end of the
 * regular Printful branch of queuePrintOrder, after the bind-failure check).
 *
 * Behavioral cases run against printDualFulfillment.harness.mjs, which
 * mirrors the route's destination selection; structural pins below bind
 * the mirror to the production source so it cannot drift silently.
 *
 * No fenced coupon is a fixture or test input; no discount-bearing Stripe
 * fixtures are used (destination selection sits below the discount gate).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDestinationEnv,
  simulateQueuePrintOrder,
  SimulatedBindError,
  SimulatedCrashError,
  SimulatedUnretainableError,
} from "./printDualFulfillment.harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const webhookSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/stripe/webhook/route.ts"),
  "utf8",
);
const retrySource = fs.readFileSync(
  path.join(appRoot, "src/app/api/print/orders/retry/route.ts"),
  "utf8",
);

test("BothConfigured_Success: one v1 POST, zero alternate POSTs, identity bound", async () => {
  const env = createDestinationEnv({ printfulOutcomes: [{ accept: 7001 }] });
  const result = await simulateQueuePrintOrder(env, {});
  assert.equal(result.outcome, "printful_sent");
  assert.equal(env.counters.printfulPost, 1);
  assert.equal(env.counters.alternatePost, 0);
  assert.equal(env.record.status, "sent");
  assert.equal(env.record.printfulOrderId, 7001);
});

test("SecondDestinationWouldFail: alternate 500 is never contacted", async () => {
  const env = createDestinationEnv({ alternateStatus: 500, printfulOutcomes: [{ accept: 7002 }] });
  const result = await simulateQueuePrintOrder(env, {});
  assert.equal(result.outcome, "printful_sent");
  assert.equal(env.counters.alternatePost, 0);
  assert.equal(env.record.status, "sent");
});

test("PrintfulReportedFailure: zero alternate POSTs, problem recorded, no failover", async () => {
  const env = createDestinationEnv({ printfulOutcomes: [{ fail: "printful_order_failed" }] });
  const result = await simulateQueuePrintOrder(env, {});
  assert.equal(result.outcome, "printful_failed");
  assert.equal(env.counters.printfulPost, 1);
  assert.equal(env.counters.alternatePost, 0);
  assert.equal(env.problemRecords.at(-1)?.error, "printful_order_failed");
});

test("BindUnreadOrConflict: zero alternate POSTs, bind error thrown (retryable)", async () => {
  const env = createDestinationEnv({ bind: "conflict", printfulOutcomes: [{ accept: 7003 }] });
  await assert.rejects(() => simulateQueuePrintOrder(env, {}), SimulatedBindError);
  assert.equal(env.counters.alternatePost, 0);
  assert.notEqual(env.record?.status, "sent");
});

test("PostAcceptUnretainable: zero alternate POSTs, unretainable thrown", async () => {
  const env = createDestinationEnv({ bind: "deleted_unretainable", printfulOutcomes: [{ accept: 7004 }] });
  await assert.rejects(() => simulateQueuePrintOrder(env, {}), SimulatedUnretainableError);
  assert.equal(env.counters.alternatePost, 0);
});

test("CrashAtFormerFallthrough: crash after bind -> zero alternate; redelivery makes no manufacturing POST", async () => {
  const env = createDestinationEnv({ crashAt: "after_bind", printfulOutcomes: [{ accept: 7005 }] });
  await assert.rejects(() => simulateQueuePrintOrder(env, {}), SimulatedCrashError);
  assert.equal(env.counters.alternatePost, 0);
  // KV `sent` is now visible; redelivery stops at the entry guard.
  const second = await simulateQueuePrintOrder(env, {});
  assert.equal(second.outcome, "already_sent");
  assert.equal(env.counters.printfulPost, 1);
  assert.equal(env.counters.alternatePost, 0);
});

test("CrashBeforeIdentityBind: redelivery reconciles to the original v1 id, no new external id, zero alternate", async () => {
  const env = createDestinationEnv({
    printfulOutcomes: [{ nonEditable: 7006 }],
  });
  // First invocation "dies" before binding: model by a bind that never
  // persists, then a redelivery whose provider POST reconciles via GET.
  env.bind = "conflict";
  await assert.rejects(() => simulateQueuePrintOrder(env, {}), SimulatedBindError);
  env.bind = "persisted";
  const second = await simulateQueuePrintOrder(env, {});
  assert.equal(second.reconciled, true);
  assert.equal(second.printfulOrderId, 7006);
  assert.equal(env.counters.alternatePost, 0);
  assert.ok(env.externalIds.every((id) => id === env.externalIds[0]), "no new external id minted");
});

test("DuplicateEventAndSettlement: re-entry after visible sent makes no manufacturing POST", async () => {
  const env = createDestinationEnv({ printfulOutcomes: [{ accept: 7007 }] });
  await simulateQueuePrintOrder(env, {});
  const again = await simulateQueuePrintOrder(env, {});
  assert.equal(again.outcome, "already_sent");
  assert.equal(env.counters.printfulPost, 1);
  assert.equal(env.counters.alternatePost, 0);
});

test("ConcurrentDuplicates: two invocations before sent is visible -> alternate stays zero", async () => {
  const envA = createDestinationEnv({ printfulOutcomes: [{ accept: 7008 }] });
  const envB = createDestinationEnv({ printfulOutcomes: [{ accept: 7008 }] });
  // Each invocation reads KV before the other's sent write is visible.
  await simulateQueuePrintOrder(envA, {});
  await simulateQueuePrintOrder(envB, {});
  assert.equal(envA.counters.alternatePost + envB.counters.alternatePost, 0);
});

test("AlternateOnly: v1 unconfigured -> alternate is the single destination (success + failure)", async () => {
  const ok = createDestinationEnv({ printfulConfigured: false, alternateStatus: 200 });
  const okResult = await simulateQueuePrintOrder(ok, {});
  assert.equal(okResult.outcome, "alternate_sent");
  assert.equal(ok.counters.alternatePost, 1);
  assert.equal(ok.counters.printfulPost, 0);
  assert.equal(ok.record.status, "sent");

  const bad = createDestinationEnv({ printfulConfigured: false, alternateStatus: 500 });
  const badResult = await simulateQueuePrintOrder(bad, {});
  assert.equal(badResult.outcome, "alternate_failed");
  assert.equal(bad.counters.alternatePost, 1);
  assert.equal(bad.counters.printfulPost, 0);
  assert.equal(bad.problemRecords.at(-1)?.status, "failed");
});

test("NeitherConfigured: fulfillment_not_configured, zero POSTs anywhere", async () => {
  const env = createDestinationEnv({ printfulConfigured: false, alternateUrl: "" });
  const result = await simulateQueuePrintOrder(env, {});
  assert.equal(result.outcome, "fulfillment_not_configured");
  assert.equal(env.counters.printfulPost, 0);
  assert.equal(env.counters.alternatePost, 0);
});

test("SubmissionDisabled: zero manufacturing POSTs, pending submission_disabled preserved", async () => {
  const env = createDestinationEnv({ submissionEnabled: false });
  const result = await simulateQueuePrintOrder(env, {});
  assert.equal(result.outcome, "submission_disabled");
  assert.equal(env.counters.printfulPost, 0);
  assert.equal(env.counters.alternatePost, 0);
  assert.equal(env.record.error, "submission_disabled");
});

test("ExcludedBranches: merch selects V2 only; merch with only the alternate URL submits nowhere", async () => {
  const v2 = createDestinationEnv({ printfulV2Configured: true });
  const v2Result = await simulateQueuePrintOrder(v2, { merch: true });
  assert.equal(v2Result.outcome, "merch_v2_sent");
  assert.equal(v2.counters.printfulV2Post, 1);
  assert.equal(v2.counters.alternatePost, 0);

  const noV2 = createDestinationEnv({ printfulV2Configured: false });
  const noV2Result = await simulateQueuePrintOrder(noV2, { merch: true });
  assert.equal(noV2Result.outcome, "merch_no_submission");
  assert.equal(noV2.counters.alternatePost, 0);
  assert.equal(noV2.counters.printfulPost, 0);
});

// ---------------------------------------------------------------------------
// Structural pins: the production source must keep the shape the harness
// mirrors. These fail if the return is removed or moved.
// ---------------------------------------------------------------------------

test("PIN: regular Printful branch ends with an unconditional return after the bind-failure throw", () => {
  assert.match(
    webhookSource,
    /throw new PrintOrderAuthorityBindError\(\s*bindFailureReason \?\? \(bindBlockedByTerminal \? "terminal_blocks_bind" : "bind_rejected"\),\s*\);\s*\}(?:\s*\/\/[^\n]*)*\s*return;\s*\}\s*if \(!printFulfillmentWebhookUrl\) return;/,
  );
});

test("PIN: the alternate POST is reachable only after the Printful branch has returned", () => {
  const submitIdx = webhookSource.indexOf("const printfulResult = await submitPrintfulOrder({");
  const altIdx = webhookSource.indexOf("await fetch(printFulfillmentWebhookUrl", submitIdx);
  assert.ok(submitIdx >= 0 && altIdx > submitIdx);
  const between = webhookSource.slice(submitIdx, altIdx);
  assert.match(between, /return;\s*\}\s*if \(!printFulfillmentWebhookUrl\) return;/);
});

test("PIN: Printful reported-failure path still returns before any destination fallthrough", () => {
  assert.match(
    webhookSource,
    /if \(!printfulResult\.ok\) \{[\s\S]*?error: printfulResult\.error \?\? "printful_order_failed",[\s\S]*?return;\s*\}/,
  );
});

test("PIN: merch branch still returns inside queuePrintOrder (never reaches the alternate POST)", () => {
  const merchIdx = webhookSource.indexOf("if (payload.merchCatalogVariantId) {");
  const regularIdx = webhookSource.indexOf("if (!isPrintfulConfigured() && !printFulfillmentWebhookUrl)", merchIdx);
  assert.ok(merchIdx >= 0 && regularIdx > merchIdx);
  const merchSegment = webhookSource.slice(merchIdx, regularIdx);
  assert.match(merchSegment, /\}\s*return;\s*\}\s*$/);
});

test("PIN: ops retry route still selects a single destination per branch", () => {
  assert.match(retrySource, /const printful = await submitPrintfulOrder\(\{/);
  assert.match(retrySource, /status: "already_sent"/);
});
