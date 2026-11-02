// S96-1 F1 — the print-order hold sweep, tested against the REAL engine
// (src/lib/printOrderHoldSweep.ts, imported via the ts alias loader; the
// engine's only imports are type-only, so no provider/KV graph loads).
// The webhook-side hold recording lives in printfulWebhookOrderEvents.ts
// (pinned in printfulWebhookOrderEvents.test.mjs); this suite covers the
// aging backstop: alert retry + one-shot escalation from record stamps.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  applyHoldSweepStampsToCurrent,
  printOrderHoldSweepAction,
  resolvePrintOrderHoldSweepConfig,
  runPrintOrderHoldSweep,
  PRINT_ORDER_KEY_PREFIX,
} = await import("../../src/lib/printOrderHoldSweep.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const workerSource = fs.readFileSync(path.join(appRoot, "cloudflare-worker.ts"), "utf8");
const runtimeSource = fs.readFileSync(
  path.join(appRoot, "src/lib/printOrderHoldSweepRuntime.ts"),
  "utf8",
);

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function heldRecord(overrides = {}) {
  return {
    status: "sent",
    sessionId: "cs_test_hold_sweep",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    attempts: 1,
    createdAt: NOW - 72 * HOUR,
    providerHoldAt: NOW - HOUR,
    providerHoldReason: "address_issue",
    ...overrides,
  };
}

function createFakeStore(records) {
  const data = new Map();
  for (const record of records) {
    data.set(`${PRINT_ORDER_KEY_PREFIX}${record.sessionId}`, structuredClone(record));
  }
  const writes = [];
  return {
    data,
    writes,
    async listKeys(prefix) {
      return {
        names: [...data.keys()].filter((key) => key.startsWith(prefix)),
        cursor: null,
        complete: true,
      };
    },
    async getJson(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async persistRecord(sessionId, record) {
      writes.push({ sessionId, record: structuredClone(record) });
      data.set(`${PRINT_ORDER_KEY_PREFIX}${sessionId}`, structuredClone(record));
      return { outcome: "persisted" };
    },
  };
}

const okSender = async () => ({ delivered: true, provider: "resend" });
const failingSender = async () => ({
  delivered: false,
  provider: "none",
  error: "print_alert_not_configured",
});

test("config: inert unless explicitly enabled; escalation threshold parses with a 24h default", () => {
  assert.equal(resolvePrintOrderHoldSweepConfig({}).enabled, false);
  assert.equal(resolvePrintOrderHoldSweepConfig({ PRINT_ORDER_HOLD_SWEEP_ENABLED: "yes" }).enabled, false);
  assert.equal(
    resolvePrintOrderHoldSweepConfig({ PRINT_ORDER_HOLD_SWEEP_ENABLED: "TRUE" }).enabled,
    false,
    "activation is case-sensitive, matching the review-request flag posture",
  );
  assert.equal(
    resolvePrintOrderHoldSweepConfig({ PRINT_ORDER_HOLD_SWEEP_ENABLED: " true " }).enabled,
    true,
  );
  const enabled = resolvePrintOrderHoldSweepConfig({ PRINT_ORDER_HOLD_SWEEP_ENABLED: "true" });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.escalationThresholdMs, 24 * HOUR);
  assert.equal(
    resolvePrintOrderHoldSweepConfig({
      PRINT_ORDER_HOLD_SWEEP_ENABLED: "true",
      PRINT_ORDER_HOLD_ESCALATION_HOURS: "48",
    }).escalationThresholdMs,
    48 * HOUR,
  );
  assert.equal(
    resolvePrintOrderHoldSweepConfig({
      PRINT_ORDER_HOLD_SWEEP_ENABLED: "true",
      PRINT_ORDER_HOLD_ESCALATION_HOURS: "junk",
    }).escalationThresholdMs,
    24 * HOUR,
  );
});

test("stamp merge: an ended or changed hold episode refuses the sweep's stale write", () => {
  const swept = heldRecord({ operatorHoldAlertedAt: NOW, operatorHoldAlertProvider: "resend" });
  // Terminal failure landed mid-sweep: status failed, hold fields cleared.
  assert.equal(
    applyHoldSweepStampsToCurrent(heldRecord({ status: "failed", providerHoldAt: undefined }), swept),
    null,
  );
  // Shipment landed mid-sweep.
  assert.equal(applyHoldSweepStampsToCurrent(heldRecord({ shippedAt: NOW }), swept), null);
  // Operator resolved the hold (fields cleared, order still sent).
  assert.equal(applyHoldSweepStampsToCurrent(heldRecord({ providerHoldAt: undefined }), swept), null);
  // A NEW hold episode began (different first-hold timestamp).
  assert.equal(
    applyHoldSweepStampsToCurrent(heldRecord({ providerHoldAt: NOW - 30 * 60 * 1000 }), swept),
    null,
  );
  // The record is gone entirely.
  assert.equal(applyHoldSweepStampsToCurrent(null, swept), null);
  assert.equal(applyHoldSweepStampsToCurrent(undefined, swept), null);
});

test("stamp merge: a live episode takes only the sweep's stamps, onto the current record", () => {
  const swept = heldRecord({
    operatorHoldAlertedAt: NOW,
    operatorHoldAlertProvider: "resend",
    providerHoldReason: "stale_reason_from_snapshot",
  });
  const current = heldRecord({ providerHoldReason: "address_issue_current", attempts: 3 });
  const merged = applyHoldSweepStampsToCurrent(current, swept);
  assert.equal(merged.operatorHoldAlertedAt, NOW);
  assert.equal(merged.operatorHoldAlertProvider, "resend");
  assert.equal(
    merged.providerHoldReason,
    "address_issue_current",
    "non-stamp fields come from the current record, never the snapshot",
  );
  assert.equal(merged.attempts, 3);
});

test("stamp merge: stamps the current record already carries are never regressed", () => {
  // The webhook's own alert landed during the sweep; the sweep's failed
  // alert outcome must not attach its error to the delivered alert.
  const swept = heldRecord({ operatorHoldAlertError: "smtp_down", operatorHoldAlertProvider: "none" });
  const current = heldRecord({
    operatorHoldAlertedAt: NOW - 60 * 1000,
    operatorHoldAlertProvider: "resend",
  });
  const merged = applyHoldSweepStampsToCurrent(current, swept);
  assert.equal(merged.operatorHoldAlertedAt, NOW - 60 * 1000);
  assert.equal(merged.operatorHoldAlertProvider, "resend");
  assert.equal(merged.operatorHoldAlertError, undefined);
});

test("action: unalerted hold alerts, aged alerted hold escalates, everything else is left alone", () => {
  const config = resolvePrintOrderHoldSweepConfig({ PRINT_ORDER_HOLD_SWEEP_ENABLED: "true" });
  assert.equal(printOrderHoldSweepAction(heldRecord(), config, NOW), "alert");
  assert.equal(
    printOrderHoldSweepAction(heldRecord({ operatorHoldAlertedAt: NOW - HOUR }), config, NOW),
    null,
    "an alerted young hold waits",
  );
  assert.equal(
    printOrderHoldSweepAction(
      heldRecord({ providerHoldAt: NOW - 25 * HOUR, operatorHoldAlertedAt: NOW - 25 * HOUR }),
      config,
      NOW,
    ),
    "escalate",
  );
  assert.equal(
    printOrderHoldSweepAction(
      heldRecord({
        providerHoldAt: NOW - 25 * HOUR,
        operatorHoldAlertedAt: NOW - 25 * HOUR,
        operatorHoldEscalatedAt: NOW - HOUR,
      }),
      config,
      NOW,
    ),
    null,
    "escalation fires once",
  );
  assert.equal(printOrderHoldSweepAction(heldRecord({ shippedAt: NOW - HOUR }), config, NOW), null);
  assert.equal(printOrderHoldSweepAction(heldRecord({ status: "failed" }), config, NOW), null);
  assert.equal(printOrderHoldSweepAction(heldRecord({ providerHoldAt: undefined }), config, NOW), null);
  assert.equal(printOrderHoldSweepAction(null, config, NOW), null);
});

test("sweep: retries the missing alert, escalates the aged hold, stamps both, and is idempotent", async () => {
  const unalerted = heldRecord({ sessionId: "cs_test_hold_unalerted" });
  const aged = heldRecord({
    sessionId: "cs_test_hold_aged",
    providerHoldAt: NOW - 30 * HOUR,
    operatorHoldAlertedAt: NOW - 30 * HOUR,
  });
  const young = heldRecord({
    sessionId: "cs_test_hold_young",
    operatorHoldAlertedAt: NOW - 30 * 60 * 1000,
  });
  const shipped = heldRecord({ sessionId: "cs_test_hold_shipped", shippedAt: NOW - HOUR });
  const plain = heldRecord({ sessionId: "cs_test_hold_none", providerHoldAt: undefined });
  const store = createFakeStore([unalerted, aged, young, shipped, plain]);

  let alerts = 0;
  let escalations = 0;
  const deps = {
    store,
    config: resolvePrintOrderHoldSweepConfig({ PRINT_ORDER_HOLD_SWEEP_ENABLED: "true" }),
    now: () => NOW,
    sendHoldAlert: async () => {
      alerts += 1;
      return okSender();
    },
    sendHoldEscalationAlert: async () => {
      escalations += 1;
      return okSender();
    },
  };

  const summary = await runPrintOrderHoldSweep(deps);
  assert.equal(summary.enabled, true);
  assert.equal(summary.scanned, 5);
  assert.equal(summary.held, 4, "every record still carrying a hold fact counts");
  assert.equal(summary.alertsSent, 1);
  assert.equal(summary.escalationsSent, 1);
  assert.equal(summary.errors, 0);
  assert.equal(alerts, 1);
  assert.equal(escalations, 1);

  const afterUnalerted = store.data.get(`${PRINT_ORDER_KEY_PREFIX}cs_test_hold_unalerted`);
  assert.equal(afterUnalerted.operatorHoldAlertedAt, NOW);
  assert.equal(afterUnalerted.operatorHoldAlertError, undefined);
  const afterAged = store.data.get(`${PRINT_ORDER_KEY_PREFIX}cs_test_hold_aged`);
  assert.equal(afterAged.operatorHoldEscalatedAt, NOW);

  // A second pass at the same instant sends nothing again.
  const second = await runPrintOrderHoldSweep(deps);
  assert.equal(second.alertsSent, 0);
  assert.equal(second.escalationsSent, 0);
  assert.equal(alerts, 1);
  assert.equal(escalations, 1);
});

test("sweep: a failed alert is recorded on the record and retried on the next pass", async () => {
  const store = createFakeStore([heldRecord({ sessionId: "cs_test_hold_retry" })]);
  const deps = {
    store,
    config: resolvePrintOrderHoldSweepConfig({ PRINT_ORDER_HOLD_SWEEP_ENABLED: "true" }),
    now: () => NOW,
    sendHoldAlert: failingSender,
    sendHoldEscalationAlert: failingSender,
  };
  const summary = await runPrintOrderHoldSweep(deps);
  assert.equal(summary.alertFailures, 1);
  const record = store.data.get(`${PRINT_ORDER_KEY_PREFIX}cs_test_hold_retry`);
  assert.equal(record.operatorHoldAlertedAt, undefined, "a failed alert never stamps delivery");
  assert.equal(record.operatorHoldAlertError, "print_alert_not_configured");

  deps.sendHoldAlert = okSender;
  const retry = await runPrintOrderHoldSweep(deps);
  assert.equal(retry.alertsSent, 1, "the next pass retries the alert");
});

test("sweep: disabled config scans nothing and sends nothing", async () => {
  const store = createFakeStore([heldRecord()]);
  let calls = 0;
  const summary = await runPrintOrderHoldSweep({
    store,
    config: resolvePrintOrderHoldSweepConfig({}),
    now: () => NOW,
    sendHoldAlert: async () => {
      calls += 1;
      return okSender();
    },
    sendHoldEscalationAlert: async () => {
      calls += 1;
      return okSender();
    },
  });
  assert.equal(summary.enabled, false);
  assert.equal(summary.scanned, 0);
  assert.equal(calls, 0);
  assert.equal(store.writes.length, 0);
});

test("sweep wiring is pinned in the worker + runtime sources", () => {
  assert.match(workerSource, /runScheduledPrintOrderHoldSweep/);
  assert.match(workerSource, /print_hold_sweep_failed/);
  assert.match(runtimeSource, /STAR_MAP_KV binding missing for print-order hold sweep/);
  // The raw-KV adapter must re-apply retention — a bare put would make
  // PII-bearing order records permanent.
  assert.match(runtimeSource, /resolvePrintOrderKvWrite/);
  assert.match(runtimeSource, /expirationTtl: plan\.ttlSeconds/);
});
