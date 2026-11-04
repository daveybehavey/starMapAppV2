/**
 * #555 (audit #516, E4 residual): surface textFit's overflow report as
 * editor UI feedback.
 *
 * The renderer has always computed the verdict — resolveTextLineLayout
 * returns `overflow` when a fitted line still cannot be contained in
 * its shape-aware bound (the MIN_TEXT_FIT_SCALE floor binds, or the
 * anchor has no capacity) — but drawText painted the line and kept
 * only its bounds, so the editor could never warn. #530 shipped E4's
 * maxLength half; this is the other half.
 *
 * These tests pin, behaviourally through the editor's own render path
 * (renderStarMapTextLayer, the overlay PreviewCanvas draws):
 *   - a floor-spilling line is reported in the textOverflow set;
 *   - a fitting line, and a line that shrinks but IS contained, are
 *     not reported (the signal is overflow, not any shrink);
 *   - the set is rebuilt per render (no stale ids);
 *   - painting is identical with and without the new option, so every
 *     existing caller and style renders exactly as before.
 * Plus source pins for the editor wiring (PreviewCanvas publish,
 * desktop + mobile warning placement), in the house style of
 * renderTextFit / editorMobileAuditBatch.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { renderStarMapTextLayer } = await import("../../src/lib/renderSky.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

/* ------------------------------------------------------------------ */
/* Stub canvas: measureText advances 0.55em per character at the       */
/* currently-set font size, so fit outcomes are deterministic.         */
/* ------------------------------------------------------------------ */

function makeHarness() {
  const fillTextCalls = [];
  const state = { font: "" };
  const ctx = new Proxy(
    {},
    {
      set(target, key, value) {
        target[key] = value;
        if (key === "font") state.font = String(value);
        return true;
      },
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (key === "measureText") {
            const size = Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] ?? 0);
            return { width: String(args[0]).length * size * 0.55 };
          }
          if (key === "fillText") {
            fillTextCalls.push([...args]);
            return undefined;
          }
          return undefined;
        };
      },
    },
  );
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  return { canvas, fillTextCalls };
}

const box = (overrides = {}) => ({
  id: "title",
  label: "Title",
  text: "Our Wedding",
  fontFamily: "playfair",
  color: "#ffffff",
  size: 28,
  fontWeight: 600,
  align: "center",
  ...overrides,
});

// 600x600 framed rectangle: scale 0.5 against the 1200px reference
// canvas, frame-aware capacity 562px (inset 16 + padding 3 per side).
function renderLayer(boxes, extra = {}) {
  const { canvas, fillTextCalls } = makeHarness();
  const textBounds = new Map();
  const textOverflow = new Set();
  renderStarMapTextLayer({
    canvas,
    width: 600,
    height: 600,
    textBoxes: boxes,
    pixelRatio: 1,
    textBounds,
    textOverflow,
    shape: "rectangle",
    frameEnabled: true,
    ...extra,
  });
  return { textBounds, textOverflow, fillTextCalls };
}

const LONG_240 = "x".repeat(240);

/* ------------------------------------------------------------------ */
/* Behaviour: the overflow report                                     */
/* ------------------------------------------------------------------ */

test("a floor-spilling line is reported as overflow (240 chars at size 64)", () => {
  // Base font 32px at this scale; measured 240 x 32 x 0.55 = 4224px
  // against a 562px capacity — even the 0.5 fit floor leaves it at
  // 2112px wide, far outside the frame. This is the #510 measurement
  // (270/270 max-length rows overflow the floor) at editor scale.
  const { textBounds, textOverflow } = renderLayer([
    box({ text: LONG_240, size: 64 }),
  ]);
  assert.deepEqual([...textOverflow], ["title"]);
  // The bounds record is untouched: the box still renders and drags.
  assert.ok(textBounds.has("title"));
});

