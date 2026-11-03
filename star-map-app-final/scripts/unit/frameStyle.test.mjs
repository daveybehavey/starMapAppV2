/**
 * PROD-SM W3-5 (issue #503) — frame border styles.
 *
 * The frame was a boolean (frameEnabled): one 3px accent rule at the
 * frame inset for rectangles, the shape outline for other shapes.
 * This change adds RenderOptions.frameStyle (classic | double |
 * hairline; absent = classic) computed by the pure geometry helper
 * in src/lib/frameStyle.ts and consumed by renderSky's two frame
 * sites (drawBackground's rectangle rule, the shape outline).
 *
 * The pins that matter:
 *  - classic reproduces the historical stroke EXACTLY (inset from
 *    textFit.resolveFrameInsetPx, 3×scale width, 0.8 alpha) so every
 *    saved design renders byte-identically;
 *  - double's second rule sits strictly OUTSIDE the classic rule
 *    (toward the canvas edge) and never overlaps it — the text-fit
 *    bound is derived from the same inset, so an inward rule would
 *    eat the clearance fitted text relies on (fleet U06/#409);
 *  - every stroke keeps ≥1px of canvas margin across a size ladder
 *    including slivers, and the second rule is dropped (classic
 *    renders) where the invariants cannot hold;
 *  - the shape geometry mirrors the rectangle geometry (same outer
 *    rule; the inner rule's width/alpha/gap carried across);
 *  - frameStyle is validated in draft normalisation, rides
 *    buildRecipeFromState verbatim, is written by both editor
 *    surfaces, and never reaches textFit or the render presets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  FRAME_STYLE_OPTIONS,
  computeFrameStrokes,
  computeShapeFrameStrokes,
  resolveFrameStyle,
} = await import("../../src/lib/frameStyle.ts");
const { resolveFrameInsetPx } = await import("../../src/lib/textFit.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const renderSky = read("../../src/lib/renderSky.ts");
const store = read("../../src/lib/store.ts");
const editorDraft = read("../../src/lib/editorDraft.ts");
const textFit = read("../../src/lib/textFit.ts");
const renderPresets = read("../../src/lib/renderPresets.ts");
const editorExperience = read("../../src/components/EditorExperience.tsx");
const mobileCreate = read("../../src/app/MobileCreate.tsx");

// Size ladder: [width, height] with the renderer's scale = width / 1200.
const LADDER = [
  [240, 240],
  [300, 900],
  [600, 600],
  [1040, 1300],
  [1200, 1200],
  [2000, 2500],
  [2400, 2400],
  [5400, 5400],
  [6000, 300], // pathological sliver: invariants must degrade to classic
];
const scaleFor = (w) => w / 1200;

test("resolveFrameStyle: only double/hairline are honoured, everything else is classic", () => {
  assert.equal(resolveFrameStyle("double"), "double");
  assert.equal(resolveFrameStyle("hairline"), "hairline");
  assert.equal(resolveFrameStyle("classic"), "classic");
  assert.equal(resolveFrameStyle(undefined), "classic");
  assert.equal(resolveFrameStyle(null), "classic");
  assert.equal(resolveFrameStyle("wide"), "classic");
  assert.equal(resolveFrameStyle(3), "classic");
  assert.equal(resolveFrameStyle({}), "classic");
});

test("FRAME_STYLE_OPTIONS: classic / double / hairline in display order", () => {
  assert.deepEqual(
    FRAME_STYLE_OPTIONS.map((o) => o.id),
    ["classic", "double", "hairline"],
  );
  assert.deepEqual(
    FRAME_STYLE_OPTIONS.map((o) => o.label),
    ["Classic", "Double", "Fine"],
  );
});

test("classic: exactly the historical stroke at every size", () => {
  for (const [w, h] of LADDER) {
    const scale = scaleFor(w);
    const strokes = computeFrameStrokes(resolveFrameInsetPx(w, h), scale, "classic");
    assert.equal(strokes.length, 1, `${w}x${h}`);
    assert.equal(strokes[0].insetPx, resolveFrameInsetPx(w, h), `${w}x${h} inset`);
    assert.equal(strokes[0].lineWidthPx, 3 * scale, `${w}x${h} width`);
    assert.equal(strokes[0].alpha, 0.8, `${w}x${h} alpha`);
  }
});

test("hairline: one finer rule at the classic inset", () => {
  for (const [w, h] of LADDER) {
    const scale = scaleFor(w);
    const strokes = computeFrameStrokes(resolveFrameInsetPx(w, h), scale, "hairline");
    assert.equal(strokes.length, 1, `${w}x${h}`);
    assert.equal(strokes[0].insetPx, resolveFrameInsetPx(w, h), `${w}x${h} inset`);
    assert.ok(strokes[0].lineWidthPx > 0, `${w}x${h} never vanishes`);
    assert.ok(
      strokes[0].lineWidthPx <= 3 * scale,
      `${w}x${h} never bolder than classic`,
    );
    if (scale >= 0.5) {
      assert.equal(strokes[0].lineWidthPx, 1.25 * scale, `${w}x${h} fine width`);
    }
    assert.equal(strokes[0].alpha, 0.9, `${w}x${h} alpha`);
  }
});

test("double: classic rule plus a strictly-outside, non-overlapping second rule", () => {
  for (const [w, h] of LADDER) {
    const scale = scaleFor(w);
    const strokes = computeFrameStrokes(resolveFrameInsetPx(w, h), scale, "double");
    const classic = computeFrameStrokes(resolveFrameInsetPx(w, h), scale, "classic")[0];
    assert.deepEqual(strokes[0], classic, `${w}x${h} first rule is classic`);
    if (strokes.length === 1) {
      // Dropping the second rule is only acceptable on the sliver.
      assert.equal(h, 300, `${w}x${h} dropped the second rule unexpectedly`);
      continue;
    }
    assert.equal(strokes.length, 2, `${w}x${h}`);
    const inner = strokes[1];
    assert.ok(inner.insetPx < classic.insetPx, `${w}x${h} second rule is outside the first`);
    assert.ok(
      inner.insetPx - inner.lineWidthPx / 2 >= 1,
      `${w}x${h} second rule keeps 1px of canvas margin`,
    );
    assert.ok(
      inner.insetPx + inner.lineWidthPx / 2 < classic.insetPx - classic.lineWidthPx / 2,
      `${w}x${h} rules never overlap`,
    );
    assert.equal(inner.alpha, 0.65, `${w}x${h} inner alpha`);
  }
});

test("shape strokes mirror the rectangle geometry", () => {
  for (const [w, h] of LADDER) {
    const scale = scaleFor(w);
    for (const style of ["classic", "hairline", "double"]) {
      const rect = computeFrameStrokes(resolveFrameInsetPx(w, h), scale, style);
      const shape = computeShapeFrameStrokes(resolveFrameInsetPx(w, h), w, h, scale, style);
      assert.equal(shape.lineWidthPx, rect[0].lineWidthPx, `${w}x${h} ${style} outer width`);
      assert.equal(shape.alpha, rect[0].alpha, `${w}x${h} ${style} outer alpha`);
      if (rect.length < 2) {
        assert.equal(shape.inner, null, `${w}x${h} ${style} no inner rule`);
      } else {
        assert.ok(shape.inner, `${w}x${h} ${style} inner rule present`);
        assert.ok(
          shape.inner.scaleFactor > 0 && shape.inner.scaleFactor < 1,
          `${w}x${h} ${style} inner scale factor in (0,1)`,
        );
        const gapPx = rect[0].insetPx - rect[1].insetPx;
        assert.equal(
          shape.inner.scaleFactor,
          (Math.min(w, h) - 2 * gapPx) / Math.min(w, h),
          `${w}x${h} ${style} inner rule sits one frame-gap inside the edge`,
        );
        assert.equal(shape.inner.lineWidthPx, rect[1].lineWidthPx, `${w}x${h} ${style} inner width`);
        assert.equal(shape.inner.alpha, rect[1].alpha, `${w}x${h} ${style} inner alpha`);
      }
    }
  }
});

test("source pins: the option is modelled, validated, rebuilt and rendered", () => {
  assert.ok(
    store.includes('frameStyle?: "classic" | "double" | "hairline"'),
    "RenderOptions carries the optional frameStyle field",
  );
  assert.ok(
    editorDraft.includes('frameStyle: new Set(["classic", "double", "hairline"])'),
    "draft normalisation validates frameStyle as an enum",
  );
  assert.ok(
    renderSky.includes("resolveFrameStyle(renderOptions?.frameStyle)"),
    "drawBackground resolves the style from renderOptions",
  );
  assert.ok(
    renderSky.includes("resolveFrameStyle(recipe.renderOptions?.frameStyle)"),
    "the shape outline resolves the style from the recipe",
  );
  assert.ok(renderSky.includes("computeFrameStrokes("), "rectangle frame uses the geometry helper");
  assert.ok(renderSky.includes("computeShapeFrameStrokes("), "shape outline uses the geometry helper");
  assert.ok(
    renderSky.includes("frameStyle:") &&
      renderSky.includes('input.renderOptions?.frameStyle === "double"'),
    "buildRecipeFromState rides frameStyle through rebuilds verbatim",
  );
});

test("source pins: both editor surfaces write the option, fit and presets never read it", () => {
  for (const [name, source] of [
    ["EditorExperience", editorExperience],
    ["MobileCreate", mobileCreate],
  ]) {
    assert.ok(source.includes("FRAME_STYLE_OPTIONS"), `${name} renders the style options`);
    assert.ok(
      source.includes("setRenderOptions({ frameStyle: option.id })"),
      `${name} writes frameStyle through setRenderOptions`,
    );
    assert.ok(
      source.includes("resolveFrameStyle(renderOptions.frameStyle)"),
      `${name} reads the current style through the resolver`,
    );
  }
  assert.ok(!textFit.includes("frameStyle"), "textFit never reads frameStyle (fit independence)");
  assert.ok(
    !renderPresets.includes("frameStyle"),
    "render presets never set frameStyle (buyer choice survives preset changes)",
  );
});
