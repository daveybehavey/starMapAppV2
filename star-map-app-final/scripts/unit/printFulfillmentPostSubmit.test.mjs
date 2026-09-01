import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTerminalWebhookDoFirst,
  applyTerminalWebhookWithRevisionGuard,
  bindAcceptedPrintfulIdentityThenReview,
  buildReviewFromStatuses,
  createMemoryKv,
  createSerializedAuthorityStore,
  fulfillmentIndexKey,
  printOrderKey,
  projectPrintOrderWithAuthority,
  resolveRetryDoFirst,
  resolveStatusDoFirst,
  simulateRecoveryBeforeStaleTerminalKvWrite,
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
const printfulWebhookRouteSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/printful/webhook/route.ts"),
  "utf8",
);
const printfulWebhookLibSource = fs.readFileSync(
  path.join(appRoot, "src/lib/printfulWebhookOrderEvents.ts"),
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
const statusSource = fs.readFileSync(
  path.join(appRoot, "src/app/api/print/orders/status/route.ts"),
  "utf8",
);
const authoritySource = fs.readFileSync(
  path.join(appRoot, "src/lib/printOrderAuthority.ts"),
  "utf8",
);

const SESSION = "cs_test_ag018_bind_before_review";

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
  assert.equal(result.bindFailureReason, null);

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

test("7: terminal webhook state blocks stale sent mirror without KV/index write", async () => {
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
  assert.equal(result.bindFailureReason, "terminal_blocks_bind");
  assert.equal(result.identityPersist, null);
  assert.equal(result.indexed, false);
  assert.equal(await kv.get(printOrderKey(SESSION)), null);
  assert.equal(await kv.get(fulfillmentIndexKey(9001)), null);
  assert.equal((await authority.get(SESSION)).lifecycle, "terminal_failed");
});

test("AG-018 #1: conflicting provider ID fails closed — no KV, index, or review", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: 111,
    now: 1,
  });
  const events = [];
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord({ printfulOrderId: 222 }),
    kv,
    authority,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
    events,
  });
  assert.equal(result.bindOk, false);
  assert.equal(result.bindFailureReason, "conflicting_provider_id");
  assert.equal(result.identityPersist, null);
  assert.equal(result.indexed, false);
  assert.equal(await kv.get(printOrderKey(SESSION)), null);
  assert.equal(await kv.get(fulfillmentIndexKey(222)), null);
  assert.ok(!events.some((e) => e.step === "identity_persist"));
  assert.ok(!events.some((e) => e.step === "review_start"));
  assert.equal((await authority.get(SESSION)).printfulOrderId, "111");
});

test("AG-018 #4: healthy review persists approval metadata via new record snapshot", async () => {
  const kv = createMemoryKv();
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
  });
  assert.equal(result.bindOk, true);
  assert.ok(result.record.operatorAlertedAt);
  assert.equal(result.record.operatorAlertProvider, "resend");
  assert.equal(result.reviewPersist?.outcome, "persisted");
  const stored = await kv.get(printOrderKey(SESSION));
  assert.ok(stored.operatorAlertedAt);
  assert.equal(stored.operatorAlertProvider, "resend");
  assert.match(postSubmitSource, /Return a new record/);
  assert.match(postSubmitSource, /const approved: PrintOrderRecord = \{ \.\.\.sentRecord \}/);
  assert.match(postSubmitSource, /const beforeReview: PrintOrderRecord = \{ \.\.\.sentRecord \}/);
});

test("AG-018 #3: stale terminal KV projection skipped after operator recovery", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: 9001,
    now: 1,
  });

  const result = await applyTerminalWebhookWithRevisionGuard({
    sessionId: SESSION,
    kv,
    authority,
    afterTerminalHook: async ({ authority: auth, kv: store, sessionId }) => {
      await auth.apply(sessionId, { type: "operator_recover", now: Date.now() });
      await store.set(printOrderKey(sessionId), {
        status: "sent",
        sessionId,
        printfulOrderId: 9001,
        operatorResolvedAt: Date.now(),
      });
    },
  });

  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "stale_terminal_projection_skipped");
  assert.equal(result.kvWritten, false);
  assert.equal(result.latestLifecycle, "operator_recovered");
  const stored = await kv.get(printOrderKey(SESSION));
  assert.equal(stored.status, "sent");
  assert.match(printfulWebhookLibSource, /stale_terminal_projection_skipped/);
  assert.match(printfulWebhookLibSource, /latest\.revision !== terminalRevision/);
});

