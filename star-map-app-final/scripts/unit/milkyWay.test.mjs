import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
register("./tsAliasLoader.mjs", import.meta.url);
globalThis.Path2D = class { rect(...args) { this.rectArgs = args; } };
const { renderStarMap, __testUtils } = await import("../../src/lib/renderSky.ts");
const { parchmentBackingAt, minAlphaForContrast, relativeLuminance, milkyWayBandOverlayAt, milkyWayBandStrength, computeGalacticBandAngle } = __testUtils;

// Capture every Canvas command/property/gradient stop. Main's frozen hashes
// pin the whole output stream, rather than just the Milky Way geometry.
function render(style, options, premium = false, quality = "export", offscreen = false) {
  const commands = [];
  let id = 0;
  function canvas(label) {
    const state = { globalAlpha: 1 }, stack = [];
    const result = { width: 400, height: 400 };
    const ctx = new Proxy(state, {
      get(target, key) {
        if (key === "canvas") return result;
        if (key in target) return target[key];
        if (key === "measureText") return () => ({ width: 24 });
        if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args) => {
          commands.push([label, key, ...args]);
          if (key === "save") stack.push({ ...target });
          if (key === "restore") {
            const saved = stack.pop();
            for (const name of Object.keys(target)) delete target[name];
            Object.assign(target, saved);
          }
          if (key === "createLinearGradient" || key === "createRadialGradient") {
            const gradientId = ++id;
            return { id: gradientId, addColorStop: (...stop) => commands.push([label, "stop", gradientId, ...stop]) };
          }
        };
      },
      set(target, key, value) { commands.push([label, "set", key, value]); target[key] = value; return true; },
    });
    result.getContext = () => ctx;
    return result;
  }
  const previous = globalThis.document;
  if (offscreen) globalThis.document = { createElement: () => canvas("fade") };
  try {
    renderStarMap({
      recipe: { version: 1, seed: "milky-way-regression", datetimeISO: "2026-07-01T04:00:00Z",
        location: { name: "Vancouver", latitude: 49.28, longitude: -123.12, timezone: "America/Vancouver" },
        selectedStyle: style, shape: "rectangle", aspectRatio: "square", textBoxes: [], renderOptions: options },
      canvas: canvas("main"), width: 400, height: 400, watermark: false, quality, premium, includeText: false,
      skyOverride: { stars: [{ x: 180, y: 120, magnitude: 1, bv: 0.4 }, { x: 220, y: 160, magnitude: 4.8 }],
        constellations: [], planets: [], moon: null },
    });
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
  return commands;
}
const scenarios = [undefined, {}, ...["astronomical", "enhanced", "illustrated"].flatMap(visualMode =>
  [undefined, "minimal", "polished"].map(mapLookTier => ({ visualMode, ...(mapLookTier ? { mapLookTier } : {}) })))];
const baselineUrl = new URL("./fixtures/milky-way-navy-gold.json", import.meta.url);
const outputs = () => scenarios.flatMap((options, index) => [false, true].flatMap(premium =>
  ["preview", "og", "export"].map(quality => ({ key: `${index}/${premium}/${quality}`,
    hash: createHash("sha256").update(JSON.stringify(render("navyGold", options, premium, quality))).digest("hex") }))));
