/**
 * M1-04 destination-exclusivity harness.
 *
 * Mirrors the destination-selection segment of
 * src/app/api/stripe/webhook/route.ts::queuePrintOrder (regular print +
 * merch entry), the way printFulfillmentIdempotency.harness.mjs mirrors
 * src/lib/printful.ts. The production source shape is pinned by
 * printDualFulfillment.test.mjs so the mirror cannot drift silently.
 *
 * Modelled contract (Slate 55 S55-1, selected design):
 * - A regular print invocation that selects the Printful v1 branch NEVER
 *   reaches the alternate fulfilment POST, whatever the v1 outcome:
 *   accepted, reported failure, bind conflict/unread, post-accept
 *   unretainable, or a crash at the former fallthrough point.
 * - The alternate POST remains reachable when v1 is unconfigured.
 * - The merch branch never reaches the alternate POST (including the
 *   existing no-submission case when only the alternate URL is set).
 * - Webhook re-entry with a visible `sent` record makes no manufacturing
 *   POST; confirmation retry stays possible.
 * - Concurrent invocations before `sent` is visible may both call v1 —
 *   the invariant asserted here is alternate == 0, not v1 == 1.
 *
 * No Stripe discount-bearing fixtures are used; destination selection sits
 * below the discount gate, so no pinned-API payload shape is exercised.
 */

export class SimulatedCrashError extends Error {
  constructor(point) {
    super(`simulated_crash:${point}`);
    this.name = "SimulatedCrashError";
    this.point = point;
  }
}

export class SimulatedBindError extends Error {
  constructor(reason) {
    super(`print_order_authority_bind:${reason}`);
    this.name = "SimulatedBindError";
    this.reason = reason;
  }
}

export class SimulatedUnretainableError extends Error {
  constructor(reason) {
    super(`print_order_unretainable:${reason}`);
    this.name = "SimulatedUnretainableError";
    this.reason = reason;
  }
}

/**
 * Scripted environment:
 * - printfulConfigured / printfulV2Configured / alternateUrl / submissionEnabled
 * - printful: queue of POST outcomes: { accept: orderId } | { fail: error } |
 *   { nonEditable: existingOrderId } (POST rejected as no-longer-editable,
 *   reconciled by GET to the original id — never a second external id)
 * - bind: "persisted" | "deleted_unretainable" | "conflict"
 * - alternateStatus: HTTP status the alternate fake returns
 * - crashAt: "after_bind" — throw SimulatedCrashError immediately after a
 *   successful bind/persist, i.e. exactly where control used to fall
 *   through to the alternate POST.
 * - existingRecord: the KV print-order record visible at entry (or null).
 * - shared: pass the same env object across invocations to model durable
 *   KV visibility between deliveries (record + counters persist).
 */
export function createDestinationEnv(script = {}) {
  return {
    printfulConfigured: script.printfulConfigured ?? true,
    printfulV2Configured: script.printfulV2Configured ?? false,
    alternateUrl: script.alternateUrl ?? "https://alternate.invalid/fulfill",
    submissionEnabled: script.submissionEnabled ?? true,
    alternateStatus: script.alternateStatus ?? 200,
    bind: script.bind ?? "persisted",
    crashAt: script.crashAt ?? null,
    printfulOutcomes: [...(script.printfulOutcomes ?? [{ accept: 7001 }])],
    record: script.existingRecord ?? null,
    counters: { printfulPost: 0, printfulGet: 0, printfulV2Post: 0, alternatePost: 0 },
    externalIds: [],
    confirmationDispatched: 0,
    problemRecords: [],
  };
}

function nextPrintfulOutcome(env) {
  if (env.printfulOutcomes.length > 1) return env.printfulOutcomes.shift();
  return env.printfulOutcomes[0];
}

async function submitPrintful(env, sessionId) {
  env.counters.printfulPost += 1;
  env.externalIds.push(sessionId);
  const outcome = nextPrintfulOutcome(env);
  if (outcome.fail) return { ok: false, status: 500, error: outcome.fail };
  if (outcome.nonEditable) {
    // OR-1 reconcile: GET by the same external id, original order id back.
    env.counters.printfulGet += 1;
    return { ok: true, status: 200, orderId: outcome.nonEditable, reconciled: true };
  }
  return { ok: true, status: 200, orderId: outcome.accept };
}

