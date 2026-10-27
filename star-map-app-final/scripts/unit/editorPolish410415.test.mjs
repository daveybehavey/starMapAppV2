/**
 * Editor polish #410 + #415.
 *
 * #410: both aspect pickers (EditorExperience Frame card, MobileCreate
 * Frame section) consume the shared ASPECT_OPTIONS list — exact honest
 * labels, 3:4 offered for the first time — and the square-poster note
 * sits below both picker grids with one exact copy.
 *
 * #415: shape-picker icons are inline SVGs of the actual mask geometry
 * (getShapeGeometry, the renderer's own source) instead of unicode
 * glyphs that font fallback could turn into colour emoji on Android.
 *
 * Modules with only type-only imports are loaded behaviourally;
 * printGiftDecisionCopy (runtime `@/` imports) and the TSX surfaces
 * are pinned from source, the same style as editorDiamondShape.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ASPECT_OPTIONS } from "../../src/lib/aspectOptions.ts";
import {
  SHAPE_PATHS,
  SHAPE_CIRCLE_INSET_RATIO,
  SHAPE_CIRCLE_RADIUS_RATIO,
  getShapeGeometry,
} from "../../src/lib/shapes/index.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(ROOT, "src", relativePath), "utf8");
}

/* ------------------------------ #410 ------------------------------ */

test("ASPECT_OPTIONS: exact four options, exact labels, display order", () => {
  assert.deepEqual(
    ASPECT_OPTIONS.map((o) => [o.id, o.label]),
    [
      ["square", "Square (1:1)"],
      ["3:4", "Portrait (3:4)"],
      ["2:3", "Portrait (2:3)"],
      ["4:5", "Portrait (4:5)"],
    ]
  );
});

test("ASPECT_OPTIONS: no misleading legacy labels survive", () => {
  for (const option of ASPECT_OPTIONS) {
    assert.ok(!/\b(Wide|Poster)\b/.test(option.label), `label "${option.label}" must not say Wide/Poster`);
  }
});

const POSTER_NOTE_COPY =
  "Our posters are square. Portrait designs fit inside the square print with space on either side. Choose Square to match the poster's shape.";

