import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyReviewOutcomeToCurrent,
  applyOperatorResolveProjection,
  applyTerminalWebhookDoFirst,
  applyTerminalWebhookWithRevisionGuard,
  bindAcceptedPrintfulIdentityThenReview,
  buildReviewFromStatuses,
  createMemoryKv,
  createSerializedAuthorityStore,
  createUnboundAuthorityState,
  fulfillmentIndexKey,
  printOrderKey,
  projectOperatorResolveProviderId,
  projectPrintOrderWithAuthority,
  resolveRetryDoFirst,
  resolveStatusDoFirst,
  seedAuthorityFromKvMirror,
  classifyUnresolvedTerminalWebhookSession,
  simulateRecoveryBeforeStaleTerminalKvWrite,
  isLegacyAmbiguousPrintOrderFailure,
  terminalEventTypeForAuthoritySeed,
  kvFailedMirrorBlocksNonterminalWrite,
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
  assert.match(postSubmitSource, /const approved: PrintOrderRecord = \{ \.\.\.healthyRecord \}/);
  assert.match(postSubmitSource, /const beforeReview: PrintOrderRecord = \{ \.\.\.identityRecord \}/);
});

test("S96-1 (gate round 5): a hold recorded before the post-submit persists survives identity + review writes", async () => {
  const kv = createMemoryKv();
  await kv.set(printOrderKey(SESSION), {
    ...baseSentRecord(),
    providerHoldAt: 1_700_000_050_000,
    providerHoldReason: "address_issue",
    providerHoldOrderStatus: "onhold",
    operatorHoldAlertedAt: 1_700_000_050_500,
    operatorHoldAlertProvider: "resend",
  });
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
  });
  assert.equal(result.bindOk, true);
  const stored = await kv.get(printOrderKey(SESSION));
  assert.equal(stored.providerHoldAt, 1_700_000_050_000);
  assert.equal(stored.providerHoldReason, "address_issue");
  assert.ok(stored.operatorAlertedAt);
  assert.equal(result.record.providerHoldAt, 1_700_000_050_000);
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

test("source: stripe/retry use bind-before-review; resolve uses atomic operatorResolve", () => {
  assert.match(postSubmitSource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(postSubmitSource, /bindPrintProviderOrderId/);
  assert.match(postSubmitSource, /Fail closed unless bind is successful/);
  assert.match(webhookSource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(retrySource, /bindAcceptedPrintfulIdentityThenReview/);
  assert.match(retrySource, /terminal_failed_requires_operator_recover/);
  assert.match(resolveSource, /operatorResolvePrintOrder/);
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

test("AG-055 #1: DO=A + stale KV=B + no explicit ID projects/indexes A (not B)", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  });
  await kv.set(printOrderKey(SESSION), {
    sessionId: SESSION,
    status: "failed",
    printfulOrderId: "B",
  });
  // Pre-seed a stale index for B so we can assert this path does not keep using B.
  await kv.set(fulfillmentIndexKey("B"), SESSION);

  const resolved = projectOperatorResolveProviderId({
    explicitOperatorId: "",
    authorityPrintfulOrderId: "A",
    kvPrintfulOrderId: "B",
  });
  assert.equal(resolved, "A");

  const result = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
  });
  assert.equal(result.ok, true);
  assert.equal(String(result.resolvedProviderId), "A");
  assert.equal(String(result.kvPrintfulOrderId), "A");
  assert.equal(String(result.authorityPrintfulOrderId), "A");
  assert.equal(result.indexedSessionForResolved, SESSION);
  // B must not be the ID written/indexed by the resolve projection path.
  assert.notEqual(String(result.kvPrintfulOrderId), "B");
  // Owned stale B alias must be removed (AG-074 index repair).
  assert.equal(result.indexedSessionForStaleB, null);
});

test("AG-055 #2: explicit matching ID remains idempotent; conflict fails closed", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  });
  await kv.set(printOrderKey(SESSION), {
    sessionId: SESSION,
    status: "sent",
    printfulOrderId: "A",
  });

  const match = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "A",
    authority,
    kv,
  });
  assert.equal(match.ok, true);
  assert.equal(String(match.resolvedProviderId), "A");

  const conflict = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "Z",
    authority,
    kv,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "conflicting_provider_id");
  assert.equal(String((await authority.get(SESSION)).printfulOrderId), "A");
});