test("a fitting line is not reported", () => {
  const { textOverflow } = renderLayer([box({})]);
  assert.equal(textOverflow.size, 0);
});

test("a line that shrinks but is contained is not reported", () => {
  // 45 chars at size 64: measured 792px, fit scale ~0.71 — the fitted
  // line lands exactly inside the frame, so no warning: the signal is
  // overflow (floor spill), not any shrink. The bounds prove the
  // shrink really happened (unfitted it would be 792px wide).
  const { textBounds, textOverflow } = renderLayer([
    box({ text: "y".repeat(45), size: 64 }),
  ]);
  assert.equal(textOverflow.size, 0);
  const width = textBounds.get("title")?.width ?? 0;
  assert.ok(width > 500 && width < 600, `fitted width ${width} should be ~562`);
});

test("only the overflowing rows are reported", () => {
  const { textOverflow } = renderLayer([
    box({ id: "title", text: LONG_240, size: 64 }),
    box({ id: "subtitle", text: "June 14, 2026", size: 28 }),
  ]);
  assert.deepEqual([...textOverflow], ["title"]);
});

test("the set is rebuilt on every render — no stale ids", () => {
  const { canvas } = makeHarness();
  const textOverflow = new Set();
  const base = {
    canvas,
    width: 600,
    height: 600,
    pixelRatio: 1,
    textOverflow,
    shape: "rectangle",
    frameEnabled: true,
  };
  renderStarMapTextLayer({
    ...base,
    textBoxes: [box({ text: LONG_240, size: 64 })],
  });
  assert.deepEqual([...textOverflow], ["title"]);
  renderStarMapTextLayer({ ...base, textBoxes: [box({ text: "Short" })] });
  assert.equal(textOverflow.size, 0);
});

test("shape-layout version changes the verdict for v2 shaped masks (PR #559 bot finding)", () => {
  // Diamond at 600x900, a centred row low in the mask (y = 0.72):
  // legacy stretched-mask geometry fits 13 chars at size 64, but the
  // v2 geometry the preview actually uses does not — the fitted line
  // spills there. A caller that omits shapeLayoutVersion silently
  // suppresses a real overflow, which is why both panels' pre-reveal
  // computations pass the design's version explicitly.
  const diamondBox = box({
    text: "z".repeat(13),
    size: 64,
    position: { x: 0.5, y: 0.72 },
  });
  const renderDiamond = (extra) => {
    const { canvas } = makeHarness();
    const textOverflow = new Set();
    renderStarMapTextLayer({
      canvas,
      width: 600,
      height: 900,
      textBoxes: [diamondBox],
      pixelRatio: 1,
      textOverflow,
      shape: "diamond",
      frameEnabled: true,
      ...extra,
    });
    return textOverflow;
  };
  assert.equal(renderDiamond({}).size, 0);
  assert.deepEqual([...renderDiamond({ shapeLayoutVersion: 2 })], ["title"]);
});

test("painting is identical with and without the overflow option", () => {
  const boxes = [box({ text: LONG_240, size: 64 }), box({ id: "subtitle", text: "June 14, 2026" })];
  const withOption = renderLayer(boxes);
  const { canvas, fillTextCalls } = makeHarness();
  renderStarMapTextLayer({
    canvas,
    width: 600,
    height: 600,
    textBoxes: boxes,
    pixelRatio: 1,
    shape: "rectangle",
    frameEnabled: true,
  });
  assert.deepEqual(fillTextCalls, withOption.fillTextCalls);
  assert.equal(withOption.fillTextCalls.length, 2);
});

/* ------------------------------------------------------------------ */
/* Wiring pins                                                         */
/* ------------------------------------------------------------------ */