async function bindIdentity(env, sentRecord) {
  if (env.bind === "deleted_unretainable") {
    return { outcome: "deleted_unretainable", record: sentRecord, bindOk: false };
  }
  if (env.bind === "conflict") {
    return { outcome: "rejected", record: sentRecord, bindOk: false, bindFailureReason: "identity_conflict" };
  }
  env.record = sentRecord;
  return { outcome: "persisted", record: sentRecord, bindOk: true };
}

/**
 * One queuePrintOrder invocation's destination selection, regular gates
 * (asset / recipient / charge / margin) assumed already passed — they are
 * destination-neutral and covered by their own suites.
 * Returns an outcome descriptor; throws Simulated* errors where the route
 * throws (bind failure / unretainable / crash).
 */
export async function simulateQueuePrintOrder(env, { sessionId = "cs_test_m104", merch = false } = {}) {
  // Entry guard: visible `sent` stops manufacturing; confirmation may retry.
  if (env.record?.status === "sent") {
    return { outcome: "already_sent", confirmationRetry: true };
  }

  const payload = { status: "pending", sessionId, attempts: (env.record?.attempts ?? 0) + 1 };
  env.record = payload;

  if (!env.submissionEnabled) {
    env.problemRecords.push({ ...payload, status: "pending", error: "submission_disabled" });
    env.record = { ...payload, status: "pending", error: "submission_disabled" };
    return { outcome: "submission_disabled" };
  }

  if (merch) {
    if (!env.printfulV2Configured && !env.alternateUrl) {
      env.problemRecords.push({ ...payload, status: "failed", error: "fulfillment_not_configured" });
      return { outcome: "fulfillment_not_configured" };
    }
    if (env.printfulV2Configured) {
      env.counters.printfulV2Post += 1;
      const sentRecord = { ...payload, status: "sent", printfulOrderId: 8001 };
      const bind = await bindIdentity(env, sentRecord);
      if (bind.outcome === "deleted_unretainable") throw new SimulatedUnretainableError("expired_or_below_min_ttl");
      if (!bind.bindOk) throw new SimulatedBindError(bind.bindFailureReason ?? "bind_rejected");
      env.confirmationDispatched += 1;
      return { outcome: "merch_v2_sent" };
    }
    // V2 unconfigured, alternate configured: existing no-submission case.
    return { outcome: "merch_no_submission" };
  }

  if (!env.printfulConfigured && !env.alternateUrl) {
    env.problemRecords.push({ ...payload, status: "failed", error: "fulfillment_not_configured" });
    return { outcome: "fulfillment_not_configured" };
  }

  if (env.printfulConfigured) {
    const result = await submitPrintful(env, sessionId);
    if (!result.ok) {
      env.problemRecords.push({ ...payload, status: "failed", error: result.error ?? "printful_order_failed" });
      env.record = { ...payload, status: "failed", error: result.error ?? "printful_order_failed" };
      return { outcome: "printful_failed" };
    }
    const sentRecord = { ...payload, status: "sent", printfulOrderId: result.orderId };
    const bind = await bindIdentity(env, sentRecord);
    if (bind.outcome === "deleted_unretainable") {
      throw new SimulatedUnretainableError("expired_or_below_min_ttl");
    }
    if (!bind.bindOk) {
      throw new SimulatedBindError(bind.bindFailureReason ?? "bind_rejected");
    }
    env.confirmationDispatched += 1;
    if (env.crashAt === "after_bind") {
      // Process dies at the exact point control previously fell through.
      throw new SimulatedCrashError("after_bind");
    }
    // M1-04: unconditional return ends the invocation here.
    return { outcome: "printful_sent", printfulOrderId: result.orderId, reconciled: Boolean(result.reconciled) };
  }

  // Alternate-only destination.
  env.counters.alternatePost += 1;
  if (env.alternateStatus < 200 || env.alternateStatus >= 300) {
    env.problemRecords.push({ ...payload, status: "failed", error: `Webhook ${env.alternateStatus}` });
    env.record = { ...payload, status: "failed", error: `Webhook ${env.alternateStatus}` };
    return { outcome: "alternate_failed" };
  }
  env.record = { ...payload, status: "sent", webhookStatus: env.alternateStatus };
  return { outcome: "alternate_sent" };
}