test("AG-055 #3: resolve route source projects authority-returned provider id (not stale KV)", () => {
  assert.match(resolveSource, /projectedProviderId/);
  assert.match(resolveSource, /resolved\.state\.printfulOrderId/);
  assert.match(resolveSource, /printfulOrderId:\s*projectedProviderId/);
  assert.match(resolveSource, /setPrintFulfillmentIndex\(\s*projectedProviderId/);
  assert.match(resolveSource, /deletePrintFulfillmentIndexIfOwned/);
  assert.doesNotMatch(
    resolveSource,
    /printfulOrderId:\s*printfulOrderId\s*\|\|\s*existing\.printfulOrderId/,
  );
});

test("AG-074 #1: terminal authority A + explicit Z conflicts before recovery; authority unchanged", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  });
  await authority.apply(SESSION, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 2,
  });
  const before = await authority.get(SESSION);
  assert.equal(before.lifecycle, "terminal_failed");
  assert.equal(String(before.printfulOrderId), "A");

  const conflict = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "Z",
    authority,
    kv,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "conflicting_provider_id");
  const after = await authority.get(SESSION);
  assert.equal(after.lifecycle, "terminal_failed");
  assert.equal(String(after.printfulOrderId), "A");
  assert.equal(after.revision, before.revision);
});

test("AG-074 #2: repeated operator resolve with same authority is idempotent", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  });
  await authority.apply(SESSION, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 2,
  });
  await kv.set(printOrderKey(SESSION), {
    sessionId: SESSION,
    status: "failed",
    printfulOrderId: "A",
  });

  const first = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
  });
  assert.equal(first.ok, true);
  const mid = await authority.get(SESSION);
  const second = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
  });
  assert.equal(second.ok, true);
  const end = await authority.get(SESSION);
  assert.equal(String(end.printfulOrderId), "A");
  assert.equal(end.lifecycle, mid.lifecycle);
  assert.equal(String(second.kvPrintfulOrderId), "A");
});

test("AG-074 #3: webhook with valid external_id does not await Printful-ID index", () => {
  assert.match(printfulWebhookLibSource, /isValidPrintCheckoutSessionId\(externalId\)/);
  assert.match(
    printfulWebhookLibSource,
    /valid checkout external_id resolves without awaiting Printful-ID KV index/,
  );
  const terminalIdx = printfulWebhookLibSource.indexOf("markPrintOrderTerminalFailed");
  const kvGetIdx = printfulWebhookLibSource.indexOf("kv.get<PrintOrderRecord>");
  assert.ok(terminalIdx > 0 && kvGetIdx > terminalIdx);
});


test("AG-074 #4: accepted Printful bind failure remains Stripe-retryable (no silent ack)", () => {
  assert.match(webhookSource, /PrintOrderAuthorityBindError/);
  assert.match(webhookSource, /isPrintOrderAuthorityBindError\(/);
  assert.match(postSubmitSource, /Fail closed unless bind is successful/);
});


test("AG-074 #5: terminal-before-KV harness path when KV missing after authority commit", async () => {
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "PF-74",
    now: 1,
  });
  const result = await applyTerminalWebhookDoFirst({
    sessionId: SESSION,
    printfulOrderId: "PF-74",
    kv: createMemoryKv(), // empty — projection missing after terminal
    applyAuthorityOp: (sessionId, op) => authority.apply(sessionId, op),
    getAuthority: (sessionId) => authority.get(sessionId),
  });
  assert.equal(result.status, "projection_missing");
  const auth = await authority.get(SESSION);
  assert.equal(auth.lifecycle, "terminal_failed");
  assert.equal(String(auth.printfulOrderId), "PF-74");
});

