import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPrintOrderAuthorityInterleaving,
  applyPrintOrderAuthorityOp,
  authorityLifecycleBlocksNonterminalMirror,
  createSerializedAuthorityStore,
  createUnboundAuthorityState,
  isPrintfulTerminalFailureWebhookType,
  PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES,
} from "./printOrderAuthorityState.harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const stateSource = fs.readFileSync(path.join(appRoot, "src/lib/printOrderAuthorityState.ts"), "utf8");
const doSource = fs.readFileSync(
  path.join(appRoot, "src/durable-objects/PrintOrderAuthorityDO.ts"),
  "utf8",
);
const wranglerSource = fs.readFileSync(path.join(appRoot, "wrangler.toml"), "utf8");
const workerSource = fs.readFileSync(path.join(appRoot, "cloudflare-worker.ts"), "utf8");

const SESSION = "cs_test_ag016_authority_do";

test("terminal webhook types exclude order_put_hold", () => {
  assert.equal(PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES.has("order_failed"), true);
  assert.equal(PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES.has("order_canceled"), true);
  assert.equal(PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES.has("order_put_hold"), false);
  assert.equal(isPrintfulTerminalFailureWebhookType("order_put_hold"), false);
});

test("bind is idempotent for same id; conflicts reject", () => {
  let state = createUnboundAuthorityState(SESSION, 1);
  let r = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: 100,
    now: 2,
  });
  assert.equal(r.ok, true);
  assert.equal(r.state.lifecycle, "bound");
  state = r.state;
  r = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: "100",
    now: 3,
  });
  assert.equal(r.ok, true);
  assert.equal(r.changed, false);
  r = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: 999,
    now: 4,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "conflicting_provider_id");
  assert.equal(r.state.lifecycle, "bound");
  assert.equal(r.state.printfulOrderId, "100");
});

test("I5: stale bind cannot overwrite terminal failure (all interleavings)", () => {
  const bind = { type: "bind_provider_order_id", printfulOrderId: 42, now: 10 };
  const terminal = { type: "mark_terminal_failed", eventType: "order_failed", reason: "x", now: 11 };
  const interleavings = [
    [bind, terminal],
    [terminal, bind],
    [bind, bind, terminal],
    [terminal, bind, bind],
    [bind, terminal, bind],
  ];
  for (const ops of interleavings) {
    const { final, results } = applyPrintOrderAuthorityInterleaving(
      createUnboundAuthorityState(SESSION, 1),
      ops,
    );
    assert.equal(final.lifecycle, "terminal_failed", `ops=${JSON.stringify(ops.map((o) => o.type))}`);
    if (ops[0].type === "mark_terminal_failed") {
      const lateBind = results.find((r) => !r.ok && r.reason === "terminal_blocks_bind");
      assert.ok(lateBind, "late bind must be rejected after terminal");
    }
  }
});

test("I5 concurrent store: parallel markTerminalFailed + stale bind ends terminal", async () => {
  const store = createSerializedAuthorityStore();
  await store.apply(SESSION, { type: "bind_provider_order_id", printfulOrderId: 7, now: 1 });

  const [terminalResult, staleBindResult] = await Promise.all([
    store.apply(SESSION, {
      type: "mark_terminal_failed",
      eventType: "order_canceled",
      reason: "canceled",
      now: 2,
    }),
    store.apply(SESSION, { type: "bind_provider_order_id", printfulOrderId: 7, now: 3 }),
  ]);

  const final = await store.get(SESSION);
  assert.equal(final.lifecycle, "terminal_failed");
  assert.equal(terminalResult.ok, true);
  // Whichever ran second: if bind after terminal → rejected; if bind before → ok/idempotent.
  if (staleBindResult.ok === false) {
    assert.equal(staleBindResult.reason, "terminal_blocks_bind");
  }
  assert.equal(authorityLifecycleBlocksNonterminalMirror(final.lifecycle), true);
});

test("operator recover then re-bind allowed; non-operator path still blocked", () => {
  let state = createUnboundAuthorityState(SESSION, 1);
  state = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: 1,
    now: 2,
  }).state;
  state = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 3,
  }).state;
  const blocked = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: 1,
    now: 4,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "terminal_blocks_bind");

  const recovered = applyPrintOrderAuthorityOp(state, { type: "operator_recover", now: 5 });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.lifecycle, "operator_recovered");
  const rebound = applyPrintOrderAuthorityOp(recovered.state, {
    type: "bind_provider_order_id",
    printfulOrderId: 2,
    now: 6,
  });
  assert.equal(rebound.ok, true);
  assert.equal(rebound.state.lifecycle, "bound");
  assert.equal(rebound.state.printfulOrderId, "2");
});

test("seed from KV: failed→terminal, sent+id→bound; no production mutation required", () => {
  const failedSeed = applyPrintOrderAuthorityOp(createUnboundAuthorityState(SESSION, 1), {
    type: "seed_from_kv",
    kvStatus: "failed",
    printfulOrderId: 55,
    now: 2,
  });
  assert.equal(failedSeed.state.lifecycle, "terminal_failed");
  assert.equal(failedSeed.state.seededFromKv, true);

  const boundSeed = applyPrintOrderAuthorityOp(createUnboundAuthorityState(SESSION, 1), {
    type: "seed_from_kv",
    kvStatus: "sent",
    printfulOrderId: 55,
    now: 2,
  });
  assert.equal(boundSeed.state.lifecycle, "bound");
  assert.equal(boundSeed.state.printfulOrderId, "55");
});

test("source wiring: DO + wrangler migration + custom worker present", () => {
  assert.match(stateSource, /mark_terminal_failed/);
  assert.match(stateSource, /operator_recover/);
  assert.match(doSource, /class PrintOrderAuthorityDO extends DurableObject/);
  assert.match(doSource, /CREATE TABLE IF NOT EXISTS print_order_authority/);
  assert.match(wranglerSource, /PRINT_ORDER_AUTHORITY/);
  assert.match(wranglerSource, /new_sqlite_classes = \["PrintOrderAuthorityDO"\]/);
  assert.match(wranglerSource, /main = "cloudflare-worker.ts"/);
  assert.match(workerSource, /export \{ PrintOrderAuthorityDO \}/);
});
