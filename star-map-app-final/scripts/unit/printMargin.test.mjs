import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMarginGuard, parseBool } from "./printMargin.harness.mjs";

test("parseBool accepts common truthy/falsy env strings", () => {
  assert.equal(parseBool("true"), true);
  assert.equal(parseBool("0"), false);
  assert.equal(parseBool(undefined, true), true);
});

test("margin guard blocks when enforced and margin below floor", () => {
  const result = evaluateMarginGuard({
    enabled: true,
    minMarginCents: 1000,
    marginCents: 500,
    hasEstimate: true,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, "margin_below_threshold");
});

test("margin guard allows healthy margin when enforced", () => {
  const result = evaluateMarginGuard({
    enabled: true,
    minMarginCents: 1000,
    marginCents: 6400,
    hasEstimate: true,
  });
  assert.equal(result.allowed, true);
});

test("margin guard is permissive when disabled", () => {
  const result = evaluateMarginGuard({
    enabled: false,
    minMarginCents: 1000,
    marginCents: 100,
    hasEstimate: true,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.enforced, false);
});
