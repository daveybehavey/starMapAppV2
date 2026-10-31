import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// S93-2 class 4 — moon shading reversed vs computed phase.
//
// S92-5 proved from source that drawMoon computed the correct
// illumination (1 − cos α)/2 but painted a horizontal gradient
// whose terminator stop sat at 0.5 + cos α/2 = 1 − illumination:
// phase 0 left most of the disc bright (gradient stops starColor
// up to ~the whole width), phase .5 left most of it dark, and the
// waxing branch lit from the left. The fix paints the projection
// of the sunlit hemisphere (moonPhaseGeometry.ts) as a vector
// path. These goldens pin the projection itself: the lit area at
// eight phases equals the analytic fraction, waxing is right-lit,
// waning is its mirror, and the terminator geometry the renderer
// consumes matches the predicate.

const {
  isMoonPointLit,
  moonIlluminationFraction,
  normalizeMoonPhase,
  resolveMoonTerminatorGeometry,
} = await import("../../src/lib/moonPhaseGeometry.ts");

const read = (rel) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function litAreaFraction(phase, n = 401) {
  let lit = 0;
  let inside = 0;
  for (let i = 0; i < n; i++) {
    const u = -1 + (2 * (i + 0.5)) / n;
    for (let j = 0; j < n; j++) {
      const v = -1 + (2 * (j + 0.5)) / n;
      if (u * u + v * v > 1) continue;
      inside++;
      if (isMoonPointLit(u, v, phase)) lit++;
    }
  }
  return lit / inside;
}

test("phase goldens: lit area equals (1 − cos α) / 2 at the approved phase set", () => {
  const phases = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  for (const phase of phases) {
    const expected = moonIlluminationFraction(phase);
    const measured = litAreaFraction(phase);
    assert.ok(
      Math.abs(measured - expected) <= 0.01,
      `phase ${phase}: lit area ${measured.toFixed(4)} vs analytic ${expected.toFixed(4)}`,
    );
  }
  // The endpoints are exact, not approximate: nothing is lit at
  // new, everything at full.
  assert.equal(moonIlluminationFraction(0), 0);
  assert.equal(moonIlluminationFraction(0.5), 1);
  assert.equal(isMoonPointLit(0, 0, 0), false);
  assert.equal(isMoonPointLit(0, 0, 0.5), true);
});

test("polarity: waxing is right-lit, waning is left-lit (the old gradient had waxing backwards)", () => {
  assert.equal(isMoonPointLit(0.5, 0, 0.25), true, "first quarter: right half lit");
  assert.equal(isMoonPointLit(-0.5, 0, 0.25), false);
  assert.equal(isMoonPointLit(-0.5, 0, 0.75), true, "last quarter: left half lit");
  assert.equal(isMoonPointLit(0.5, 0, 0.75), false);
  // Waxing crescent: only a right sliver.
  assert.equal(isMoonPointLit(0.9, 0, 0.125), true);
  assert.equal(isMoonPointLit(0.5, 0, 0.125), false);
  // Waxing gibbous: only a left sliver is dark.
  assert.equal(isMoonPointLit(-0.9, 0, 0.375), false);
  assert.equal(isMoonPointLit(-0.5, 0, 0.375), true);
});

test("mirror pairs: waning at phase p is waxing at 1 − p reflected", () => {
  for (const phase of [0.125, 0.25, 0.375]) {
    // (Probes stay off the terminator itself: at exactly u = 0 in
    // a quarter phase the point lies ON the boundary, where the
    // predicate's >= 0 convention meets float noise in cos(π/2).)
    for (const [u, v] of [[0.3, 0.2], [-0.6, -0.4], [0.85, 0.1], [-0.2, 0.7], [0.05, -0.9]]) {
      assert.equal(
        isMoonPointLit(u, v, phase),
        isMoonPointLit(-u, v, 1 - phase),
        `phase ${phase} point (${u}, ${v})`,
      );
    }
  }
});

test("terminator geometry: kinds, radius ratio and arc flags per phase", () => {
  assert.deepEqual(resolveMoonTerminatorGeometry(0), { kind: "empty" });
  assert.deepEqual(resolveMoonTerminatorGeometry(0.5), { kind: "full" });

  const crescent = resolveMoonTerminatorGeometry(0.125);
  assert.equal(crescent.kind, "partial");
  assert.equal(crescent.waxing, true);
  assert.ok(Math.abs(crescent.terminatorRadiusRatio - Math.SQRT1_2) < 1e-12);
  assert.equal(crescent.limbCounterclockwise, false, "waxing limb is the right side (clockwise sweep)");
  assert.equal(crescent.terminatorCounterclockwise, true, "waxing crescent terminator bulges toward the dark side");

  const quarter = resolveMoonTerminatorGeometry(0.25);
  assert.ok(Math.abs(quarter.terminatorRadiusRatio) < 1e-12, "quarter terminator is the diameter");

  const gibbous = resolveMoonTerminatorGeometry(0.375);
  assert.equal(gibbous.terminatorCounterclockwise, false, "waxing gibbous terminator bulges into the lit side");

  const waningGibbous = resolveMoonTerminatorGeometry(0.625);
  assert.equal(waningGibbous.waxing, false);
  assert.equal(waningGibbous.limbCounterclockwise, true, "waning limb is the left side");
  assert.equal(waningGibbous.terminatorCounterclockwise, true);

  const waningCrescent = resolveMoonTerminatorGeometry(0.875);
  assert.equal(waningCrescent.terminatorCounterclockwise, false);
});

test("phase normalization wraps and never propagates nonfinite input", () => {
  assert.equal(normalizeMoonPhase(1.25), 0.25);
  assert.equal(normalizeMoonPhase(-0.25), 0.75);
  assert.equal(normalizeMoonPhase(Number.NaN), 0);
  assert.equal(normalizeMoonPhase(Number.POSITIVE_INFINITY), 0);
  assert.equal(moonIlluminationFraction(1.5), 1, "phase 1.5 is full, like 0.5");
  assert.equal(isMoonPointLit(2, 0, 0.5), false, "outside the disc is never lit");
});

test("wiring: drawMoon paints the geometry module's path, not the reversed gradient", () => {
  const sky = read("src/lib/renderSky.ts");
  const start = sky.indexOf("function drawMoon(");
  const end = sky.indexOf("\nfunction ", start + 1);
  const body = sky.slice(start, end === -1 ? undefined : end);
  assert.match(body, /resolveMoonTerminatorGeometry\(phase\)/);
  assert.match(body, /moonIlluminationFraction\(phase\)/);
  assert.match(body, /ctx\.fill\("evenodd"\)/, "dark region = disc minus lit region");
  assert.doesNotMatch(body, /createLinearGradient/, "the reversed phase gradient is gone");
  assert.doesNotMatch(body, /0\.5 \+ Math\.cos\(phaseAngle\) \/ 2/);
});
