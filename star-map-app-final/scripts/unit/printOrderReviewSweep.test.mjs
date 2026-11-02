// S96-1 F3 — the print-order review sweep, tested against the REAL
// engine (src/lib/printOrderReviewSweep.ts, imported via the ts alias
// loader; the engine's only imports are type-only, so no provider/KV
// graph loads). The post-submit stamping lives in
// printFulfillmentPostSubmit.ts (pinned in
// printFulfillmentPostSubmit.test.mjs); this suite covers the revisit:
// candidacy, re-review, the one-shot aging alert, and the counters.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  printOrderReviewSweepCandidate,
  resolvePrintOrderReviewSweepConfig,
  runPrintOrderReviewSweep,
  PRINT_ORDER_REVIEW_LEGACY_GRACE_MS,
} = await import("../../src/lib/printOrderReviewSweep.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const workerSource = fs.readFileSync(path.join(appRoot, "cloudflare-worker.ts"), "utf8");
const runtimeSource = fs.readFileSync(
  path.join(appRoot, "src/lib/printOrderReviewSweepRuntime.ts"),
  "utf8",
);

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function pendingRecord(overrides = {}) {
  return {
    status: "sent",
    sessionId: "cs_test_review_sweep",
    printfulOrderId: "PF-100",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    sentAt: NOW - 2 * HOUR,
    createdAt: NOW - 2 * HOUR,
    fileReviewState: "pending",
    fileReviewCheckedAt: NOW - HOUR,
    fileReviewPendingSince: NOW - 2 * HOUR,
    ...overrides,
  };
}

function agedPendingRecord() {
  return pendingRecord({ fileReviewPendingSince: NOW - 25 * HOUR, sentAt: NOW - 25 * HOUR });
}

function memoryStore(records) {
  const byKey = new Map(records.map((r) => [`print:order:${r.sessionId}`, r]));
  const persisted = [];
  return {
    persisted,
    byKey,
    async listKeys(prefix, cursor) {
      const names = [...byKey.keys()].filter((k) => k.startsWith(prefix));
      return { names: cursor ? [] : names, cursor: null, complete: true };
    },
    async getJson(key) {
      return byKey.get(key) ?? null;
    },
    async persistRecord(sessionId, record) {
      persisted.push({ sessionId, record });
      byKey.set(`print:order:${sessionId}`, record);
      return { outcome: "persisted" };
    },
  };
}

const enabledConfig = resolvePrintOrderReviewSweepConfig({
  PRINT_ORDER_REVIEW_SWEEP_ENABLED: "true",
});

test("config: inert unless the flag is exactly true; threshold defaults to 24h", () => {
  assert.equal(resolvePrintOrderReviewSweepConfig({}).enabled, false);
  assert.equal(resolvePrintOrderReviewSweepConfig({ PRINT_ORDER_REVIEW_SWEEP_ENABLED: "1" }).enabled, false);
  assert.equal(resolvePrintOrderReviewSweepConfig({ PRINT_ORDER_REVIEW_SWEEP_ENABLED: " true " }).enabled, true);
  assert.equal(enabledConfig.pendingAlertThresholdMs, 24 * HOUR);
  assert.equal(
    resolvePrintOrderReviewSweepConfig({
      PRINT_ORDER_REVIEW_SWEEP_ENABLED: "true",
      PRINT_ORDER_REVIEW_PENDING_ALERT_HOURS: "6",
    }).pendingAlertThresholdMs,
    6 * HOUR,
  );
  assert.equal(
    resolvePrintOrderReviewSweepConfig({
      PRINT_ORDER_REVIEW_SWEEP_ENABLED: "true",
      PRINT_ORDER_REVIEW_PENDING_ALERT_HOURS: "junk",
    }).pendingAlertThresholdMs,
    24 * HOUR,
  );
});

test("candidate: stamped pending is in; resolved with delivered alerts, shipped, failed-status, and unbound are out", () => {
  assert.equal(printOrderReviewSweepCandidate(pendingRecord(), NOW), true);
  assert.equal(
    printOrderReviewSweepCandidate(pendingRecord({ fileReviewState: "healthy", operatorAlertedAt: NOW - HOUR }), NOW),
    false,
  );
  assert.equal(
    printOrderReviewSweepCandidate(
      pendingRecord({ fileReviewState: "failed", operatorFailureAlertedAt: NOW - HOUR }),
      NOW,
    ),
    false,
  );
  assert.equal(printOrderReviewSweepCandidate(pendingRecord({ shippedAt: NOW - HOUR }), NOW), false);
  assert.equal(printOrderReviewSweepCandidate(pendingRecord({ status: "failed" }), NOW), false);
  assert.equal(printOrderReviewSweepCandidate(pendingRecord({ printfulOrderId: undefined }), NOW), false);
  assert.equal(printOrderReviewSweepCandidate(null, NOW), false);
});

test("candidate: a resolved review stays eligible until its operator alert is delivered (gate fix)", () => {
  assert.equal(
    printOrderReviewSweepCandidate(
      pendingRecord({ fileReviewState: "failed", operatorFailureAlertError: "print_alert_not_configured" }),
      NOW,
    ),
    true,
    "failed files with an undelivered failure alert keep the revisit",
  );
  assert.equal(
    printOrderReviewSweepCandidate(
      pendingRecord({ fileReviewState: "healthy", operatorAlertError: "print_alert_not_configured" }),
      NOW,
    ),
    true,
    "healthy with an undelivered approval alert keeps the revisit",
  );
});

test("candidate: legacy unstamped records need the grace window and no recorded resolution", () => {
  const legacy = pendingRecord({ fileReviewState: undefined, fileReviewCheckedAt: undefined, fileReviewPendingSince: undefined });
  assert.equal(printOrderReviewSweepCandidate(legacy, NOW), true, "old enough with no resolution is a candidate");
  assert.equal(
    printOrderReviewSweepCandidate({ ...legacy, sentAt: NOW - PRINT_ORDER_REVIEW_LEGACY_GRACE_MS + 1 }, NOW),
    false,
    "inside the grace window the one-shot review may still be in flight",
  );
  assert.equal(
    printOrderReviewSweepCandidate({ ...legacy, error: "printful_files_failed:item" }, NOW),
    false,
    "a files-failed error means the review resolved",
  );
  assert.equal(
    printOrderReviewSweepCandidate({ ...legacy, operatorAlertedAt: NOW - HOUR }, NOW),
    false,
    "a delivered approval alert means the review resolved healthy",
  );
});

test("run: disabled sweep scans nothing", async () => {
  const store = memoryStore([pendingRecord()]);
  const summary = await runPrintOrderReviewSweep({
    store,
    config: resolvePrintOrderReviewSweepConfig({}),
    now: () => NOW,
    reviewOrder: async (r) => r,
    sendReviewPendingAlert: async () => ({ delivered: true, provider: "resend" }),
  });
  assert.equal(summary.enabled, false);
  assert.equal(summary.scanned, 0);
  assert.equal(store.persisted.length, 0);
});

test("run: a review that resolves healthy is persisted and counted once", async () => {
  const store = memoryStore([pendingRecord()]);
  const summary = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW,
    reviewOrder: async (r) => ({
      ...r,
      fileReviewState: "healthy",
      fileReviewCheckedAt: NOW,
      fileReviewPendingSince: undefined,
    }),
    sendReviewPendingAlert: async () => {
      throw new Error("must not alert on resolution");
    },
  });
  assert.equal(summary.candidates, 1);
  assert.equal(summary.resolvedHealthy, 1);
  assert.equal(summary.stillPending, 0);
  assert.equal(store.persisted.length, 1);
  assert.equal(store.persisted[0].record.fileReviewState, "healthy");
});