test("AG-018 #2: authority_unread returns retryable non-2xx from Printful webhook route", () => {
  assert.match(printfulWebhookRouteSource, /status === "authority_unread"/);
  assert.match(printfulWebhookRouteSource, /status:\s*503/);
  assert.match(printfulWebhookLibSource, /status: "authority_unread"/);
});

test("source: stripe/retry use bind-before-review; resolve uses operatorRecover", () => {
  assert.match(postSubmitSource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(postSubmitSource, /bindPrintProviderOrderId/);
  assert.match(postSubmitSource, /Fail closed unless bind is successful/);
  assert.match(webhookSource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(retrySource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(retrySource, /terminal_failed_requires_operator_recover/);
  assert.match(resolveSource, /operatorRecoverPrintOrder/);
  assert.match(resolveSource, /allowClearTerminalFailure:\s*true/);
});

test("AG-041 #1: Stripe bind failure after Printful accept is retryable (no silent ack)", () => {
  assert.match(webhookSource, /PrintOrderAuthorityBindError/);
  assert.match(webhookSource, /isPrintOrderAuthorityBindError\(error\)/);
  assert.match(webhookSource, /completedCheckoutRetryable\s*=\s*true/);
  // Bind failure must throw before normal completion path finalizes dedupe.
  assert.match(
    webhookSource,
    /throw new PrintOrderAuthorityBindError\([\s\S]*?bindFailureReason/,
  );
  assert.match(authoritySource, /export class PrintOrderAuthorityBindError/);
});

test("AG-041 #2: post-terminal authority unread is retryable, not stale skip", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: 9001,
    now: 1,
  });
  const result = await applyTerminalWebhookWithRevisionGuard({
    sessionId: SESSION,
    kv,
    authority,
    afterTerminalHook: async ({ authority: auth, sessionId }) => {
      // Simulate transient unread on the post-transition re-read.
      const originalGet = auth.get.bind(auth);
      auth.get = async (id) => (id === sessionId ? null : originalGet(id));
    },
  });
  assert.equal(result.status, "authority_unread");
  assert.equal(result.reason, "authority_unread");
  assert.equal(result.kvWritten, false);
  assert.match(printfulWebhookLibSource, /if \(!latest\)/);
  assert.match(
    printfulWebhookLibSource,
    /if \(!latest\)[\s\S]*?status: "authority_unread"/,
  );
});

test("AG-041 #3: authoritative status ignores stale KV failed after operator recovery", async () => {
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: 4242,
    now: 1,
  });
  await authority.apply(SESSION, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    reason: "x",
    now: 2,
  });
  await authority.apply(SESSION, { type: "operator_recover", now: 3 });
  const authState = await authority.get(SESSION);
  const kvRecord = {
    status: "failed",
    sessionId: SESSION,
    printfulOrderId: 111,
    error: "stale_failed_mirror",
  };
  const projected = projectPrintOrderWithAuthority(kvRecord, authState);
  assert.equal(authState.lifecycle, "operator_recovered");
  assert.notEqual(projected.status, "failed");
  assert.equal(projected.printfulOrderId, authState.printfulOrderId);
  assert.equal(projected.error, undefined);
  assert.match(statusSource, /projectPrintOrderWithAuthority/);
  assert.match(statusSource, /getPrintOrderAuthorityState/);
  assert.match(retrySource, /projectPrintOrderWithAuthority/);
  assert.match(retrySource, /setPrintFulfillmentIndex\(authority\.printfulOrderId/);
});

test("AG-041 #4: recovery-before-stale-KV-write interleaving keeps DO authoritative", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  const result = await simulateRecoveryBeforeStaleTerminalKvWrite({
    sessionId: SESSION,
    kv,
    authority,
  });
  assert.equal(result.checkWouldPass, true);
  assert.equal(result.authorityLifecycle, "operator_recovered");
  assert.equal(result.kvStatus, "failed"); // stale write landed
  assert.notEqual(result.projectedStatus, "failed");
  assert.equal(String(result.projectedPrintfulOrderId), "9001");
});

