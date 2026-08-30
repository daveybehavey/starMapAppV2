import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReviewFromStatuses,
  createMemoryKv,
  persistAcceptedPrintfulIdentityThenReview,
  persistPrintOrderRecord,
  printOrderKey,
  fulfillmentIndexKey,
} from "./printFulfillmentPostSubmit.harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const postSubmitSource = fs.readFileSync(
  path.join(appRoot, "src/lib/printFulfillmentPostSubmit.ts"),
  "utf8",
);
const webhookSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/stripe/webhook/route.ts"),
  "utf8",
);
const retrySource = fs.readFileSync(
  path.join(appRoot, "src/app/api/print/orders/retry/route.ts"),
  "utf8",
);
const printOrdersSource = fs.readFileSync(path.join(appRoot, "src/lib/printOrders.ts"), "utf8");
const resolveSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/print/orders/resolve/route.ts"),
  "utf8",
);

const SESSION = "cs_test_issue255_persist_before_review";

function baseSentRecord(overrides = {}) {
  return {
    status: "sent",
    sessionId: SESSION,
    printVariant: "framed_12x16",
    includesDigitalAddOn: false,
    attempts: 1,
    printfulOrderId: 9001,
    sentAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

test("1: provider create success persists order ID + index before review starts", async () => {
  const kv = createMemoryKv();
  const events = [];
  const result = await persistAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
    events,
  });

  assert.equal(result.identityPersist.outcome, "persisted");
  assert.equal(result.indexed, true);

  const identityStep = events.findIndex((e) => e.step === "identity_persist");
  const indexStep = events.findIndex((e) => e.step === "index");
  const reviewStep = events.findIndex((e) => e.step === "review_start");
  assert.ok(identityStep >= 0 && indexStep >= 0 && reviewStep >= 0);
  assert.ok(identityStep < reviewStep, "identity persist must precede review");
  assert.ok(indexStep < reviewStep, "index write must precede review");

  const stored = await kv.get(printOrderKey(SESSION));
  assert.equal(stored.printfulOrderId, 9001);
  assert.equal(stored.status, "sent");
  const index = await kv.get(fulfillmentIndexKey(9001));
  assert.equal(index.sessionId, SESSION);
});

test("2: review throw after identity persist leaves durable ID for retry short-circuit", async () => {
  const kv = createMemoryKv();
  await assert.rejects(
    () =>
      persistAcceptedPrintfulIdentityThenReview({
        sessionId: SESSION,
        sentRecord: baseSentRecord(),
        kv,
        reviewThrow: new Error("review_crashed"),
      }),
    /review_crashed/,
  );

  const stored = await kv.get(printOrderKey(SESSION));
  assert.equal(stored?.printfulOrderId, 9001);
  assert.equal(stored?.status, "sent");
  // Retry path short-circuits on status===sent — no second provider create.
  assert.match(retrySource, /existing\.status === "sent"/);
  assert.match(retrySource, /status:\s*"already_sent"/);
});

test("3: waiting produces pending — no failure alert, status remains sent", async () => {
  const kv = createMemoryKv();
  const result = await persistAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "waiting" }]),
  });

  assert.equal(result.record.status, "sent");
  assert.equal(result.record.error, undefined);
  assert.deepEqual(result.alerts, []);
  const stored = await kv.get(printOrderKey(SESSION));
  assert.equal(stored.error, undefined);
  assert.equal(stored.status, "sent");
});

test("4: confirmed failed follows failure alert handling without inventing approval", async () => {
  const kv = createMemoryKv();
  const result = await persistAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "Poster", type: "default", status: "failed" }]),
  });

  assert.equal(result.record.status, "sent");
  assert.match(String(result.record.error || ""), /^printful_files_failed:/);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].type, "failure");
  assert.ok(!result.alerts.some((a) => a.type === "approval"));
});

test("5: unknown status stays pending / fail-safe", async () => {
  const kv = createMemoryKv();
  const result = await persistAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "mystery" }]),
  });
  assert.equal(result.record.error, undefined);
  assert.deepEqual(result.alerts, []);
});

test("6: null/unavailable review cannot invent success or failure", async () => {
  const kv = createMemoryKv();
  const result = await persistAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: null,
  });
  assert.equal(result.record.error, undefined);
  assert.equal(result.record.operatorAlertedAt, undefined);
  assert.deepEqual(result.alerts, []);
});

test("7: authoritative terminal failed cannot be overwritten by stale sent write", async () => {
  const kv = createMemoryKv();
  const failed = {
    ...baseSentRecord({ status: "failed", error: "printful_order_failed:upstream", printfulOrderId: 9001 }),
  };
  await persistPrintOrderRecord(kv, SESSION, failed);
  assert.equal((await kv.get(printOrderKey(SESSION))).status, "failed");

  const staleSent = baseSentRecord({ status: "sent", error: undefined, printfulOrderId: 9001 });
  const rejected = await persistPrintOrderRecord(kv, SESSION, staleSent);
  assert.equal(rejected.outcome, "rejected_terminal_failure");
  assert.equal((await kv.get(printOrderKey(SESSION))).status, "failed");
  assert.equal((await kv.get(printOrderKey(SESSION))).error, "printful_order_failed:upstream");

  // Full helper path also refuses and skips review success claims.
  const helper = await persistAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: staleSent,
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
  });
  assert.equal(helper.identityPersist.outcome, "rejected_terminal_failure");
  assert.equal((await kv.get(printOrderKey(SESSION))).status, "failed");

  assert.match(printOrdersSource, /rejected_terminal_failure/);
  assert.match(printOrdersSource, /allowClearTerminalFailure/);
  assert.match(resolveSource, /allowClearTerminalFailure:\s*true/);
});

test("source: webhook + retry call persistAcceptedPrintfulIdentityThenReview (persist before review)", () => {
  assert.match(postSubmitSource, /persistAcceptedPrintfulIdentityThenReview/);
  assert.match(postSubmitSource, /persistPrintOrderRecord\(sessionId,\s*sentRecord\)/);
  assert.match(postSubmitSource, /setPrintFulfillmentIndex/);
  assert.match(postSubmitSource, /applyPrintfulPostSubmitReview/);
  // Identity persist must appear before review in the helper body.
  const persistIdx = postSubmitSource.indexOf("persistPrintOrderRecord(sessionId, sentRecord)");
  const reviewIdx = postSubmitSource.indexOf("applyPrintfulPostSubmitReview(sentRecord)");
  assert.ok(persistIdx >= 0 && reviewIdx > persistIdx);

  assert.match(webhookSource, /persistAcceptedPrintfulIdentityThenReview/);
  assert.match(retrySource, /persistAcceptedPrintfulIdentityThenReview/);
  assert.doesNotMatch(webhookSource, /applyPrintfulPostSubmitReview\(/);
  assert.doesNotMatch(retrySource, /applyPrintfulPostSubmitReview\(/);
});