test("AG-079 #1: B-cleanup failure keeps KV=B; retry rediscovers B then commits A", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  });
  await kv.set(printOrderKey(SESSION), {
    sessionId: SESSION,
    status: "failed",
    printfulOrderId: "B",
  });
  await kv.set(fulfillmentIndexKey("B"), SESSION);

  const first = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
    failOnBCleanup: true,
  });
  assert.equal(first.ok, false);
  assert.equal(first.reason, "reconciliation_needed");
  assert.equal(String(first.kvPrintfulOrderId), "B");
  assert.equal(first.indexedSessionForStaleB, SESSION);
  // A index may already be repaired before B cleanup fails.
  assert.equal(first.indexedSessionForResolved, SESSION);

  const second = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
  });
  assert.equal(second.ok, true);
  assert.equal(String(second.resolvedProviderId), "A");
  assert.equal(String(second.kvPrintfulOrderId), "A");
  assert.equal(second.indexedSessionForResolved, SESSION);
  assert.equal(second.indexedSessionForStaleB, null);
});

test("AG-079 #2: cleanup ok + KV projection fail; retry converges to A without new durable state", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  });
  await kv.set(printOrderKey(SESSION), {
    sessionId: SESSION,
    status: "failed",
    printfulOrderId: "B",
  });
  await kv.set(fulfillmentIndexKey("B"), SESSION);

  const first = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
    failOnKvProjection: true,
  });
  assert.equal(first.ok, false);
  assert.equal(first.reason, "reconciliation_needed");
  // Cleanup completed: B alias gone, but order KV still holds B as retry intent.
  assert.equal(String(first.kvPrintfulOrderId), "B");
  assert.equal(first.indexedSessionForStaleB, null);
  assert.equal(first.indexedSessionForResolved, SESSION);

  const second = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
  });
  assert.equal(second.ok, true);
  assert.equal(String(second.kvPrintfulOrderId), "A");
  assert.equal(second.indexedSessionForResolved, SESSION);
  assert.equal(second.indexedSessionForStaleB, null);
});

test("AG-079 #3: alias B owned by another session is never deleted", async () => {
  const OTHER = "cs_test_ag079_other_session";
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  });
  await kv.set(printOrderKey(SESSION), {
    sessionId: SESSION,
    status: "failed",
    printfulOrderId: "B",
  });
  await kv.set(fulfillmentIndexKey("B"), OTHER);

  const result = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
  });
  assert.equal(result.ok, true);
  assert.equal(String(result.kvPrintfulOrderId), "A");
  assert.equal(result.indexedSessionForResolved, SESSION);
  assert.equal(await kv.get(fulfillmentIndexKey("B")), OTHER);
});

test("AG-079 #4: successful/idempotent recovery still projects A and clears owned B", async () => {
  const kv = createMemoryKv();
  const authority = createSerializedAuthorityStore();
  await authority.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  });
  await kv.set(printOrderKey(SESSION), {
    sessionId: SESSION,
    status: "failed",
    printfulOrderId: "B",
  });
  await kv.set(fulfillmentIndexKey("B"), SESSION);

  const first = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
  });
  assert.equal(first.ok, true);
  assert.equal(String(first.kvPrintfulOrderId), "A");
  assert.equal(first.indexedSessionForStaleB, null);

  const second = await applyOperatorResolveProjection({
    sessionId: SESSION,
    explicitOperatorId: "",
    authority,
    kv,
  });
  assert.equal(second.ok, true);
  assert.equal(String(second.kvPrintfulOrderId), "A");
  assert.equal(second.indexedSessionForResolved, SESSION);
});

test("AG-079 #5: resolve source commits indexes before order KV projection", () => {
  const setIdx = resolveSource.indexOf("setPrintFulfillmentIndex(projectedProviderId");
  const delIdx = resolveSource.indexOf("deletePrintFulfillmentIndexIfOwned(staleKvProviderId");
  const persistIdx = resolveSource.indexOf(
    "persistPrintOrderRecord(sessionId, updated, { allowClearTerminalFailure: true })",
  );
  assert.ok(setIdx > 0 && delIdx > setIdx && persistIdx > delIdx);
});

