import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindAcceptedPrintfulIdentityThenReview,
  buildReviewFromStatuses,
  createMemoryKv,
  createSerializedAuthorityStore,
  fulfillmentIndexKey,
  printOrderKey,
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
const resolveSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/print/orders/resolve/route.ts"),
  "utf8",
);

const SESSION = "cs_test_ag016_bind_before_review";

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

test("1: provider success binds + persists ID/index before review", async () => {
  const kv = createMemoryKv();
  const events = [];
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
    events,
  });

  assert.equal(result.identityPersist.outcome, "persisted");
  assert.equal(result.indexed, true);
  assert.equal(result.bindOk, true);

  const bindStep = events.findIndex((e) => e.step === "bind");
  const identityStep = events.findIndex((e) => e.step === "identity_persist");
  const indexStep = events.findIndex((e) => e.step === "index");
  const reviewStep = events.findIndex((e) => e.step === "review_start");
  assert.ok(bindStep >= 0 && identityStep >= 0 && indexStep >= 0 && reviewStep >= 0);
  assert.ok(bindStep < reviewStep);
  assert.ok(identityStep < reviewStep);
  assert.ok(indexStep < reviewStep);

  const stored = await kv.get(printOrderKey(SESSION));
  assert.equal(stored.printfulOrderId, 9001);
  assert.equal((await kv.get(fulfillmentIndexKey(9001))).sessionId, SESSION);
  assert.equal((await result.authority.get(SESSION)).lifecycle, "bound");
});

test("2: review throw after bind leaves durable ID; retry short-circuits on bound/sent", async () => {
  const kv = createMemoryKv();
  await assert.rejects(
    () =>
      bindAcceptedPrintfulIdentityThenReview({
        sessionId: SESSION,
        sentRecord: baseSentRecord(),
        kv,
        reviewThrow: new Error("review_crashed"),
      }),
    /review_crashed/,
  );
  const stored = await kv.get(printOrderKey(SESSION));
  assert.equal(stored?.printfulOrderId, 9001);
  assert.match(retrySource, /already_bound|already_sent/);
  assert.match(retrySource, /lifecycle === "bound"/);
});

test("3: waiting → pending (no failure alert)", async () => {
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv: createMemoryKv(),
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "waiting" }]),
  });
  assert.equal(result.record.status, "sent");
  assert.equal(result.record.error, undefined);
  assert.deepEqual(result.alerts, []);
});

test("4: confirmed failed → failure alert; status stays sent (webhook is terminal authority)", async () => {
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv: createMemoryKv(),
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "failed" }]),
  });
  assert.equal(result.record.status, "sent");
  assert.match(result.record.error, /printful_files_failed/);
  assert.deepEqual(result.alerts, [{ type: "failure" }]);
});

test("5: unknown status stays pending", async () => {
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv: createMemoryKv(),
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "weird" }]),
  });
  assert.deepEqual(result.alerts, []);
  assert.equal(result.record.error, undefined);
});

test("6: null/unavailable review invents neither success nor failure", async () => {
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv: createMemoryKv(),
    reviewResult: null,
  });
  assert.deepEqual(result.alerts, []);
  assert.equal(result.record.operatorAlertedAt, undefined);
  assert.equal(result.record.error, undefined);
});

test("7: terminal webhook state blocks stale sent mirror", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 1,
  });
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    authority,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
  });
  assert.equal(result.bindBlockedByTerminal, true);
  assert.equal(result.identityPersist.outcome, "rejected_terminal_failure");
  assert.equal(await kv.get(printOrderKey(SESSION)), null);
  assert.equal((await authority.get(SESSION)).lifecycle, "terminal_failed");
});

test("source: stripe/retry use bind-before-review; resolve uses operatorRecover", () => {
  assert.match(postSubmitSource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(postSubmitSource, /bindPrintProviderOrderId/);
  assert.match(webhookSource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(retrySource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(retrySource, /terminal_failed_requires_operator_recover/);
  assert.match(resolveSource, /operatorRecoverPrintOrder/);
  assert.match(resolveSource, /allowClearTerminalFailure:\s*true/);
});
