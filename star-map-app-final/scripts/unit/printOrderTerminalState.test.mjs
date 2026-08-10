import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createMemoryPrintOrderTerminalStore,
  getEffectivePrintOrderRecord,
  mergePrintOrderTerminalState,
  overlayPrintOrderTerminalState,
  persistPrintOrderKvMirror,
  printOrderTerminalObjectKey,
  readPrintOrderTerminalState,
  recordPrintOrderTerminalFailure,
} from "./printOrderTerminalState.harness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const terminalSrc = readFileSync(join(root, "src/lib/printOrderTerminalState.ts"), "utf8");
const wranglerSrc = readFileSync(join(root, "wrangler.toml"), "utf8");

function baseOrder(overrides = {}) {
  return {
    status: "sent",
    sessionId: "cs_test_terminal_race_001",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    printfulOrderId: 999,
    attempts: 1,
    createdAt: 1,
    ...overrides,
  };
}

test("terminal key uses session id only (no PII)", () => {
  const key = printOrderTerminalObjectKey("cs_test_terminal_race_001");
  assert.equal(key, "print-order-terminal/cs_test_terminal_race_001");
  assert.equal(key.includes("@"), false);
  assert.equal(key.includes("Bearer"), false);
});

test("merge is monotonic: alert markers never regress", () => {
  const first = mergePrintOrderTerminalState(null, {
    sessionId: "cs_test_terminal_race_001",
    error: "printful_order_failed",
    source: "printful_webhook",
    operatorFailureAlertedAt: 100,
    operatorFailureAlertProvider: "webhook",
  });
  const second = mergePrintOrderTerminalState(first, {
    sessionId: "cs_test_terminal_race_001",
    error: "printful_files_failed:x",
    source: "post_submit_files",
    operatorFailureAlertedAt: undefined,
  });
  assert.equal(second.operatorFailureAlertedAt, 100);
  assert.equal(second.operatorFailureAlertProvider, "webhook");
  assert.equal(second.error, "printful_order_failed");
  assert.equal(second.source, "printful_webhook");
});

test("P1/#239: stale sent KV write after concurrent terminal failure still resolves failed", async () => {
  const store = createMemoryPrintOrderTerminalStore();
  const sessionId = "cs_test_terminal_race_001";
  const staleSent = baseOrder({ status: "sent", error: undefined });

  const terminal = await recordPrintOrderTerminalFailure(
    {
      sessionId,
      error: "printful_order_failed:provider_rejected",
      source: "printful_webhook",
      operatorFailureAlertedAt: 42,
      operatorFailureAlertProvider: "webhook",
    },
    { store },
  );
  assert.equal(terminal.ok, true);

  // Stale post-submit/retry writer still performs a KV put of `sent`.
  const persisted = await persistPrintOrderKvMirror(sessionId, staleSent, {
    store,
    requireTerminalReadable: true,
  });
  assert.equal(persisted.ok, true);
  assert.equal(persisted.order.status, "failed");
  assert.equal(persisted.order.error, "printful_order_failed:provider_rejected");
  assert.equal(persisted.order.operatorFailureAlertedAt, 42);

  const effective = await getEffectivePrintOrderRecord(sessionId, staleSent, {
    store,
    requireTerminalReadable: true,
  });
  assert.equal(effective.ok, true);
  assert.equal(effective.order.status, "failed");
  assert.ok(effective.terminal);
});

test("P1/#239: concurrent terminal/alert writers cannot lose idempotency markers", async () => {
  const store = createMemoryPrintOrderTerminalStore();
  const sessionId = "cs_test_terminal_race_002";

  const a = await recordPrintOrderTerminalFailure(
    {
      sessionId,
      error: "printful_order_failed",
      source: "printful_webhook",
      operatorFailureAlertedAt: 1000,
      operatorFailureAlertProvider: "webhook",
    },
    { store },
  );
  assert.equal(a.ok, true);

  const b = await recordPrintOrderTerminalFailure(
    {
      sessionId,
      error: "printful_files_failed:poster:default=failed",
      source: "post_submit_files",
    },
    { store },
  );
  assert.equal(b.ok, true);
  assert.equal(b.state.operatorFailureAlertedAt, 1000);
  assert.equal(b.state.operatorFailureAlertProvider, "webhook");

  const read = await readPrintOrderTerminalState(sessionId, { store });
  assert.equal(read.ok, true);
  assert.equal(read.state.operatorFailureAlertedAt, 1000);
});

test("healthy ok cannot override existing terminal marker", async () => {
  const store = createMemoryPrintOrderTerminalStore();
  const sessionId = "cs_test_terminal_race_003";
  await recordPrintOrderTerminalFailure(
    {
      sessionId,
      error: "printful_order_failed",
      source: "printful_webhook",
    },
    { store },
  );

  const healthy = baseOrder({ status: "sent", operatorAlertedAt: 9 });
  const effective = await getEffectivePrintOrderRecord(sessionId, healthy, {
    store,
    requireTerminalReadable: true,
  });
  assert.equal(effective.order.status, "failed");
  assert.equal(effective.order.operatorAlertedAt, 9);
  assert.notEqual(overlayPrintOrderTerminalState(healthy, effective.terminal).status, "sent");
});

test("R2/terminal unavailable during approval gate fails closed", async () => {
  const sessionId = "cs_test_terminal_race_004";
  const healthy = baseOrder();
  const effective = await getEffectivePrintOrderRecord(sessionId, healthy, {
    requireTerminalReadable: true,
    // no store => unavailable
  });
  assert.equal(effective.ok, false);
  assert.equal(effective.unavailable, true);
});

test("createOnly CAS rejects duplicate create", async () => {
  const store = createMemoryPrintOrderTerminalStore();
  const key = printOrderTerminalObjectKey("cs_test_terminal_race_005");
  const first = await store.put(key, JSON.stringify({ ok: true }), { createOnly: true });
  assert.ok(first);
  const second = await store.put(key, JSON.stringify({ ok: false }), { createOnly: true });
  assert.equal(second, null);
});

test("source uses dedicated PRINT_ORDER_STATE_R2 binding, not incremental cache", () => {
  assert.match(terminalSrc, /PRINT_ORDER_STATE_R2/);
  assert.match(wranglerSrc, /PRINT_ORDER_STATE_R2/);
  assert.match(wranglerSrc, /print-order-state/);
  assert.match(terminalSrc, /must not reuse NEXT_INC_CACHE_R2_BUCKET/);
  assert.equal(
    /binding\s*=\s*"NEXT_INC_CACHE_R2_BUCKET"/.test(terminalSrc) ||
      /getDownloadArchiveR2Bucket|R2_BUCKET_BINDING\s*=\s*"NEXT_INC_CACHE/.test(terminalSrc),
    false,
  );
  assert.match(terminalSrc, /etagMatches|createOnly|if-none-match/);
  assert.match(terminalSrc, /no customer PII|session id only|No customer PII/i);
});

test("payloads avoid secrets and raw provider objects", async () => {
  const store = createMemoryPrintOrderTerminalStore();
  const result = await recordPrintOrderTerminalFailure(
    {
      sessionId: "cs_test_terminal_race_006",
      error: "printful_order_failed:status=failed",
      source: "printful_webhook",
    },
    { store },
  );
  assert.equal(result.ok, true);
  const raw = JSON.stringify(result.state);
  assert.equal(raw.includes("Bearer"), false);
  assert.equal(raw.includes("email"), false);
  assert.equal(raw.includes("token"), false);
});