test("AG-042 #1: KV-missing + DO-bound terminal webhook keeps authority and returns projection_missing", async () => {
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "PF-BOUND",
    now: 1,
  });
  const result = await applyTerminalWebhookDoFirst({
    sessionId: SESSION,
    eventType: "order_failed",
    reason: "provider_failed",
    printfulOrderId: "PF-BOUND",
    kv: null,
    applyAuthorityOp: (sessionId, op) => authority.apply(sessionId, op),
    getAuthority: (sessionId) => authority.get(sessionId),
  });
  assert.equal(result.status, "projection_missing");
  assert.equal(result.reason, "reconciliation_needed");
  assert.equal(result.kvWritten, false);
  const authState = await authority.get(SESSION);
  assert.equal(authState.lifecycle, "terminal_failed");
  assert.equal(String(authState.printfulOrderId), "PF-BOUND");
});

test("AG-042 #2: KV-missing + DO-unbound terminal webhook captures provider id", async () => {
  const authority = createSerializedAuthorityStore();
  const result = await applyTerminalWebhookDoFirst({
    sessionId: SESSION,
    eventType: "order_canceled",
    reason: "canceled",
    printfulOrderId: "PF-CAPTURE",
    kv: null,
    applyAuthorityOp: (sessionId, op) => authority.apply(sessionId, op),
    getAuthority: (sessionId) => authority.get(sessionId),
  });
  assert.equal(result.status, "projection_missing");
  const authState = await authority.get(SESSION);
  assert.equal(authState.lifecycle, "terminal_failed");
  assert.equal(String(authState.printfulOrderId), "PF-CAPTURE");
});

test("AG-042 #3: provider-id conflict fails closed", async () => {
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "PF-A",
    now: 1,
  });
  const result = await applyTerminalWebhookDoFirst({
    sessionId: SESSION,
    eventType: "order_failed",
    printfulOrderId: "PF-B",
    kv: null,
    applyAuthorityOp: (sessionId, op) => authority.apply(sessionId, op),
    getAuthority: (sessionId) => authority.get(sessionId),
  });
  assert.equal(result.status, "provider_id_conflict");
  const authState = await authority.get(SESSION);
  assert.equal(authState.lifecycle, "bound");
  assert.equal(String(authState.printfulOrderId), "PF-A");
});

test("AG-042 #4: degraded status when authority exists without KV", async () => {
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    printfulOrderId: "PF-STATUS",
    now: 1,
  });
  const authState = await authority.get(SESSION);
  const resolved = resolveStatusDoFirst({
    authority: authState,
    kvOrder: null,
    sessionId: SESSION,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.degraded, true);
  assert.equal(resolved.reconciliationNeeded, true);
  assert.equal(resolved.projectionMissing, true);
  assert.equal(resolved.httpStatus, 200);
  assert.equal(resolved.order.status, "failed");
  assert.equal(String(resolved.order.printfulOrderId), "PF-STATUS");
});

test("AG-042 #5: retry with authority but missing KV never resubmits", async () => {
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "PF-RETRY",
    now: 1,
  });
  const authState = await authority.get(SESSION);
  const resolved = resolveRetryDoFirst({ authority: authState, kvOrder: null });
  assert.equal(resolved.action, "reconciliation_required");
  assert.equal(resolved.httpStatus, 409);
  assert.equal(String(resolved.authority.printfulOrderId), "PF-RETRY");
});

test("AG-042 #6: normal path still projects bound pending KV as sent", () => {
  const projected = projectPrintOrderWithAuthority(
    { status: "pending", sessionId: SESSION, printfulOrderId: null },
    {
      lifecycle: "bound",
      printfulOrderId: "PF-OK",
      revision: 2,
      terminalReason: null,
      terminalEventType: null,
    },
  );
  assert.equal(projected.status, "sent");
  assert.equal(String(projected.printfulOrderId), "PF-OK");
});

test("AG-042 #7: source wiring — webhook DO-first; status/retry reconciliation", () => {
  assert.match(printfulWebhookLibSource, /DO-first/);
  assert.match(printfulWebhookLibSource, /projection_missing/);
  assert.match(printfulWebhookLibSource, /provider_id_conflict/);
  assert.match(printfulWebhookLibSource, /printfulOrderId,/);
  assert.match(printfulWebhookRouteSource, /projection_missing/);
  assert.match(printfulWebhookRouteSource, /provider_id_conflict/);
  assert.match(statusSource, /DO-first/);
  assert.match(statusSource, /reconciliationNeeded/);
  assert.match(statusSource, /projectionMissing/);
  assert.match(retrySource, /reconciliation_required/);
  assert.match(retrySource, /operator_recovered/);
  assert.match(authoritySource, /inferAuthorityOnlyOrderStatus/);
  assert.match(authoritySource, /boundButPendingProjection/);
});