test("wiring: drawText records layout.overflow; both render entry points thread the set", () => {
  const source = read("../../src/lib/renderSky.ts");
  assert.match(source, /textOverflow\?: Set<string>/);
  assert.match(source, /if \(textOverflow\) textOverflow\.clear\(\)/);
  assert.match(source, /textOverflow && layout\.overflow/);
  assert.match(source, /textOverflow\.add\(box\.id\)/);
  // renderStarMap + renderStarMapTextLayer both accept and forward it.
  assert.ok((source.match(/textOverflow,/g) ?? []).length >= 2);
});

test("wiring: PreviewCanvas collects the set and publishes only on change", () => {
  const source = read("../../src/components/PreviewCanvas.tsx");
  assert.match(source, /onTextOverflowChange\?: \(overflowBoxIds: ReadonlySet<string>\) => void/);
  assert.match(source, /textOverflow: textOverflowRef\.current/);
  assert.match(source, /publishedOverflowSignatureRef/);
  // The signature starts at null (unpublished), never "": an initial
  // empty string would compare equal to the first empty report and
  // suppress it, stranding a stale pre-reveal warning (PR #559).
  assert.match(source, /publishedOverflowSignatureRef = useRef<string \| null>\(null\)/);
  assert.match(source, /onTextOverflowChangeRef\.current\?\.\(new Set\(textOverflowRef\.current\)\)/);
});

test("wiring: the warning component is the house amber notice, warn-only", () => {
  const source = read("../../src/components/TextFitOverflowWarning.tsx");
  assert.match(source, /role="note"/);
  assert.match(source, /border-amber-400\/40 bg-amber-500\/15/);
  assert.match(source, /smallest fit\s+size/);
});

test("wiring: desktop editor warns in Your Message and in the Text Styling card", () => {
  const source = read("../../src/components/EditorExperience.tsx");
  assert.match(source, /onTextOverflowChange={setTextOverflowBoxIds}/);
  const renders = source.match(/textOverflowBoxIds\.has\(box\.id\) && <TextFitOverflowWarning \/>/g) ?? [];
  assert.ok(renders.length >= 2, `expected >=2 warning sites, found ${renders.length}`);
});

test("wiring: mobile editor warns in both Your Message sections and the Text Styling card", () => {
  const source = read("../../src/app/MobileCreate.tsx");
  assert.match(source, /onTextOverflowChange={setTextOverflowBoxIds}/);
  const renders = source.match(/textOverflowBoxIds\.has\(box\.id\) && <TextFitOverflowWarning \/>/g) ?? [];
  assert.ok(renders.length >= 3, `expected >=3 warning sites, found ${renders.length}`);
});

test("wiring: mobile computes the report pre-reveal through the shared text layer (PR #559 bot finding)", () => {
  // The guided inputs render before PreviewCanvas mounts, so the
  // report is computed offscreen through renderStarMapTextLayer —
  // the same fit code path, not a second computation — and the
  // effect stands down once the preview is revealed.
  const source = read("../../src/app/MobileCreate.tsx");
  assert.match(source, /renderStarMapTextLayer\(\{/);
  assert.match(source, /if \(revealed\) return;/);
  assert.match(source, /preRevealOverflowSignatureRef/);
  // The offscreen call carries the design's shape-layout version,
  // like PreviewCanvas's own call — omitting it fits against legacy
  // mask geometry and can suppress a real warning.
  assert.match(source, /shapeLayoutVersion: renderOptions\?\.shapeLayoutVersion/);
});

test("wiring: desktop computes the report pre-reveal too (PR #559 bot finding)", () => {
  // EditorExperience has the same reveal gate as mobile: its
  // PreviewCanvas also mounts only once revealed, so the desktop
  // guided inputs need the same offscreen pre-reveal computation.
  const source = read("../../src/components/EditorExperience.tsx");
  assert.match(source, /renderStarMapTextLayer\(\{/);
  assert.match(source, /if \(revealed\) return;/);
  assert.match(source, /preRevealOverflowSignatureRef/);
  assert.match(source, /shapeLayoutVersion: renderOptions\?\.shapeLayoutVersion/);
});