test("run: still-pending past the threshold sends ONE aging alert and stamps it", async () => {
  const store = memoryStore([agedPendingRecord()]);
  let alerts = 0;
  const summary = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW,
    reviewOrder: async (r) => ({ ...r, fileReviewCheckedAt: NOW }),
    sendReviewPendingAlert: async () => {
      alerts += 1;
      return { delivered: true, provider: "resend" };
    },
  });
  assert.equal(summary.stillPending, 1);
  assert.equal(summary.pendingAlertsSent, 1);
  assert.equal(alerts, 1);
  assert.equal(store.persisted[0].record.fileReviewPendingAlertedAt, NOW);

  // Second tick: the stamp stands, so no second alert for the episode.
  const again = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW + HOUR,
    reviewOrder: async (r) => ({ ...r, fileReviewCheckedAt: NOW + HOUR }),
    sendReviewPendingAlert: async () => {
      alerts += 1;
      return { delivered: true, provider: "resend" };
    },
  });
  assert.equal(again.pendingAlertsSent, 0);
  assert.equal(alerts, 1);
});

test("run: a young pending episode is re-checked without an aging alert", async () => {
  const store = memoryStore([
    pendingRecord({ fileReviewPendingSince: NOW - HOUR, sentAt: NOW - HOUR }),
  ]);
  const summary = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW,
    reviewOrder: async (r) => ({ ...r, fileReviewCheckedAt: NOW }),
    sendReviewPendingAlert: async () => {
      throw new Error("must not alert before the threshold");
    },
  });
  assert.equal(summary.stillPending, 1);
  assert.equal(summary.pendingAlertsSent, 0);
  assert.equal(store.persisted.length, 1, "the re-check stamp still persists");
});