test("AG-081 #1: unresolved terminal webhook stays retryable (no 200 ACK)", () => {
  const unresolved = classifyUnresolvedTerminalWebhookSession(null);
  assert.equal(unresolved.ok, false);
  assert.equal(unresolved.status, "session_unresolved");
  assert.equal(unresolved.httpStatus, 503);

  assert.match(printfulWebhookLibSource, /status: "session_unresolved"/);
  assert.match(printfulWebhookLibSource, /ok: false/);
  assert.match(
    printfulWebhookLibSource,
    /if \(!sessionId\)[\s\S]*?status: "session_unresolved"/,
  );
  assert.match(printfulWebhookRouteSource, /status === "session_unresolved"/);
  assert.match(
    printfulWebhookRouteSource,
    /session_unresolved[\s\S]*?status:\s*503/,
  );
  // Must not ACK unresolved terminal as ignored success.
  assert.doesNotMatch(
    printfulWebhookLibSource,
    /if \(!sessionId\)[\s\S]*?ok: true[\s\S]*?session_unresolved/,
  );
});

test("AG-086 #1: ordinary submission fallback error + explicit null stays nonterminal/retryable", async () => {
  const ordinaryAuth = createSerializedAuthorityStore();
  await seedAuthorityFromKvMirror(ordinaryAuth, SESSION, {
    status: "failed",
    printfulOrderId: undefined,
    error: "printful_order_failed",
    terminalEventType: null,
  });
  const ordinary = await ordinaryAuth.get(SESSION);
  assert.equal(ordinary.lifecycle, "unbound");
  assert.equal(ordinary.seededFromKv, true);
  const ordinaryRetry = resolveRetryDoFirst({
    authority: ordinary,
    kvOrder: {
      status: "failed",
      sessionId: SESSION,
      error: "printful_order_failed",
      terminalEventType: null,
    },
  });
  assert.equal(ordinaryRetry.action, "submit");
  assert.notEqual(ordinaryRetry.action, "requires_recover");
});

test("AG-086 #2: true order_failed/order_canceled provenance survives printful_files_failed error", async () => {
  for (const eventType of ["order_failed", "order_canceled"]) {
    const auth = createSerializedAuthorityStore();
    const kv = createMemoryKv();
    await kv.set(printOrderKey(SESSION), {
      status: "sent",
      sessionId: SESSION,
      printfulOrderId: 9001,
      terminalEventType: null,
    });
    const result = await applyTerminalWebhookDoFirst({
      sessionId: SESSION,
      eventType,
      reason: "provider_issue",
      printfulOrderId: 9001,
      kv,
      applyAuthorityOp: (sid, op) => auth.apply(sid, op),
      getAuthority: (sid) => auth.get(sid),
    });
    assert.equal(result.status, "updated");
    // Simulate optional file-review error replacement after terminal write.
    const afterWebhook = await kv.get(printOrderKey(SESSION));
    assert.equal(afterWebhook.terminalEventType, eventType);
    await kv.set(printOrderKey(SESSION), {
      ...afterWebhook,
      error: "printful_files_failed:File download failed",
    });
    const mirrored = await kv.get(printOrderKey(SESSION));
    assert.equal(mirrored.error, "printful_files_failed:File download failed");
    assert.equal(mirrored.terminalEventType, eventType);

    const seedAuth = createSerializedAuthorityStore();
    await seedAuthorityFromKvMirror(seedAuth, `${SESSION}_${eventType}`, mirrored);
    const seeded = await seedAuth.get(`${SESSION}_${eventType}`);
    assert.equal(seeded.lifecycle, "terminal_failed");
    assert.equal(seeded.terminalEventType, eventType);
    assert.equal(
      resolveRetryDoFirst({ authority: seeded, kvOrder: mirrored }).action,
      "requires_recover",
    );
  }
});

test("AG-086 #3: legacy absent provenance cannot resubmit; status exposes reconciliation", async () => {
  const legacy = {
    status: "failed",
    sessionId: SESSION,
    error: "printful_order_failed:legacy",
    // terminalEventType intentionally absent
  };
  assert.equal(isLegacyAmbiguousPrintOrderFailure(legacy), true);
  assert.equal(terminalEventTypeForAuthoritySeed(legacy), null);

  const unbound = createUnboundAuthorityState(SESSION, 1);
  const retry = resolveRetryDoFirst({ authority: unbound, kvOrder: legacy });
  assert.equal(retry.action, "reconciliation_required");
  assert.equal(retry.reason, "legacy_failure_provenance_unknown");
  assert.notEqual(retry.action, "submit");

  const status = resolveStatusDoFirst({
    authority: unbound,
    kvOrder: legacy,
    sessionId: SESSION,
  });
  assert.equal(status.reconciliationNeeded, true);
  assert.equal(status.reason, "legacy_failure_provenance_unknown");

  // Existing nonzero DO authority still wins over legacy KV ambiguity.
  const boundAuth = createSerializedAuthorityStore();
  await boundAuth.apply(SESSION, {
    type: "bind_provider_order_id",
    printfulOrderId: 42,
    now: 2,
  });
  const bound = await boundAuth.get(SESSION);
  assert.equal(bound.revision > 0, true);
  const boundRetry = resolveRetryDoFirst({ authority: bound, kvOrder: legacy });
  assert.equal(boundRetry.action, "already_bound");
});

