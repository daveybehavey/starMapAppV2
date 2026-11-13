/**
 * revealExperience.ts — stage progress percent clamping.
 *
 * Regression targets:
 * - stage 0 → first third; last stage → 100%
 * - out-of-range indexes clamp to ends (never NaN / >100% / <first)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { REVEAL_STAGES, getRevealProgressPercent } = await import(
  "../../src/lib/revealExperience.ts"
);

test("getRevealProgressPercent: stage bounds and clamping", () => {
  assert.equal(REVEAL_STAGES.length, 3);
  assert.equal(getRevealProgressPercent(0), "33%");
  assert.equal(getRevealProgressPercent(1), "67%");
  assert.equal(getRevealProgressPercent(2), "100%");
  assert.equal(getRevealProgressPercent(-5), "33%");
  assert.equal(getRevealProgressPercent(99), "100%");
});