test("run: a failed aging alert is recorded on the record, not hidden", async () => {
  const store = memoryStore([agedPendingRecord()]);
  const summary = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW,
    reviewOrder: async (r) => ({ ...r, fileReviewCheckedAt: NOW }),
    sendReviewPendingAlert: async () => ({ delivered: false, provider: "none", error: "print_alert_not_configured" }),
  });
  assert.equal(summary.pendingAlertFailures, 1);
  assert.equal(store.persisted[0].record.fileReviewPendingAlertError, "print_alert_not_configured");
  assert.equal(store.persisted[0].record.fileReviewPendingAlertedAt, undefined);
});

test("run: authority gate skips without reviewing or alerting", async () => {
  const store = memoryStore([pendingRecord()]);
  let reviews = 0;
  const summary = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW,
    authorityGate: async () => "terminal",
    reviewOrder: async (r) => {
      reviews += 1;
      return r;
    },
    sendReviewPendingAlert: async () => ({ delivered: true, provider: "resend" }),
  });
  assert.equal(summary.authoritySkips, 1);
  assert.equal(reviews, 0);
  assert.equal(store.persisted.length, 0);
});

test("run: a refused persist counts as a skipped write; a bad record counts an error and the scan continues", async () => {
  const store = memoryStore([
    pendingRecord(),
    pendingRecord({ sessionId: "cs_test_review_sweep_bad", printfulOrderId: "PF-101" }),
  ]);
  store.persistRecord = async () => ({ outcome: "skipped", reason: "review_state_changed" });
  const summary = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW,
    reviewOrder: async (r) => {
      if (r.sessionId.endsWith("_bad")) throw new Error("review exploded");
      return { ...r, fileReviewState: "failed", error: "printful_files_failed:item" };
    },
    sendReviewPendingAlert: async () => ({ delivered: true, provider: "resend" }),
  });
  assert.equal(summary.candidates, 2);
  assert.equal(summary.resolvedFailed, 1);
  assert.equal(summary.writesSkipped, 1);
  assert.equal(summary.errors, 1);
});

test("run: a resolved-failed record is revisited until its failure alert lands, then never again", async () => {
  const unalerted = pendingRecord({
    fileReviewState: "failed",
    fileReviewPendingSince: undefined,
    error: "printful_files_failed:item",
    operatorFailureAlertError: "print_alert_not_configured",
  });
  const store = memoryStore([unalerted]);
  const summary = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW,
    reviewOrder: async (r) => ({
      ...r,
      operatorFailureAlertedAt: NOW,
      operatorFailureAlertError: undefined,
    }),
    sendReviewPendingAlert: async () => {
      throw new Error("resolved records never get the pending alert");
    },
  });
  assert.equal(summary.candidates, 1);
  assert.equal(summary.resolvedFailed, 1);
  assert.equal(store.persisted.length, 1);

  const again = await runPrintOrderReviewSweep({
    store,
    config: enabledConfig,
    now: () => NOW + HOUR,
    reviewOrder: async (r) => r,
    sendReviewPendingAlert: async () => ({ delivered: true, provider: "resend" }),
  });
  assert.equal(again.candidates, 0, "once the failure-alert stamp exists the record leaves the sweep");
});

test("source wiring: the worker schedules the sweep beside the hold sweep; the runtime merges via the shared helper", () => {
  assert.match(workerSource, /runScheduledPrintOrderHoldSweep\(env\)/);
  assert.match(workerSource, /runScheduledPrintOrderReviewSweep\(env\)/);
  assert.match(runtimeSource, /PRINT_ORDER_REVIEW_SWEEP_ENABLED/);
  assert.match(runtimeSource, /applyReviewOutcomeToCurrent/);
  assert.match(runtimeSource, /applyPrintfulPostSubmitReview/);
  assert.match(runtimeSource, /sendPrintOrderReviewPendingAlert/);
});
