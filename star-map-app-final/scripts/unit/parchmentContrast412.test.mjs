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
  minAlphaForContrast,
  parchmentBackingAt,
  relativeLuminance,
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
  assert.equal(faded.length, 2); // constellations + planetary
});

test("source: parchment ink is the style's fixed ink, never a mode-palette colour", () => {
  assert.ok(renderSkySource.includes("star: isParchment ? theme.star : (mode?.palette?.star ?? theme.star)"));
});
