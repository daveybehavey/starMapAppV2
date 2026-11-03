/**
 * #551 N3 (fresh-eyes audit, PR #541) — hold-sweep adapter regression
 * tests.
 *
 * The defect: createPrintOrderHoldSweepStore's persistRecord re-read
 * and merged the sweep's stamps onto the current KV record BEFORE
 * its awaited authority lifecycle read, then put that merge with no
 * second re-read. A shipment write (shippedAt + notification stamps)
 * or a hold-clearing resolve landing in KV during the authority await
 * was overwritten by the put — the ended hold resurrected
 * (providerHoldAt restored; shipment/notification stamps removed).
 * The review adapter was repaired for this exact window in PR #502
 * gate round 5 (post-authority re-read + re-merge); the hold adapter
 * never got it.
 *
 * Fix (mirrors the review adapter): after the authority guard
 * passes, re-read the record and re-merge the stamps onto the
 * freshest state before the put; applyHoldSweepStampsToCurrent
 * refuses when the hold episode has ended or changed, so nothing is
 * written in that case.
 *
 * These tests drive the REAL runtime store with a fake raw-KV
 * namespace and a scripted authority read that can be held open —
 * the persist window — while a concurrent write lands (the audit's
 * deterministic reproduction).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./printOrderHoldSweepRuntime.hooks.mjs", import.meta.url);

const { createPrintOrderHoldSweepStore } = await import(
  "../../src/lib/printOrderHoldSweepRuntime.ts"
);
const { printOrderKey } = await import("./printOrderHoldSweepRuntime.orders.stub.mjs");
const { holdSweepRuntimeStubState, resetHoldSweepRuntimeStubState } = await import(
  "./printOrderHoldSweepRuntime.stubState.mjs"
);

const SESSION = "cs_test_hold_sweep_runtime";
const CREATED_AT = 1_800_000_000_000;
const HOLD_AT = 1_000;

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

function heldRecord(overrides = {}) {
  return {
    status: "sent",
    sessionId: SESSION,
    printfulOrderId: "PF-200",
    createdAt: CREATED_AT,
    providerHoldAt: HOLD_AT,
    providerHoldReason: "address_issue",
    ...overrides,
  };
}

/** The sweep's persist input: the scanned record plus its alert stamp outcome. */
function sweptRecord(overrides = {}) {
  return heldRecord({
    operatorHoldAlertedAt: 2_000,
    operatorHoldAlertProvider: "resend",
    ...overrides,
  });
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function untilAuthorityRead() {
  for (let i = 0; i < 100 && !holdSweepRuntimeStubState.authorityReadStarted; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(
    holdSweepRuntimeStubState.authorityReadStarted,
    true,
    "the persist reached its authority read",
  );
}

test("N3 repro: a shipment + hold-clear landing during the authority read is not overwritten — the ended hold does not resurrect", async () => {
  resetHoldSweepRuntimeStubState();
  const ns = createFakeNs(heldRecord());
  const gate = deferred();
  holdSweepRuntimeStubState.authorityGate = gate.promise;
  const store = createPrintOrderHoldSweepStore(ns, { stub: true });

  const persistPromise = store.persistRecord(SESSION, sweptRecord());
  await untilAuthorityRead();
  // The package ships and the hold is cleared while the sweep's
  // authority read is in flight (the audit's reproduction: both land
  // inside the authority getState window).
  const shipped = heldRecord({ shippedAt: 555, shippingNotificationSentAt: 556 });
  delete shipped.providerHoldAt;
  delete shipped.providerHoldReason;
  ns.write(SESSION, shipped);
  gate.release();

  const result = await persistPromise;
  assert.equal(result.outcome, "skipped");
  assert.equal(result.reason, "hold_state_changed");
  const stored = ns.stored(SESSION);
  assert.equal(stored.shippedAt, 555, "the shipment fact survives the sweep persist");
  assert.equal(stored.shippingNotificationSentAt, 556, "the notification stamp survives");
  assert.equal(stored.providerHoldAt, undefined, "the ended hold stays ended — no resurrection");
  assert.equal(
    stored.operatorHoldAlertedAt,
    undefined,
    "the stale sweep stamp was not written over the concurrent state",
  );
});

test("N3: a shipment landing during the authority read (hold episode still recorded) also refuses the stale merge", async () => {
  resetHoldSweepRuntimeStubState();
  const ns = createFakeNs(heldRecord());
  const gate = deferred();
  holdSweepRuntimeStubState.authorityGate = gate.promise;
  const store = createPrintOrderHoldSweepStore(ns, { stub: true });

  const persistPromise = store.persistRecord(SESSION, sweptRecord());
  await untilAuthorityRead();
  ns.write(SESSION, heldRecord({ shippedAt: 555, shippingNotificationSentAt: 556 }));
  gate.release();

  const result = await persistPromise;
  assert.equal(result.outcome, "skipped");
  assert.equal(result.reason, "hold_state_changed");
  const stored = ns.stored(SESSION);
  assert.equal(stored.shippedAt, 555);
  assert.equal(stored.shippingNotificationSentAt, 556);
  assert.equal(stored.operatorHoldAlertedAt, undefined, "no stale stamp written");
});

test("N3: a concurrent annotation that leaves the episode live survives the re-merge, and the stamp still lands", async () => {
  resetHoldSweepRuntimeStubState();
  const ns = createFakeNs(heldRecord());
  const gate = deferred();
  holdSweepRuntimeStubState.authorityGate = gate.promise;
  const store = createPrintOrderHoldSweepStore(ns, { stub: true });

  const persistPromise = store.persistRecord(SESSION, sweptRecord());
  await untilAuthorityRead();
  // An unrelated annotation (the review sweep's clock) lands during
  // the authority read; the hold episode itself is untouched.
  ns.write(SESSION, heldRecord({ fileReviewCheckedAt: 300 }));
  gate.release();

  const result = await persistPromise;
  assert.equal(result.outcome, "persisted");
  const stored = ns.stored(SESSION);
  assert.equal(stored.fileReviewCheckedAt, 300, "the concurrent annotation survives by re-merge");
  assert.equal(stored.operatorHoldAlertedAt, 2_000, "the sweep stamp still lands");
  assert.equal(stored.operatorHoldAlertProvider, "resend");
  assert.equal(stored.providerHoldAt, HOLD_AT, "the live hold episode is unchanged");
});

test("N3: with no concurrent write the persist behaves as before", async () => {
  resetHoldSweepRuntimeStubState();
  const ns = createFakeNs(heldRecord());
  const store = createPrintOrderHoldSweepStore(ns, { stub: true });

  const result = await store.persistRecord(SESSION, sweptRecord());
  assert.equal(result.outcome, "persisted");
  const stored = ns.stored(SESSION);
  assert.equal(stored.operatorHoldAlertedAt, 2_000);
  assert.equal(stored.operatorHoldAlertProvider, "resend");
  assert.equal(stored.providerHoldAt, HOLD_AT);
});

test("N3: a terminal authority still refuses the persist", async () => {
  resetHoldSweepRuntimeStubState();
  holdSweepRuntimeStubState.lifecycle = "terminal_failed";
  const ns = createFakeNs(heldRecord());
  const store = createPrintOrderHoldSweepStore(ns, { stub: true });

  const result = await store.persistRecord(SESSION, sweptRecord());
  assert.equal(result.outcome, "skipped");
  assert.equal(result.reason, "authority_terminal_failure");
  assert.equal(ns.stored(SESSION).operatorHoldAlertedAt, undefined, "nothing was written");
});
