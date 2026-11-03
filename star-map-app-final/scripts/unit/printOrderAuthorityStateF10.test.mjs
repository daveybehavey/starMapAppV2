/**
 * S96-1 F10 — gate-disposition pins (PR #502 gate, fix round 2).
 *
 * The build's F10 remedy refused EVERY operator resolve that carried no
 * provider identity (no authority id, no explicit id, no KV bootstrap
 * id). That blanket refusal collided with PR #501 (merged to main after
 * this branch was built): #501's route-level race suite pins the
 * designed manual-fulfilment workflow in which an operator resolves an
 * order they handled outside the system WITHOUT supplying a Printful id
 * — the resolve route records the attestation with provenance
 * (operatorResolvedAt + operatorResolvedProvider "manual_printful" +
 * the operator's note), and #501's stand-down keys on that mirror so a
 * mid-pass resolve can never produce a duplicate Printful order.
 *
 * Gate disposition: the blanket refusal is superseded by #501's merged
 * contract. F10's residual — a provenance-stamped, admin-token-gated
 * attestation on a non-terminal or terminal order — is accepted: the
 * resolve never claims provider acceptance, it records an operator
 * decision. These tests pin the accepted contract so a future change
 * cannot silently reintroduce the refusal (or silently drop the
 * attestation semantics).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPrintOrderAuthorityOp,
  createUnboundAuthorityState,
} from "./printOrderAuthorityState.harness.mjs";

test("F10 disposition: operator_resolve with no provider identity attests without binding (unbound)", () => {
  const unbound = createUnboundAuthorityState("cs_test_f10_unbound");
  const result = applyPrintOrderAuthorityOp(unbound, {
    type: "operator_resolve",
    now: 5,
  });
  assert.equal(result.ok, true, "the attestation resolve is accepted");
  assert.equal(result.state, unbound, "no authority mutation without an id");
  assert.equal(result.state.lifecycle, "unbound");
  assert.equal(result.state.printfulOrderId ?? null, null, "nothing is bound");
});

test("F10 disposition: operator_resolve with no identity still recovers a terminal failure without binding", () => {
  let state = createUnboundAuthorityState("cs_test_f10_terminal");
  state = applyPrintOrderAuthorityOp(state, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    now: 1,
  }).state;
  const result = applyPrintOrderAuthorityOp(state, {
    type: "operator_resolve",
    explicitPrintfulOrderId: "   ",
    bootstrapPrintfulOrderId: null,
    now: 2,
  });
  assert.equal(result.ok, true, "an operator may close out a terminal failure they handled manually");
  assert.equal(result.state.lifecycle, "operator_recovered");
  assert.equal(result.state.printfulOrderId ?? null, null, "recovery does not fabricate a provider id");
});

test("F10 disposition: operator_resolve with only a bootstrap id still binds it", () => {
  const unbound = createUnboundAuthorityState("cs_test_f10_bootstrap");
  const result = applyPrintOrderAuthorityOp(unbound, {
    type: "operator_resolve",
    bootstrapPrintfulOrderId: "PF-BOOT",
    now: 5,
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.printfulOrderId, "PF-BOOT");
  assert.equal(result.state.lifecycle, "bound");
});