test("AG-086 #4: local validation failures are explicit null; sent/operator recovery clears marker", async () => {
  assert.match(retrySource, /terminalEventType:\s*null/);
  assert.match(webhookSource, /terminalEventType:\s*null/);
  assert.match(resolveSource, /terminalEventType:\s*null/);
  assert.match(printfulWebhookLibSource, /terminalEventType:\s*eventType/);
  assert.match(statusSource, /legacy_failure_provenance_unknown/);
  assert.match(retrySource, /legacy_failure_provenance_unknown/);
  assert.doesNotMatch(authoritySource, /terminalEventTypeFromKvFailureError/);
  assert.match(authoritySource, /terminalEventTypeForAuthoritySeed/);

  const recovered = projectPrintOrderWithAuthority(
    {
      status: "failed",
      sessionId: SESSION,
      printfulOrderId: 1,
      error: "printful_order_failed",
      terminalEventType: "order_failed",
    },
    {
      sessionId: SESSION,
      printfulOrderId: "1",
      lifecycle: "operator_recovered",
      terminalReason: null,
      terminalEventType: null,
      revision: 3,
      updatedAt: 1,
      seededFromKv: false,
    },
  );
  assert.equal(recovered.status, "sent");
  assert.equal(recovered.terminalEventType, null);
  assert.equal(recovered.error, undefined);
});

test("AG-086 #5: serialization distinguishes string vs null vs absent provenance", () => {
  const withTerminal = {
    status: "failed",
    sessionId: SESSION,
    error: "printful_files_failed:x",
    terminalEventType: "order_failed",
  };
  const withNull = {
    status: "failed",
    sessionId: SESSION,
    error: "printful_order_failed",
    terminalEventType: null,
  };
  const absent = {
    status: "failed",
    sessionId: SESSION,
    error: "printful_order_failed",
  };

  const roundTrip = (value) => JSON.parse(JSON.stringify(value));
  const rtTerminal = roundTrip(withTerminal);
  const rtNull = roundTrip(withNull);
  const rtAbsent = roundTrip(absent);

  assert.equal(rtTerminal.terminalEventType, "order_failed");
  assert.equal(Object.prototype.hasOwnProperty.call(rtTerminal, "terminalEventType"), true);
  assert.equal(rtNull.terminalEventType, null);
  assert.equal(Object.prototype.hasOwnProperty.call(rtNull, "terminalEventType"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(rtAbsent, "terminalEventType"), false);
  assert.equal(isLegacyAmbiguousPrintOrderFailure(rtAbsent), true);
  assert.equal(isLegacyAmbiguousPrintOrderFailure(rtNull), false);
  assert.equal(isLegacyAmbiguousPrintOrderFailure(rtTerminal), false);
  assert.equal(terminalEventTypeForAuthoritySeed(rtTerminal), "order_failed");
  assert.equal(terminalEventTypeForAuthoritySeed(rtNull), null);
  assert.equal(terminalEventTypeForAuthoritySeed(rtAbsent), null);
  assert.equal(kvFailedMirrorBlocksNonterminalWrite(rtNull), false);
  assert.equal(kvFailedMirrorBlocksNonterminalWrite(rtTerminal), true);
  assert.equal(kvFailedMirrorBlocksNonterminalWrite(rtAbsent), true);
});

test("AG-086 #6: seed + retry idempotent for ordinary failed mirror with explicit null", async () => {
  const authority = createSerializedAuthorityStore();
  const mirror = { status: "failed", error: "asset_url_missing", terminalEventType: null };
  await seedAuthorityFromKvMirror(authority, SESSION, mirror, 1);
  await seedAuthorityFromKvMirror(authority, SESSION, mirror, 2);
  const state = await authority.get(SESSION);
  assert.equal(state.lifecycle, "unbound");
  assert.equal(state.revision, 1);
  assert.equal(state.seededFromKv, true);
  assert.equal(resolveRetryDoFirst({ authority: state, kvOrder: mirror }).action, "submit");
});

test("S96-1 F3: a pending review is stamped and persisted for the sweep to revisit", async () => {
  const kv = createMemoryKv();
  const result = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord(),
    kv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "waiting" }]),
  });
  assert.equal(result.record.fileReviewState, "pending");
  assert.equal(typeof result.record.fileReviewCheckedAt, "number");
  assert.equal(result.record.fileReviewPendingSince, result.record.fileReviewCheckedAt);
  assert.equal(result.reviewPersist?.outcome, "persisted", "the pending stamp must be durable, not just returned");
  const stored = await kv.get(printOrderKey(SESSION));
  assert.equal(stored.fileReviewState, "pending");
  assert.equal(stored.fileReviewPendingSince, result.record.fileReviewPendingSince);
});