// Fixture captured from main 899ece5 before changing renderSky.ts.
test("navyGold complete Canvas stream stays byte-identical to main across 66 option/premium/quality cases", () => {
  assert.deepEqual(outputs(), JSON.parse(readFileSync(baselineUrl, "utf8")));
});
function bands(commands) {
  const stops = commands.filter(c => c[1] === "stop");
  return [...new Set(stops.map(c => c[2]))].map(id => stops.filter(c => c[2] === id)).filter(s =>
    s.length === 11 && s[0][4] === "rgba(0,0,0,0)" && s[10][4] === "rgba(0,0,0,0)");
}
for (const style of ["navyGold", "vintageEngraving", "parchmentScroll", "midnightMinimal"]) {
  test(`${style}: band follows existing premium/polish inclusion gate`, () => {
    for (const quality of ["preview", "og", "export"]) {
      for (const [options, premium, present] of [
        [{ visualMode: "enhanced", mapLookTier: "custom" }, false, false],
        [{ visualMode: "astronomical", mapLookTier: "custom" }, false, false],
        [{ visualMode: "illustrated", mapLookTier: "custom" }, false, true],
        [{ visualMode: "enhanced", mapLookTier: "polished" }, false, true],
        [{ visualMode: "illustrated", mapLookTier: "minimal" }, false, false],
        [{ visualMode: "enhanced", mapLookTier: "minimal" }, true, true],
      ]) assert.equal(bands(render(style, options, premium, quality)).length, Number(present));
    }
  });
}
test("new styles use theme ink, faint-star retention and parchment radial fade", () => {
  const options = { visualMode: "illustrated", mapLookTier: "custom" };
  const alpha = style => bands(render(style, options))[0][5][4];
  assert.equal(alpha("vintageEngraving"), "rgba(240,237,232,0.1575)");
  const minimal = alpha("midnightMinimal");
  assert.match(minimal, /^rgba\(245,248,255,/);
  const opacity = rgba => Number(rgba.slice(rgba.lastIndexOf(",") + 1, -1));
  assert.ok(Math.abs(opacity(minimal) - 0.07308) < 1e-12);
  // Tier density tuning also scales the sparse style's diffuse retention.
  const polished = bands(render("midnightMinimal", { ...options, mapLookTier: "polished" }))[0][5][4];
  assert.ok(Math.abs(opacity(polished) - 0.092568) < 1e-12);
  const parchment = render("parchmentScroll", options, false, "export", true);
  const band = bands(parchment)[0];
  assert.equal(band[0][0], "fade");
  assert.equal(band[5][4], "rgba(58,45,31,0.175)");
  assert.ok(parchment.some(c => c[0] === "fade" && c[1] === "set" && c[2] === "globalCompositeOperation" && c[3] === "destination-in"));
});

// ── Parchment band contrast regression (gate #499, thread PRRT_kwDOQraB586y40cF) ──
// The band paints dark ink over the parchment backing before the stars;
// the #412 compensation must qualify star alphas against the banded
// backing, not the bare paper.

const INK = { r: 0x3a, g: 0x2d, b: 0x1f };
const PAPER = { r: 0xe9, g: 0xd3, b: 0xa5 };
const compositeOver = (ink, backing, alpha) => ({
  r: ink.r * alpha + backing.r * (1 - alpha),
  g: ink.g * alpha + backing.g * (1 - alpha),
  b: ink.b * alpha + backing.b * (1 - alpha),
});
const contrastAgainst = (ink, backing, alpha) => {
  const comp = compositeOver(ink, backing, alpha);
  const [hi, lo] = [relativeLuminance(comp), relativeLuminance(backing)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};
// The harness recipe above (Vancouver, 2026-07-01T04:00:00Z), 400×400.
const bandRecipe = {
  datetimeISO: "2026-07-01T04:00:00Z",
  location: { name: "Vancouver", latitude: 49.28, longitude: -123.12, timezone: "America/Vancouver" },
};
function bandedBackingAt(x, y) {
  const angle = computeGalacticBandAngle(bandRecipe, 400, 400) ?? Math.PI * 0.18;
  // Illustrated mode: vignetteStrength 1.1 → strength 0.175; parchment
  // bandOpacity is 1 (starAlphaBoost 1, no minimalDrop).
  const strength = milkyWayBandStrength({ vignetteStrength: 1.1 }, 1);
  assert.ok(Math.abs(strength - 0.175) < 1e-12);
  const overlay = milkyWayBandOverlayAt({ rgb: INK, angle, strength }, x, y, 400, 400);
  return { overlay, backing: parchmentBackingAt(PAPER, x, y, 400, 400, overlay ? [overlay] : []) };
}

test("parchment band backing model: floor star needs ≈0.62 at band centre, not 0.575", () => {
  const { overlay, backing } = bandedBackingAt(200, 200);
  // Canvas centre is the band centre: profile peak, retention 1.
  assert.ok(overlay);
  assert.ok(Math.abs(overlay.alpha - 0.175) < 1e-12);
  // The defect as measured at the gate: the old floor over this backing.
  assert.ok(contrastAgainst(INK, backing, 0.575) < 3, "0.575 must fail over the banded backing");
  assert.ok(contrastAgainst(INK, backing, 0.575) > 2.6, "expected ≈2.75:1, the gate's measurement");
  const needed = minAlphaForContrast(INK, backing, 3);
  assert.ok(needed !== null && needed > 0.6 && needed < 0.65, `expected ≈0.62, got ${needed}`);
  assert.ok(contrastAgainst(INK, backing, needed) >= 2.999);
  // Off the band the overlay vanishes and the backing is the bare model.
  const offBand = milkyWayBandOverlayAt({ rgb: INK, angle: 0, strength: 0.175 }, 200, 20, 400, 400);
  assert.equal(offBand, null);
});

// Render one faint star at the canvas centre (= band centre) on
// parchment, through the production fade path (offscreen document).
function renderCentreStar(options) {
  const commands = [];
  let id = 0;
  function canvas(label) {
    const state = { globalAlpha: 1 }, stack = [];
    const result = { width: 400, height: 400 };
    const ctx = new Proxy(state, {
      get(target, key) {
        if (key === "canvas") return result;
        if (key in target) return target[key];
        if (key === "measureText") return () => ({ width: 24 });
        if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args) => {
          commands.push([label, key, ...args]);
          if (key === "save") stack.push({ ...target });
          if (key === "restore") {
            const saved = stack.pop();
            for (const name of Object.keys(target)) delete target[name];
            Object.assign(target, saved);
          }
          if (key === "createLinearGradient" || key === "createRadialGradient") {
            const gradientId = ++id;
            return { id: gradientId, addColorStop: (...stop) => commands.push([label, "stop", gradientId, ...stop]) };
          }
        };
      },
      set(target, key, value) { commands.push([label, "set", key, value]); target[key] = value; return true; },
    });
    result.getContext = () => ctx;
    return result;
  }
  const previous = globalThis.document;
  globalThis.document = { createElement: () => canvas("fade") };
  try {
    renderStarMap({
      recipe: { version: 1, seed: "milky-way-parchment-contrast", ...bandRecipe,
        selectedStyle: "parchmentScroll", shape: "rectangle", aspectRatio: "square", textBoxes: [], renderOptions: options },
      canvas: canvas("main"), width: 400, height: 400, watermark: false, quality: "export", includeText: false,
      skyOverride: { stars: [{ x: 200, y: 200, magnitude: 6.5 }], constellations: [], planets: [], moon: null },
    });
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
  const arcIndex = commands.findIndex(c => c[0] === "main" && c[1] === "arc" && c[2] === 200 && c[3] === 200);
  assert.ok(arcIndex > 0, "centre star must be painted");
  let alpha = null;
  for (let i = arcIndex - 1; i >= 0; i--) {
    if (commands[i][0] === "main" && commands[i][1] === "set" && commands[i][2] === "globalAlpha") { alpha = commands[i][3]; break; }
  }
  return alpha;
}

test("parchment render: floor star at band centre is raised to ≥3:1 over the banded backing", () => {
  const { backing } = bandedBackingAt(200, 200);
  const needed = minAlphaForContrast(INK, backing, 3);
  const alpha = renderCentreStar({ visualMode: "illustrated", mapLookTier: "custom" });
  assert.ok(alpha !== null && needed !== null);
  assert.ok(Math.abs(alpha - needed) < 0.01, `painted alpha ${alpha} must be the compensated ${needed}`);
  assert.ok(alpha > 0.6, `painted alpha ${alpha} must exceed the ≈0.62 the band requires`);
  assert.ok(contrastAgainst(INK, backing, alpha) >= 2.999, "painted star must clear 3:1 composited");
});

test("parchment render without the band keeps the uncompensated floor", () => {
  // Illustrated + minimal tier: the band inclusion gate is closed, so
  // nothing paints over the backing and the floor star stays at 0.575.
  const alpha = renderCentreStar({ visualMode: "illustrated", mapLookTier: "minimal" });
  assert.equal(alpha, 0.575);
});