test("poster note: exact copy in the helper, null for square", () => {
  const source = readSrc("lib/printGiftDecisionCopy.ts");
  assert.match(source, /export function getPosterAspectMismatchMessage\(aspectRatio: AspectRatio\): string \| null \{/);
  assert.match(source, /if \(aspectRatio === "square"\) return null;/);
  assert.ok(source.includes(`return "${POSTER_NOTE_COPY}";`), "helper must return the exact #410 copy");
});

for (const [name, rel] of [
  ["EditorExperience", "components/EditorExperience.tsx"],
  ["MobileCreate", "app/MobileCreate.tsx"],
]) {
  test(`${name}: aspect picker consumes ASPECT_OPTIONS, note below the grid`, () => {
    const source = readSrc(rel);
    assert.ok(source.includes('import { ASPECT_OPTIONS } from "@/lib/aspectOptions";'));
    assert.ok(!source.includes('label: "Wide"') && !source.includes('label: "Poster"'));
    // Sequence pin: options grid -> note -> frame-border toggle.
    const gridAt = source.indexOf("ASPECT_OPTIONS.map");
    assert.notEqual(gridAt, -1);
    const noteAt = source.indexOf("<PrintAspectMismatchNotice", gridAt);
    assert.notEqual(noteAt, -1, "note must render after the aspect grid");
    const toggleAt = source.indexOf("frameEnabled: !renderOptions.frameEnabled", noteAt);
    assert.notEqual(toggleAt, -1, "note must sit above the frame-border toggle");
  });
}

test("notice placements: pickers added, purchase placements retained", () => {
  // EditorExperience: 2 pre-existing purchase placements + 1 picker = 3.
  assert.equal(readSrc("components/EditorExperience.tsx").split("<PrintAspectMismatchNotice").length - 1, 3);
  // MobileCreate: 1 pre-existing purchase placement + 1 picker = 2.
  assert.equal(readSrc("app/MobileCreate.tsx").split("<PrintAspectMismatchNotice").length - 1, 2);
  // The component renders nothing when the helper returns null (square).
  const component = readSrc("components/PrintAspectMismatchNotice.tsx");
  assert.ok(component.includes("if (!message) return null;"));
  assert.ok(component.includes('role="note"'));
});

/* ------------------------------ #415 ------------------------------ */

test("getShapeGeometry: heart/star/diamond pass the renderer's SHAPE_PATHS through verbatim", () => {
  for (const shape of ["heart", "star", "diamond"]) {
    const geometry = getShapeGeometry(shape);
    assert.equal(geometry.d, SHAPE_PATHS[shape].d, `${shape} icon geometry must be the mask path`);
    assert.deepEqual(geometry.viewBox, SHAPE_PATHS[shape].viewBox);
  }
});

test("getShapeGeometry: circle is the renderer's procedural arc (radius 0.44 x canvas), not the radius-50 table entry", () => {
  assert.equal(SHAPE_CIRCLE_INSET_RATIO, 0.06);
  assert.ok(Math.abs(SHAPE_CIRCLE_RADIUS_RATIO - 0.44) < 1e-12);
  const geometry = getShapeGeometry("circle");
  assert.deepEqual(geometry.viewBox, [0, 0, 100, 100]);
  assert.equal(geometry.d, "M50 6 A44 44 0 1 1 50 94 A44 44 0 1 1 50 6 Z");
  assert.notEqual(geometry.d, SHAPE_PATHS.circle.d);
  const radius = Number(geometry.d.match(/A([\d.]+) [\d.]+ 0 1 1/)?.[1]);
  assert.ok(Math.abs(radius - 100 * SHAPE_CIRCLE_RADIUS_RATIO) < 1e-9, "icon radius must equal the renderer ratio");
});

test("getShapeGeometry: rectangle fills the canonical canvas; all five shapes covered", () => {
  assert.deepEqual(getShapeGeometry("rectangle"), { d: "M0 0 H100 V100 H0 Z", viewBox: [0, 0, 100, 100] });
  for (const shape of ["rectangle", "heart", "circle", "star", "diamond"]) {
    const geometry = getShapeGeometry(shape);
    assert.ok(geometry.d.length > 0, `${shape} must have geometry`);
    assert.deepEqual(geometry.viewBox, [0, 0, 100, 100]);
  }
});

test("renderer circle clip consumes the shared inset ratio (no drifted literal)", () => {
  const renderSky = readSrc("lib/renderSky.ts");
  assert.ok(renderSky.includes("SHAPE_CIRCLE_INSET_RATIO"));
  assert.ok(renderSky.includes("minDim * SHAPE_CIRCLE_INSET_RATIO"));
  assert.ok(!renderSky.includes("minDim * 0.06"));
});

test("ShapeIcon: SVG contract — 24px box, 20px contain area, currentColor fill, aria-hidden", () => {
  const component = readSrc("components/ShapeIcon.tsx");
  assert.ok(component.includes('import { getShapeGeometry } from "@/lib/shapes";'));
  assert.ok(component.includes("const ICON_SIZE = 24;"));
  assert.ok(component.includes("const GLYPH_BOX = 20;"));
  assert.ok(component.includes('fill="currentColor"'));
  assert.ok(component.includes('aria-hidden="true"'));
  assert.ok(component.includes('focusable="false"'));
  assert.ok(component.includes("flexShrink: 0"));
  for (const glyph of ["♥", "★", "◆", "●", "■", "□", "○"]) {
    assert.ok(!component.includes(glyph), `ShapeIcon must not contain the ${glyph} glyph`);
  }
});

test("pickers render ShapeIcon; glyph records and local icon strings are gone", () => {
  const editor = readSrc("components/EditorExperience.tsx");
  assert.ok(editor.includes('import { ShapeIcon } from "@/components/ShapeIcon";'));
  assert.ok(editor.includes("<ShapeIcon shape={shapeOption.id}"));
  assert.ok(!editor.includes("shapeSymbols") && !editor.includes("shapeSymbolScale"));

  const simplified = readSrc("components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.ok(simplified.includes('import { ShapeIcon } from "@/components/ShapeIcon";'));
  assert.ok(simplified.includes("<ShapeIcon shape={shapeOption.id}"));
  assert.ok(!simplified.includes("icon: \""));

  const config = readSrc("lib/config.ts");
  assert.ok(!config.includes("export const shapeSymbols"));
  assert.ok(!config.includes("export const shapeSymbolScale"));
});

test("decorative stars outside the pickers are untouched (not mask representations)", () => {
  // Blog OG brand mark, success-page star-burst, testimonial rating row:
  // SQ-56 rules decorative/editorial glyphs out of #415's scope.
  assert.ok(readSrc("app/blog/[slug]/opengraph-image.tsx").includes("★"));
  assert.ok(readSrc("app/success/SuccessClient.tsx").includes("star-burst"));
  assert.ok(readSrc("components/WeddingLandingHero.tsx").includes("★"));
});