test("S96-1 F3: failed and healthy reviews stamp their resolution and close the pending episode", async () => {
  const failedKv = createMemoryKv();
  const failed = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord({ fileReviewPendingSince: 123 }),
    kv: failedKv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "failed" }]),
  });
  assert.equal(failed.record.fileReviewState, "failed");
  assert.equal(failed.record.fileReviewPendingSince, undefined);

  const healthyKv = createMemoryKv();
  const healthy = await bindAcceptedPrintfulIdentityThenReview({
    sessionId: SESSION,
    sentRecord: baseSentRecord({ fileReviewPendingSince: 123 }),
    kv: healthyKv,
    reviewResult: buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
  });
  assert.equal(healthy.record.fileReviewState, "healthy");
  assert.equal(healthy.record.fileReviewPendingSince, undefined);
  const storedHealthy = await healthyKv.get(printOrderKey(SESSION));
  assert.equal(storedHealthy.fileReviewState, "healthy");
});

test("S96-1 F8: review merge refuses records that no longer describe the reviewed order", () => {
  const reviewed = { status: "sent", printfulOrderId: "PF-1", fileReviewState: "healthy", fileReviewCheckedAt: 10 };
  assert.equal(applyReviewOutcomeToCurrent(null, reviewed), null);
  assert.equal(applyReviewOutcomeToCurrent({ status: "failed", printfulOrderId: "PF-1" }, reviewed), null);
  assert.equal(
    applyReviewOutcomeToCurrent({ status: "sent", printfulOrderId: "PF-1", shippedAt: 5 }, reviewed),
    null,
    "a shipped record is not annotated over",
  );
  assert.equal(
    applyReviewOutcomeToCurrent({ status: "sent", printfulOrderId: "PF-2" }, reviewed),
    null,
    "a different bound id is not annotated over",
  );
  assert.equal(
    applyReviewOutcomeToCurrent(
      { status: "sent", printfulOrderId: "PF-1", fileReviewState: "failed" },
      { ...reviewed, fileReviewState: "pending" },
    ),
    null,
    "a resolved review is never regressed by a stale pending outcome",
  );
});

test("S96-1 F8: review merge preserves concurrent fields and moves alert stamps only forward", () => {
  const current = {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "pending",
    fileReviewPendingSince: 100,
    shippingNotificationSentAt: 999,
    operatorAlertError: "earlier_failure",
  };
  const reviewed = {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 500,
    operatorAlertedAt: 500,
    operatorAlertProvider: "resend",
    operatorAlertError: undefined,
    shippingNotificationSentAt: undefined,
  };
  const merged = applyReviewOutcomeToCurrent(current, reviewed);
  assert.equal(merged.fileReviewState, "healthy");
  assert.equal(merged.fileReviewPendingSince, undefined);
  assert.equal(merged.shippingNotificationSentAt, 999, "a concurrent writer's field survives the merge");
  assert.equal(merged.operatorAlertedAt, 500);
  assert.equal(merged.operatorAlertError, undefined, "a delivered stamp clears the earlier error");

  const stillPending = applyReviewOutcomeToCurrent(current, {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "pending",
    fileReviewCheckedAt: 700,
    fileReviewPendingSince: 700,
  });
  assert.equal(stillPending.fileReviewPendingSince, 100, "the episode clock keeps its earliest observation");
  assert.equal(stillPending.fileReviewCheckedAt, 700);
});

