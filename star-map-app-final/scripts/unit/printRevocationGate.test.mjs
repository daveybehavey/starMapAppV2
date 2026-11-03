/**
 * A-01 (audit loop, 2026-11-03; issue #540) — revocation gate for
 * print dispatch. PROVEN defect at 66edb096: settlement could observe
 * a revocation and correctly suppress the entitlement grants while
 * the print queue still manufactured the refunded order —
 * processCheckoutFulfillment's revoked branch set only
 * skipEntitlementGrants, queuePrintOrder never consulted revocation
 * evidence before any of its three dispatch destinations, and the
 * admin retry route had no revocation consultation either.
 *
 * Pinned fix shape:
 * - the shared strict helper sessionIsRevokedForPrintDispatch
 *   (entitlementsStore) reports revocation from the session record
 *   flag OR the durable evidence (session-revoked sidecar, PI
 *   tombstone), and THROWS on unreadable evidence (fail closed);
 * - the webhook's revoked settlement outcome also sets
 *   skipPrintOrder, and queuePrintOrder re-checks the evidence at
 *   its own gate — after the sent re-checks, before the pending
 *   persist and every dispatch — persisting a durable problem
 *   record (print_order_revocation_blocked) instead of dispatching;
 * - the retry route consults the same helper beside the F-1
 *   pre-dispatch stand-down: revoked -> 409, unreadable -> 503,
 *   never a dispatch.
 *
 * Route-level retry behaviour is pinned behaviourally in
 * printRetryRevocation.test.mjs; the webhook route's shape is
 * pinned here by source assertions in the printPaymentGate idiom.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./tsAliasLoader.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `a01-gate-kv-${RUN}-`));

const { kv } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV, sessionIsRevokedForPrintDispatch } = await import(
  "../../src/lib/entitlementsStore.ts"
);

const piRevokedKey = (piId) => `stripe:pi:revoked:${piId}`;
let counter = 0;
const nextSessionId = () => `cs_test_a01_${RUN}_${(counter += 1)}`;

test("helper: no record and no evidence -> not revoked", async () => {
  const sessionId = nextSessionId();
  assert.equal(await sessionIsRevokedForPrintDispatch(sessionId), false);
});

test("helper: session record flag -> revoked", async () => {
  const sessionId = nextSessionId();
  await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), {
    paid: true,
    revoked: true,
    reason: "refund",
    paymentIntentId: "pi_a01_flag",
  });
  assert.equal(await sessionIsRevokedForPrintDispatch(sessionId), true);
});

test("helper: session-revoked sidecar only -> revoked", async () => {
  const sessionId = nextSessionId();
  await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), {
    paid: true,
    revoked: false,
    paymentIntentId: "pi_a01_sidecar",
  });
  await kv.set(ENTITLEMENT_KV.sessionRevoked(sessionId), {
    revoked: true,
    reason: "refund",
    revokedAt: Date.now(),
  });
  assert.equal(await sessionIsRevokedForPrintDispatch(sessionId), true);
});

test("helper: PI tombstone via the record's payment intent -> revoked", async () => {
  const sessionId = nextSessionId();
  await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), {
    paid: true,
    revoked: false,
    paymentIntentId: "pi_a01_tombstone",
  });
  await kv.set(piRevokedKey("pi_a01_tombstone"), { revoked: true, reason: "dispute" });
  assert.equal(await sessionIsRevokedForPrintDispatch(sessionId), true);
});

test("helper: explicit payment intent argument is consulted without a record", async () => {
  const sessionId = nextSessionId();
  await kv.set(piRevokedKey("pi_a01_explicit"), { revoked: true, reason: "refund" });
  assert.equal(await sessionIsRevokedForPrintDispatch(sessionId, "pi_a01_explicit"), true);
  // And a different, untombstoned intent reads clean.
  assert.equal(await sessionIsRevokedForPrintDispatch(sessionId, "pi_a01_other"), false);
});

test("helper: paid record with no revocation anywhere -> not revoked", async () => {
  const sessionId = nextSessionId();
  await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), {
    paid: true,
    revoked: false,
    paymentIntentId: "pi_a01_clean",
  });
  assert.equal(await sessionIsRevokedForPrintDispatch(sessionId), false);
});

test("helper: unreadable evidence THROWS (fail closed, never reads as not-revoked)", async () => {
  const sessionId = nextSessionId();
  const original = kv.getErrorPreserving;
  kv.getErrorPreserving = async () => {
    throw new Error("kv_read_unavailable");
  };
  try {
    await assert.rejects(
      () => sessionIsRevokedForPrintDispatch(sessionId),
      /kv_read_unavailable/,
    );
  } finally {
    kv.getErrorPreserving = original;
  }
});

/* ---------------- source pins (printPaymentGate idiom) ---------------- */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webhookSource = fs.readFileSync(
  path.join(ROOT, "src/app/api/stripe/webhook/route.ts"),
  "utf8",
);
const retrySource = fs.readFileSync(
  path.join(ROOT, "src/app/api/print/orders/retry/route.ts"),
  "utf8",
);

