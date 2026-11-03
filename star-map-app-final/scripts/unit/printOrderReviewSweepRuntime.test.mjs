/**
 * PR #502 gate round 5 — local Codex seat P2 "The sweep can overwrite
 * a shipment or operator resolve committed after its merge read".
 *
 * The review sweep's runtime store persisted like this: read the
 * current record, merge the review outcome onto it, await the
 * authority lifecycle read, then put the merged snapshot. A shipment
 * write (shippedAt) or an operator resolve landing in KV during the
 * authority await was erased by that put — losing shippedAt also
 * re-exposed the order to later review and alerts. The terminal-
 * authority guard could not see either write (both are non-terminal).
 *
 * Fix (in createPrintOrderReviewSweepStore's persistRecord): after
 * the authority guard passes, re-read the record and re-merge the
 * outcome onto the freshest state before the put, with no awaits
 * between the re-read and the put beyond the put itself.
 *
 * These tests drive the REAL runtime store with a fake raw-KV
 * namespace and a scripted authority read that can be held open —
 * the persist window — while a concurrent write lands.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./printOrderReviewSweepRuntime.hooks.mjs", import.meta.url);

const { createPrintOrderReviewSweepStore } = await import(
  "../../src/lib/printOrderReviewSweepRuntime.ts"
);
const { printOrderKey } = await import("./printOrderReviewSweepRuntime.orders.stub.mjs");
const { sweepRuntimeStubState, resetSweepRuntimeStubState } = await import(
  "./printOrderReviewSweepRuntime.stubState.mjs"
);

const SESSION = "cs_test_review_sweep_runtime";
const CREATED_AT = 1_800_000_000_000;

function createFakeNs(seedRecord) {
  const map = new Map();
  if (seedRecord) map.set(printOrderKey(seedRecord.sessionId), JSON.stringify(seedRecord));
  return {
    map,
    async list() {
      return { keys: [...map.keys()].map((name) => ({ name })), list_complete: true };
    },
    async get(key) {
      const raw = map.get(key);
      return raw ? JSON.parse(raw) : null;
    },
    async put(key, value) {
      map.set(key, value);
    },
    stored(sessionId) {
      const raw = map.get(printOrderKey(sessionId));
      return raw ? JSON.parse(raw) : null;
    },
    write(sessionId, record) {
      map.set(printOrderKey(sessionId), JSON.stringify(record));
    },
  };
}

function baseRecord(overrides = {}) {
  return {
    status: "sent",
    sessionId: SESSION,
    printfulOrderId: "PF-100",
    createdAt: CREATED_AT,
    fileReviewState: "pending",
    fileReviewCheckedAt: 100,
    fileReviewPendingSince: 50,
    ...overrides,
  };
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function untilAuthorityRead() {
  for (let i = 0; i < 100 && !sweepRuntimeStubState.authorityReadStarted; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(sweepRuntimeStubState.authorityReadStarted, true, "the persist reached its authority read");
}

test("gate round 5: a shipment landing during the authority read is not overwritten (P2-B repro)", async () => {
  resetSweepRuntimeStubState();
  const ns = createFakeNs(baseRecord());
  const gate = deferred();
  sweepRuntimeStubState.authorityGate = gate.promise;
  const store = createPrintOrderReviewSweepStore(ns, { stub: true });
  const reviewed = baseRecord({ fileReviewCheckedAt: 200, fileReviewPendingAlertedAt: 999 });

  const persistPromise = store.persistRecord(SESSION, reviewed);
  await untilAuthorityRead();
  // The package ships while the sweep's authority read is in flight.
  ns.write(SESSION, baseRecord({ shippedAt: 555, shippingNotificationSentAt: 556 }));
  gate.release();

  const result = await persistPromise;
  assert.equal(result.outcome, "skipped");
  assert.equal(result.reason, "review_state_changed");
  const stored = ns.stored(SESSION);
  assert.equal(stored.shippedAt, 555, "the shipment fact survives the sweep persist");
  assert.equal(stored.shippingNotificationSentAt, 556);
  assert.equal(stored.fileReviewCheckedAt, 100, "no stale review snapshot was written over it");
});

test("gate round 5: an operator resolve landing during the authority read survives the re-merge", async () => {
  resetSweepRuntimeStubState();
  const ns = createFakeNs(baseRecord());
  const gate = deferred();
  sweepRuntimeStubState.authorityGate = gate.promise;
  const store = createPrintOrderReviewSweepStore(ns, { stub: true });
  const reviewed = baseRecord({ fileReviewCheckedAt: 200, fileReviewPendingAlertedAt: 999 });

  const persistPromise = store.persistRecord(SESSION, reviewed);
  await untilAuthorityRead();
  // An operator resolves the order (attestation with provenance)
  // while the sweep's authority read is in flight.
  ns.write(
    SESSION,
    baseRecord({
      operatorResolvedAt: 777,
      operatorResolvedProvider: "manual_printful",
      operatorResolvedNote: "handled at the shop",
    }),
  );
  gate.release();

  const result = await persistPromise;
  assert.equal(result.outcome, "persisted");
  const stored = ns.stored(SESSION);
  assert.equal(stored.operatorResolvedAt, 777, "the resolve attestation survives");
  assert.equal(stored.operatorResolvedProvider, "manual_printful");
  assert.equal(stored.operatorResolvedNote, "handled at the shop");
  assert.equal(stored.fileReviewCheckedAt, 200, "the review outcome still lands");
  assert.equal(stored.fileReviewPendingAlertedAt, 999);
  assert.equal(stored.fileReviewPendingSince, 50, "the episode clock keeps its earliest observation");
});

test("gate round 5: with no concurrent write the persist behaves as before", async () => {
  resetSweepRuntimeStubState();
  const ns = createFakeNs(baseRecord());
  const store = createPrintOrderReviewSweepStore(ns, { stub: true });
  const reviewed = baseRecord({ fileReviewCheckedAt: 200, fileReviewPendingAlertedAt: 999 });

  const result = await store.persistRecord(SESSION, reviewed);
  assert.equal(result.outcome, "persisted");
  const stored = ns.stored(SESSION);
  assert.equal(stored.fileReviewCheckedAt, 200);
  assert.equal(stored.fileReviewPendingAlertedAt, 999);
  assert.equal(stored.fileReviewPendingSince, 50);
});

test("gate round 5: a terminal authority still refuses the persist", async () => {
  resetSweepRuntimeStubState();
  sweepRuntimeStubState.lifecycle = "terminal_failed";
  const ns = createFakeNs(baseRecord());
  const store = createPrintOrderReviewSweepStore(ns, { stub: true });
  const reviewed = baseRecord({ fileReviewCheckedAt: 200 });

  const result = await store.persistRecord(SESSION, reviewed);
  assert.equal(result.outcome, "skipped");
  assert.equal(result.reason, "authority_terminal_failure");
  assert.equal(ns.stored(SESSION).fileReviewCheckedAt, 100, "nothing was written");
});