test("S96-1 F3/F8: source wiring — stamps, merge persist, and the sweep runtime", () => {
  assert.match(postSubmitSource, /fileReviewState: "pending"/);
  assert.match(postSubmitSource, /fileReviewState: "failed"/);
  assert.match(postSubmitSource, /fileReviewState: "healthy"/);
  assert.match(postSubmitSource, /export function applyReviewOutcomeToCurrent/);
  assert.match(postSubmitSource, /applyReviewOutcomeToCurrent\(freshReview, reviewed\)/);
  const sweepRuntimeSource = fs.readFileSync(
    path.join(appRoot, "src/lib/printOrderReviewSweepRuntime.ts"),
    "utf8",
  );
  assert.match(sweepRuntimeSource, /applyReviewOutcomeToCurrent/);
  assert.match(sweepRuntimeSource, /runScheduledPrintOrderReviewSweep/);
  const workerSource = fs.readFileSync(path.join(appRoot, "cloudflare-worker.ts"), "utf8");
  assert.match(workerSource, /runScheduledPrintOrderReviewSweep\(env\)/);
});

test("S96-1 F4: retry route dispatch parity with the webhook (source pins)", () => {
  // Merch margin skip — the poster margin model must not gate merch.
  assert.match(retrySource, /merch_margin_skipped/);
  // Merch with V2 configured goes through the catalog path with the
  // webhook's argument shape (family placement/technique/label).
  assert.match(retrySource, /submitPrintfulV2CatalogOrder\(\{/);
  assert.match(retrySource, /catalogVariantId: hydrated\.merchCatalogVariantId/);
  assert.match(retrySource, /placement: family\?\.placement \?\? "default"/);
  assert.match(retrySource, /technique: family\?\.technique \?\? "digital"/);
  // The poster v1 path is closed to merch.
  assert.match(retrySource, /if \(!isMerchRetry && isPrintfulConfigured\(\)\)/);
  // No destination anywhere is a persisted problem, not a bare 503.
  assert.match(retrySource, /error: "fulfillment_not_configured"/);
  assert.doesNotMatch(retrySource, /error: "Fulfillment not configured"/);
});

test("S96-1 F9: an undelivered failure alert keeps the Stripe event retryable (source pins)", () => {
  assert.match(webhookSource, /throw new PrintOrderFailureAlertError\(/);
  assert.match(webhookSource, /isPrintOrderFailureAlertError\(error\)/);
  assert.match(webhookSource, /failure alert undelivered; Stripe event remains retryable/);
  // The throw is scoped to records with no other discovery surface: a
  // standing alternate-dispatch marker refuses every later dispatch and
  // surfaces on the admin retry, and the S94-1 gate rounds pinned
  // event finalization for those records. Since the S96 follow-up
  // integration the alert send lives in the shared failure-persistence
  // helper, which reports this pass's alert outcome on its result;
  // the webhook's throw condition reads that outcome against the
  // standing (merged) record's marker.
  assert.match(webhookSource, /outcome\.failureAlertUndelivered && !outcome\.record\.alternateDispatch/);
  const failurePersistSource = fs.readFileSync(
    path.join(appRoot, "src/lib/printOrderFailurePersist.ts"),
    "utf8",
  );
  assert.match(failurePersistSource, /failureAlertUndelivered = true/);
  assert.match(webhookSource, /strandedAlertUndelivered && !strandedRecord\.alternateDispatch/);
  const authorityLibSource = fs.readFileSync(
    path.join(appRoot, "src/lib/printOrderAuthority.ts"),
    "utf8",
  );
  assert.match(authorityLibSource, /export class PrintOrderFailureAlertError/);
  assert.match(authorityLibSource, /export function isPrintOrderFailureAlertError/);
});
