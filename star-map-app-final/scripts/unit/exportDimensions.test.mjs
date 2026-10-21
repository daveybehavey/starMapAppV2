/**
 * E-2: non-rectangular exports ignored the selected aspect ratio.
 *
 * Every shape SVG ships with a square viewBox ("0 0 100 100"), and every
 * export path derived its canvas ratio from that viewBox whenever the SVG
 * loaded — so heart/circle/star/diamond exports came out SQUARE regardless
 * of the 4:5 / 3:4 / 2:3 aspect the customer selected (a 4:5 HD heart
 * downloaded 6000x6000 instead of 6000x7500; checkout print assets were
 * square across the whole width ladder). The editor preview and rectangle
 * exports already used the selected aspect, so what customers designed
 * was not what they downloaded or bought.
 *
 * The fix sizes every export through getExportDimensions(width,
 * aspectRatio) — the selected aspect only, never the shape viewBox. The
 * renderer scales the shape path to whatever canvas it is given
 * (buildShapeClip in renderSky.ts), so canvas aspect is purely the
 * design's aspect. These tests pin:
 *   1. the width x aspect matrix at each path's ladder widths;
 *   2. shape-independence across the full shape x aspect matrix, against
 *      the real shipped SVGs (whose square viewBoxes caused the defect);
 *   3. rectangle regression: dimensions byte-identical to the legacy
 *      computation (rectangle took the recipe-ratio branch all along);
 *   4. source pins: no export surface derives a ratio from a shape
 *      viewBox ever again.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { aspectRatioToNumber, getExportDimensions } from "../../src/lib/aspectRatio.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

const ASPECTS = ["square", "4:5", "3:4", "2:3"];
const SHAPES = ["rectangle", "heart", "circle", "star", "diamond"];
// Ladder widths: HD download 6000, preview/share 1200, checkout print
// ladder tops 5400 (unframed/canvas) and 4200 (framed).
const WIDTHS = [6000, 1200, 5400, 4200];

const EXPECTED_HEIGHT = {
  square: (w) => w,
  "4:5": (w) => (w * 5) / 4,
  "3:4": (w) => (w * 4) / 3,
  "2:3": (w) => (w * 3) / 2,
};

test("export dimensions: width x aspect matrix at every ladder width", () => {
  for (const aspect of ASPECTS) {
    for (const width of WIDTHS) {
      const dims = getExportDimensions(width, aspect);
      assert.equal(dims.width, width, `${aspect} @ ${width}: width passes through`);
      assert.equal(
        dims.height,
        EXPECTED_HEIGHT[aspect](width),
        `${aspect} @ ${width}: height must be width / ${aspectRatioToNumber(aspect)}`,
      );
    }
  }
  // The memo's worked examples, pinned literally.
  assert.deepEqual(getExportDimensions(6000, "4:5"), { width: 6000, height: 7500 });
  assert.deepEqual(getExportDimensions(6000, "3:4"), { width: 6000, height: 8000 });
  assert.deepEqual(getExportDimensions(6000, "2:3"), { width: 6000, height: 9000 });
  assert.deepEqual(getExportDimensions(1200, "4:5"), { width: 1200, height: 1500 });
  assert.deepEqual(getExportDimensions(5400, "4:5"), { width: 5400, height: 6750 });
});

function shippedViewBoxRatio(shape) {
  const svg = read(`public/shapes/${shape}.svg`);
  const match = svg.match(/viewBox="([\d.\s-]+)"/);
  assert.ok(match, `${shape}.svg must declare a viewBox`);
  const [, , w, h] = match[1].trim().split(/\s+/).map(Number);
  return w / h;
}

test("shape x aspect matrix: dimensions are shape-independent (the E-2 defect)", () => {
  for (const shape of SHAPES) {
    for (const aspect of ASPECTS) {
      // Every export surface now computes exactly this, whatever the shape.
      const dims = getExportDimensions(6000, aspect);
      assert.equal(
        dims.height,
        EXPECTED_HEIGHT[aspect](6000),
        `${shape} @ ${aspect}: export height must follow the selected aspect, not the shape`,
      );
      if (shape !== "rectangle") {
        // The defect's precondition, pinned against the real asset: the
        // shipped viewBox is square, so the legacy formula
        // height = width / viewBoxRatio collapsed every aspect to square.
        const viewBoxRatio = shippedViewBoxRatio(shape);
        assert.equal(viewBoxRatio, 1, `${shape}.svg viewBox is square (the E-2 precondition)`);
        const legacyHeight = Math.max(1, Math.round(6000 / viewBoxRatio));
        if (aspect !== "square") {
          assert.notEqual(
            legacyHeight,
            dims.height,
            `${shape} @ ${aspect}: legacy viewBox sizing must differ from the fixed sizing`,
          );
        } else {
          assert.equal(legacyHeight, dims.height, `${shape} @ square: legacy and fixed agree`);
        }
      }
    }
  }
});

test("rectangle regression: dimensions byte-identical to the legacy computation", () => {
  // Legacy rectangle path: getShapeData returns null for "rectangle", so
  // the ratio was aspectRatioToNumber(recipe.aspectRatio) and the height
  // was Math.max(1, Math.round(width / ratio)). The helper must reproduce
  // those exact dimensions for every width x aspect.
  for (const aspect of ASPECTS) {
    for (const width of [...WIDTHS, 3200, 2600, 1700]) {
      const legacyHeight = Math.max(1, Math.round(width / aspectRatioToNumber(aspect)));
      assert.deepEqual(
        getExportDimensions(width, aspect),
        { width, height: legacyHeight },
        `rectangle @ ${aspect} x ${width}: must match the legacy dimensions exactly`,
      );
    }
  }
});

const EXPORT_SURFACES = [
  "src/components/EditorExperience.tsx",
  "src/components/SimplifiedEditor/SimplifiedEditor.tsx",
  "src/app/download/DownloadClient.tsx",
];

test("source pins: no export surface derives a ratio from a shape viewBox", () => {
  for (const rel of EXPORT_SURFACES) {
    const source = read(rel);
    assert.ok(
      !source.includes("shapeData.viewBox"),
      `${rel}: must not read shapeData.viewBox for sizing (E-2)`,
    );
    assert.ok(
      !source.includes("getShapeData"),
      `${rel}: getShapeData is no longer needed for export sizing (E-2)`,
    );
  }
});

test("source pins: export surfaces size through the selected aspect", () => {
  const editor = read("src/components/EditorExperience.tsx");
  const editorCalls = editor.match(/getExportDimensions\(/g) ?? [];
  assert.ok(
    editorCalls.length >= 3,
    `EditorExperience must size download, checkout print asset, and share image via getExportDimensions (found ${editorCalls.length})`,
  );
  const simplified = read("src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.ok(
    simplified.includes("getExportDimensions("),
    "SimplifiedEditor export must size via getExportDimensions",
  );
  const download = read("src/app/download/DownloadClient.tsx");
  assert.ok(
    download.includes('aspectRatioToNumber(activeRecipe.aspectRatio ?? "square")'),
    "DownloadClient resolver must take the ratio from the recipe's selected aspect",
  );
  const renderSky = read("src/lib/renderSky.ts");
  assert.ok(
    renderSky.includes('export { aspectRatioToNumber, getExportDimensions } from "@/lib/aspectRatio"'),
    "renderSky must re-export the aspect helpers so existing importers keep working",
  );
});
