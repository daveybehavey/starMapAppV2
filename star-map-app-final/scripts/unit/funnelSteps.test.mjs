/**
 * funnelSteps.ts — closed funnel-step vocabulary.
 *
 * Regression targets:
 * - every declared FUNNEL_STEPS member is accepted by isFunnelStep
 * - unknown / empty / differently-cased strings are rejected (analytics
 *   must not invent steps that the funnel dashboard cannot aggregate)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { FUNNEL_STEPS, isFunnelStep } = await import("../../src/lib/funnelSteps.ts");

test("isFunnelStep accepts every declared step and rejects unknowns", () => {
  assert.ok(FUNNEL_STEPS.length >= 10, "funnel vocabulary must stay non-trivial");
  for (const step of FUNNEL_STEPS) {
    assert.equal(isFunnelStep(step), true, step);
  }
  assert.equal(isFunnelStep("checkout_started"), true);
  assert.equal(isFunnelStep("Checkout_Started"), false);
  assert.equal(isFunnelStep("not_a_real_step"), false);
  assert.equal(isFunnelStep(""), false);
});
