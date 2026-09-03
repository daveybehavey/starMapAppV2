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
  // AG-074: authoritative provider id survives recovery — conflicting re-bind fails closed.
  const reboundConflict = applyPrintOrderAuthorityOp(recovered.state, {
    type: "bind_provider_order_id",
    printfulOrderId: 2,
    now: 6,
  });
  assert.equal(reboundConflict.ok, false);
  assert.equal(reboundConflict.reason, "conflicting_provider_id");
  assert.equal(reboundConflict.state.printfulOrderId, "1");
  const reboundSame = applyPrintOrderAuthorityOp(recovered.state, {
    type: "bind_provider_order_id",
    printfulOrderId: 1,
    now: 7,
  });
  assert.equal(reboundSame.ok, true);
  assert.equal(reboundSame.state.lifecycle, "bound");
  assert.equal(reboundSame.state.printfulOrderId, "1");
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


test("AG-042: mark_terminal_failed captures provider id atomically when unbound", () => {
  let state = createUnboundAuthorityState("cs_test_ag042_capture");
  const result = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    reason: "printful_failed",
    printfulOrderId: "PF-42",
    now: 100,
  });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.state.lifecycle, "terminal_failed");
  assert.equal(result.state.printfulOrderId, "PF-42");
});

test("AG-042: mark_terminal_failed fails closed on provider id conflict", () => {
  let state = createUnboundAuthorityState("cs_test_ag042_conflict");
  state = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: "PF-1",
    now: 1,
  }).state;
  const result = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    printfulOrderId: "PF-OTHER",
    now: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "conflicting_provider_id");
  assert.equal(result.state.lifecycle, "bound");
  assert.equal(result.state.printfulOrderId, "PF-1");
});

test("AG-042: already-terminal can repair missing provider id", () => {
  let state = createUnboundAuthorityState("cs_test_ag042_repair");
  state = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 1,
  }).state;
  assert.equal(state.printfulOrderId, null);
  const repaired = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    printfulOrderId: "PF-REPAIR",
    now: 2,
  });
  assert.equal(repaired.ok, true);
  assert.equal(repaired.changed, true);
  assert.equal(repaired.state.printfulOrderId, "PF-REPAIR");
  assert.equal(repaired.state.lifecycle, "terminal_failed");
});

test("AG-074: operator_resolve conflicts explicit Z vs authority A before recover", () => {
  let state = createUnboundAuthorityState("cs_test_ag074_conflict");
  state = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  }).state;
  state = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 2,
  }).state;
  const result = applyPrintOrderAuthorityOp(state, {
    type: "operator_resolve",
    explicitPrintfulOrderId: "Z",
    bootstrapPrintfulOrderId: "B",
    now: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "conflicting_provider_id");
  assert.equal(result.state.lifecycle, "terminal_failed");
  assert.equal(result.state.printfulOrderId, "A");
  assert.equal(result.state.revision, state.revision);
});

test("AG-074: operator_resolve recovers terminal and preserves authoritative A over bootstrap B", () => {
  let state = createUnboundAuthorityState("cs_test_ag074_preserve");
  state = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  }).state;
  state = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 2,
  }).state;
  const result = applyPrintOrderAuthorityOp(state, {
    type: "operator_resolve",
    bootstrapPrintfulOrderId: "B",
    now: 3,
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.printfulOrderId, "A");
  assert.equal(result.state.lifecycle, "bound");
});

test("AG-074: operator_resolve is idempotent for repeated same recovery", () => {
  let state = createUnboundAuthorityState("cs_test_ag074_idem");
  state = applyPrintOrderAuthorityOp(state, {
    type: "bind_provider_order_id",
    printfulOrderId: "A",
    now: 1,
  }).state;
  state = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 2,
  }).state;
  const first = applyPrintOrderAuthorityOp(state, {
    type: "operator_resolve",
    now: 3,
  });
  assert.equal(first.ok, true);
  const second = applyPrintOrderAuthorityOp(first.state, {
    type: "operator_resolve",
    bootstrapPrintfulOrderId: "B",
    now: 4,
  });
  assert.equal(second.ok, true);
  assert.equal(second.state.printfulOrderId, "A");
  assert.equal(second.changed, false);
});

test("AG-074: mark_terminal_failed captures provider id when unbound; conflict rejected", () => {
  let unbound = createUnboundAuthorityState("cs_test_ag074_capture");
  const captured = applyPrintOrderAuthorityOp(unbound, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    printfulOrderId: "PF-NEW",
    now: 1,
  });
  assert.equal(captured.ok, true);
  assert.equal(captured.state.printfulOrderId, "PF-NEW");

  let bound = applyPrintOrderAuthorityOp(createUnboundAuthorityState("cs_test_ag074_term_conflict"), {
    type: "bind_provider_order_id",
    printfulOrderId: "PF-1",
    now: 1,
  }).state;
  const conflict = applyPrintOrderAuthorityOp(bound, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    printfulOrderId: "PF-2",
    now: 2,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "conflicting_provider_id");
});
