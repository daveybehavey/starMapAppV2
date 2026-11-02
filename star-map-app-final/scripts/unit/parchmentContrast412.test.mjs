/**
 * Issue #412 regression coverage: Parchment Scroll contrast + disc-edge fade.
 *
 * Defect: parchment stars were drawn in fixed ink #3a2d1f at a magnitude
 * alpha floored at 0.075 over the #e9d3a5 paper, so most of the field read
 * as faint dirt specks; the painted square-cell paper texture muddied it
 * further, and sky content stopped abruptly at the projection radius,
 * leaving a visible circular edge and bare corners.
 *
 * Fix (SQ-60 design): parchment starAlphaFloor 0.075 → 0.575 (the alpha
 * whose composited core measures ≈3.11:1 against the cream paper), a
 * per-star raise to the 3:1 floor against the star's actual backing
 * (paper + warm edge wash), deterministic density retention for stars
 * inside the 0.90R→R transition (opacity fade for the non-star layers),
 * premium-star routing disabled for parchment, and the paper texture
 * removed outright.
 *
 * These tests exercise the REAL pure helpers from renderSky.ts through
 * the tsAliasLoader — no mirrors — plus source pins for the renderer
 * wiring that only runs on canvas.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

register("./tsAliasLoader.mjs", import.meta.url);

const { __testUtils, STYLE_THEME } = await import("../../src/lib/renderSky.ts");
const {
  parchmentRetentionFactor,
  parchmentPaintedRetentionFactor,
  minAlphaForContrast,
  parchmentBackingAt,
  relativeLuminance,
  bortleWashOverlay,
  milkyWayBandOverlayAt,
  milkyWayBandStrength,
} = __testUtils;

const INK = { r: 0x3a, g: 0x2d, b: 0x1f };
const PAPER = { r: 0xe9, g: 0xd3, b: 0xa5 };

function composite(ink, backing, alpha) {
  return {
    r: ink.r * alpha + backing.r * (1 - alpha),
    g: ink.g * alpha + backing.g * (1 - alpha),
    b: ink.b * alpha + backing.b * (1 - alpha),
  };
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

test("retention: full inside 0.90R, zero at R and beyond, smoothstep between", () => {
  const R = 2700;
  assert.equal(parchmentRetentionFactor(0, R), 1);
  assert.equal(parchmentRetentionFactor(0.89 * R, R), 1);
  assert.equal(parchmentRetentionFactor(0.9 * R, R), 1);
  assert.equal(parchmentRetentionFactor(R, R), 0);
  assert.equal(parchmentRetentionFactor(1.2 * R, R), 0);
  assert.ok(Math.abs(parchmentRetentionFactor(0.95 * R, R) - 0.5) < 1e-9);
  // Monotonic non-increasing across the band.
  let prev = 1;
  for (let t = 0.9; t <= 1.0001; t += 0.01) {
    const f = parchmentRetentionFactor(t * R, R);
    assert.ok(f <= prev + 1e-12, `retention rose at t=${t}`);
    prev = f;
  }
  // Degenerate radius is safe.
  assert.equal(parchmentRetentionFactor(10, 0), 1);
});

test("contrast: SQ-60 arithmetic — 3:1 solves near 0.56, floor 0.575 clears it", () => {
  const needed = minAlphaForContrast(INK, PAPER, 3);
  assert.ok(needed !== null, "opaque ink must reach 3:1 over cream paper");
  assert.ok(needed > 0.54 && needed < 0.59, `expected ≈0.56, got ${needed}`);
  assert.ok(contrastRatio(composite(INK, PAPER, 0.575), PAPER) >= 3);
  assert.ok(contrastRatio(composite(INK, PAPER, needed), PAPER) >= 2.999);
  // The old floor was nowhere near criterion.
  assert.ok(contrastRatio(composite(INK, PAPER, 0.075), PAPER) < 1.3);
});

test("contrast: impossible pair returns null (explicit omission path)", () => {
  // Ink lighter than the backing can never darken it to 3:1.
  assert.equal(minAlphaForContrast({ r: 250, g: 250, b: 250 }, PAPER, 3), null);
});

test("backing: centre is pure paper, wash darkens monotonically outward", () => {
  const W = 4800;
  const H = 6000;
  const centre = parchmentBackingAt(PAPER, W / 2, H / 2, W, H);
  assert.deepEqual(centre, PAPER);
  const mid = parchmentBackingAt(PAPER, W / 2 + 0.45 * W, H / 2, W, H);
  const corner = parchmentBackingAt(PAPER, W, H, W, H);
  assert.ok(relativeLuminance(mid) < relativeLuminance(centre));
  assert.ok(relativeLuminance(corner) < relativeLuminance(mid));
  // The corner value matches the gradient model exactly: concentric
  // radial wash, alpha 0.18 × clamp((d − 0.35·min) / (0.85·max − 0.35·min)).
  // (The outer stop sits beyond the corner, so full 0.18 never lands
  // on-canvas — the model still tracks the painted gradient.)
  const d = Math.hypot(W / 2, H / 2);
  const t = Math.min(1, Math.max(0, (d - 0.35 * Math.min(W, H)) / (0.85 * Math.max(W, H) - 0.35 * Math.min(W, H))));
  const washAlpha = 0.18 * t;
  assert.ok(Math.abs(corner.r - (92 * washAlpha + PAPER.r * (1 - washAlpha))) < 0.6);
  // And the 3:1 criterion stays reachable there with a modest raise.
  const neededCorner = minAlphaForContrast(INK, corner, 3);
  assert.ok(neededCorner !== null && neededCorner > 0.575 && neededCorner < 0.75);
  assert.ok(contrastRatio(composite(INK, corner, neededCorner), corner) >= 2.999);
});

test("theme pins: parchment ink and paper are the SQ-60 pair", () => {
  assert.equal(STYLE_THEME.parchmentScroll.star, "#3a2d1f");
  assert.equal(STYLE_THEME.parchmentScroll.background, "#e9d3a5");
  assert.equal(STYLE_THEME.parchmentScroll.vignette, "rgba(0, 0, 0, 0)");
});

// ── Source pins for the canvas wiring (cannot run under plain Node) ──

const renderSkySource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../src/lib/renderSky.ts"),
  "utf8",
);

test("source: parchment floor is 0.575 and the paper texture is gone", () => {
  const parchmentBlock = renderSkySource.slice(
    renderSkySource.indexOf("parchmentScroll: {", renderSkySource.indexOf("STYLE_RENDER_PROFILES")),
    renderSkySource.indexOf("midnightMinimal: {", renderSkySource.indexOf("STYLE_RENDER_PROFILES")),
  );
  assert.ok(parchmentBlock.includes("starAlphaFloor: 0.575"));
  assert.ok(!renderSkySource.includes("drawPaperTexture"));
});

test("source: premium stars are gated off for parchment; layers route through the fade", () => {
  assert.ok(renderSkySource.includes("premium && !isParchment && (renderOptions?.premiumStars"));
  const faded = renderSkySource.match(/drawParchmentFadedLayer\(ctx, width, height, draw/g) ?? [];
  assert.equal(faded.length, 3); // constellations + Milky Way + planetary
});

test("source: parchment ink is the style's fixed ink, never a mode-palette colour", () => {
  assert.ok(renderSkySource.includes("star: isParchment ? theme.star : (mode?.palette?.star ?? theme.star)"));
});

// ── Composed backing: Bortle wash + Milky Way band (#494 × #499) ──
// drawBackground paints the Bortle wash over the parchment backing
// before drawSky paints the band, so drawStarLayer must qualify stars
// against BOTH overlays composed in that paint order —
// overlays = [bortleWash, band]. Worst case pinned here: the band
// centre (profile peak, fade retention 1) at the canvas centre.

test("composed backing: Bortle wash + band at band centre — ≥3:1-or-omission", () => {
  const W = 400;
  const H = 400;
  // Illustrated mode (vignetteStrength 1.1): band strength 0.175, the
  // same configuration the milkyWay band pins use; parchment band
  // opacity is 1 (starAlphaBoost 1, no minimalDrop).
  const strength = milkyWayBandStrength({ vignetteStrength: 1.1 }, 1);
  assert.ok(Math.abs(strength - 0.175) < 1e-12);
  const bandOverlay = milkyWayBandOverlayAt({ rgb: INK, angle: 0, strength }, W / 2, H / 2, W, H);
  assert.ok(bandOverlay);
  assert.ok(Math.abs(bandOverlay.alpha - strength) < 1e-12, "band centre: profile peak × retention 1");

  for (const bortle of [3, 1]) {
    const wash = bortleWashOverlay(bortle);
    assert.ok(wash, `Bortle ${bortle} must paint a wash`);
    const backing = parchmentBackingAt(PAPER, W / 2, H / 2, W, H, [wash, bandOverlay]);
    // The composition order is observable: [wash, band] must equal
    // the manual paint-order composite and differ from [band, wash].
    const inOrder = composite(bandOverlay.rgb, composite(wash.rgb, PAPER, wash.alpha), bandOverlay.alpha);
    const reversed = composite(wash.rgb, composite(bandOverlay.rgb, PAPER, bandOverlay.alpha), wash.alpha);
    for (const channel of ["r", "g", "b"]) {
      assert.ok(Math.abs(backing[channel] - inOrder[channel]) < 1e-9, `Bortle ${bortle}: overlays must compose in paint order`);
    }
    assert.ok(Math.abs(backing.r - reversed.r) > 1, `Bortle ${bortle}: overlay order must be observable`);
    const needed = minAlphaForContrast(INK, backing, 3);
    if (bortle === 3) {
      // Reachable, but only with a heavy raise (≈0.90): the star is
      // kept and clears 3:1 — the two darkening layers compound.
      assert.ok(needed !== null && needed > 0.85 && needed < 0.96, `Bortle 3 + band centre: expected needed ≈0.90, got ${needed}`);
      assert.ok(contrastRatio(composite(INK, backing, Math.max(0.575, needed)), backing) >= 2.999);
    } else {
      // Bortle 1: even opaque ink cannot reach 3:1 over the composed
      // backing — the criterion is omission, never a sub-3:1 paint.
      assert.equal(needed, null, "Bortle 1 + band centre must be omission");
    }
  }
});

// ── Painted fade retention (micro-fix: painter vs model) ──
// drawParchmentFadedLayer's destination-in gradient samples the
// smoothstep retention at 0.925/0.95/0.975 and interpolates
// piecewise-linearly between stops. The band overlay model must use
// that painted retention: the continuous smoothstep understates the
// painted band alpha in the outermost ring (at t≈0.96·R the painted
// retention is 0.3625 vs the smoothstep's ≈0.352), which left a
// model-qualified star painting at ≈2.9945:1.

test("painted fade retention: piecewise-linear between the sampled stops", () => {
  const R = 180; // 400 × PROJECTION_RADIUS_FACTOR (0.45)
  assert.equal(parchmentPaintedRetentionFactor(0, R), 1);
  assert.equal(parchmentPaintedRetentionFactor(0.9 * R, R), 1);
  assert.equal(parchmentPaintedRetentionFactor(R, R), 0);
  // Exact at the sampled stops (both interpolations agree there).
  assert.ok(Math.abs(parchmentPaintedRetentionFactor(0.925 * R, R) - 0.84375) < 1e-9);
  assert.ok(Math.abs(parchmentPaintedRetentionFactor(0.95 * R, R) - 0.5) < 1e-9);
  assert.ok(Math.abs(parchmentPaintedRetentionFactor(0.975 * R, R) - 0.15625) < 1e-9);
  // The worst ring point: linear between (0.95, 0.5) and
  // (0.975, 0.15625) — strictly above the smoothstep model value.
  const painted = parchmentPaintedRetentionFactor(0.96 * R, R);
  assert.ok(Math.abs(painted - 0.3625) < 1e-9, `expected 0.3625, got ${painted}`);
  assert.ok(painted > parchmentRetentionFactor(0.96 * R, R) + 0.005, "painted retention must exceed the smoothstep value at 0.96R");
  assert.equal(parchmentPaintedRetentionFactor(10, 0), 1);
});

test("band overlay at the worst fade-ring point uses the painted retention", () => {
  const W = 400;
  const H = 400;
  const R = 0.45 * W;
  const strength = milkyWayBandStrength({ vignetteStrength: 1.1 }, 1);
  // On the band centre line (angle 0 → centre line is horizontal),
  // at distance 0.96·R from the centre: profile peak × painted
  // retention 0.3625.
  const x = W / 2 + 0.96 * R;
  const overlay = milkyWayBandOverlayAt({ rgb: INK, angle: 0, strength }, x, H / 2, W, H);
  assert.ok(overlay);
  assert.ok(Math.abs(overlay.alpha - strength * 0.3625) < 1e-9, `expected ${strength * 0.3625}, got ${overlay.alpha}`);
  // And a star qualified against that painted backing really clears
  // 3:1 composited over it (the pre-fix model could qualify a star
  // that then painted at ≈2.9945:1).
  const backing = parchmentBackingAt(PAPER, x, H / 2, W, H, [overlay]);
  const needed = minAlphaForContrast(INK, backing, 3);
  assert.ok(needed !== null);
  assert.ok(contrastRatio(composite(INK, backing, Math.max(0.575, needed)), backing) >= 2.999);
});