test("webhook: revoked settlement outcome suppresses BOTH grants and the print queue", () => {
  const branch = webhookSource.match(
    /if \(paidOutcome\.kind === "revoked"\) \{[\s\S]*?\n      \}/,
  );
  assert.ok(branch, "revoked outcome branch present");
  assert.match(branch[0], /skipEntitlementGrants = true;/);
  assert.match(branch[0], /skipPrintOrder = true;/);
});

test("webhook: queuePrintOrder gates on revocation evidence before the pending persist and every dispatch", () => {
  const start = webhookSource.indexOf("async function queuePrintOrder");
  assert.ok(start > 0, "queuePrintOrder present");
  const segment = webhookSource.slice(start);
  const gateIdx = segment.indexOf(
    "await sessionIsRevokedForPrintDispatch(session.id, checkoutPaymentIntentId(session))",
  );
  assert.ok(gateIdx > 0, "revocation gate call present in queuePrintOrder");
  const pendingPersistIdx = segment.indexOf("persistPrintOrderRecord(session.id, payload)");
  const v2Idx = segment.indexOf("submitPrintfulV2CatalogOrder({");
  const v1Idx = segment.indexOf("submitPrintfulOrder({");
  const alternateIdx = segment.indexOf("fetch(printFulfillmentWebhookUrl");
  assert.ok(gateIdx < pendingPersistIdx, "gate precedes the pending persist");
  assert.ok(gateIdx < v2Idx, "gate precedes the Printful V2 dispatch");
  assert.ok(gateIdx < v1Idx, "gate precedes the Printful v1 dispatch");
  assert.ok(gateIdx < alternateIdx, "gate precedes the alternate webhook dispatch");
  const gateBlock = segment.slice(gateIdx, gateIdx + 600);
  assert.match(gateBlock, /persistProblemPrintOrder\(/);
  assert.match(gateBlock, /error: "print_order_revocation_blocked"/);
  assert.match(gateBlock, /status: "failed"/);
});

test("retry: revocation gate sits at the dispatch decision (after the F-1 stand-down, before any submission)", () => {
  const standDownIdx = retrySource.indexOf("const movedBeforeDispatch = await standDownIfFulfillmentMoved();");
  const gateIdx = retrySource.indexOf("await sessionIsRevokedForPrintDispatch(sessionId)");
  const v2Idx = retrySource.indexOf("submitPrintfulV2CatalogOrder({");
  const v1Idx = retrySource.indexOf("submitPrintfulOrder({");
  assert.ok(standDownIdx > 0, "F-1 stand-down present");
  assert.ok(gateIdx > standDownIdx, "revocation gate follows the F-1 stand-down");
  assert.ok(gateIdx < v2Idx, "gate precedes the Printful V2 submission");
  assert.ok(gateIdx < v1Idx, "gate precedes the Printful v1 submission");
  const gateBlock = retrySource.slice(gateIdx, gateIdx + 1600);
  assert.match(gateBlock, /print_order_revocation_blocked/);
  assert.match(gateBlock, /status: 409/);
  assert.match(gateBlock, /revocation_evidence_unreadable/);
  assert.match(gateBlock, /status: 503/);
});
