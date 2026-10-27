/**
 * Persona sweep Wave D (fleet PR #15 findings U06, U08, U13, U14, U15,
 * U19 + the keepsake-card rider): the render text fit respects the
 * design's own boundaries, /download's unverified state is coherent,
 * picker/label contrast meets 4.5:1 by the WCAG computed method, the
 * draft's shapeMask follows the selected shape, and the home header
 * fits 360px with one canonical CTA label.
 *
 * Behaviour tests run against the real libs (textFit, editorDraft,
 * store); component wiring is pinned from source, per repo convention.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MIN_TEXT_FIT_SCALE,
  resolveDiamondHalfWidthAt,
  resolveFrameInsetPx,
  resolveFrameTextFitPaddingPx,
  resolveShapeTextAvailableWidth,
  resolveTextFitScale,
} from "../../src/lib/textFit.ts";
import { normalizeEditorDraftData } from "../../src/lib/editorDraft.ts";
import {
  resolveTextFitFrameEnabled,
  resolveTransparentMat,
} from "./textFitFrameParity.harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/* ---------- WCAG contrast (the fleet's computed method) ---------- */
function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
function blend(fg, alpha, bg) {
  return fg.map((v, i) => Math.round(alpha * v + (1 - alpha) * bg[i]));
}
const MIDNIGHT = [12, 16, 33]; // --color-midnight #0c1021
const AMBER_400 = [251, 191, 36]; // #fbbf24
const NAVY_LIGHT = [11, 26, 48]; // #0b1a30 (lightest editor navy stop)
const NAVY_DEEP = [5, 11, 24]; // #050b18

/* ---------- U06: frame-aware text fit ---------- */

test("U06: the frame inset helper is the formula the frame stroke uses", () => {
  assert.equal(resolveFrameInsetPx(1200, 1200), 16);
  assert.equal(resolveFrameInsetPx(400, 400), 12);
  assert.equal(resolveFrameInsetPx(200, 900), 8);
  const sky = read("src/lib/renderSky.ts");
  assert.match(sky, /const inset = resolveFrameInsetPx\(width, height\);/);
});

test("U06: a framed rectangle fits text inside the frame's inner bounds", () => {
  const layout = { shape: "rectangle", frameEnabled: true, centerYNorm: 0.12, lineHeightPx: 57.6, width: 1200, height: 1200 };
  const available = resolveShapeTextAvailableWidth(layout);
  // Frame inset on both sides, less the U14-fix rider's inner padding
  // (fleet PR #16 check 1: fitted glyphs touched the frame line); the
  // padding itself is pinned in personaSweepU14DiamondFix.test.mjs.
  assert.equal(available, 1200 - (16 + resolveFrameTextFitPaddingPx(1200)) * 2);
  // The fleet's long title: wider than the frame's inner bounds but
  // narrower than the canvas — previously scale 1 (spanning the frame
  // line to the canvas edge), now it shrinks to the inner bounds.
  const wide = 1190;
  assert.equal(resolveTextFitScale(wide, 1200), 1); // old bound
  const scale = resolveTextFitScale(wide, available);
  assert.ok(scale < 1);
  assert.ok(Math.abs(wide * scale - available) < 1e-9);
  // A short title is untouched.
  assert.equal(resolveTextFitScale(600, available), 1);
  // No frame drawn -> no frame bound.
  assert.equal(resolveShapeTextAvailableWidth({ ...layout, frameEnabled: false }), 1200);
  // Other shapes keep the full-canvas behaviour.
  assert.equal(resolveShapeTextAvailableWidth({ ...layout, shape: "heart" }), 1200);
  assert.equal(resolveShapeTextAvailableWidth({ ...layout, shape: "circle" }), 1200);
});

/* ---------- U14: diamond geometry + shapeMask ---------- */

test("U14: diamond half-width derives from the mask path geometry", () => {
  assert.equal(resolveDiamondHalfWidthAt(0.5), 0.44);
  assert.equal(resolveDiamondHalfWidthAt(0.06), 0);
  assert.equal(resolveDiamondHalfWidthAt(0.94), 0);
  assert.equal(resolveDiamondHalfWidthAt(0), 0);
  assert.ok(Math.abs(resolveDiamondHalfWidthAt(0.12) - 0.06) < 1e-9);
  assert.ok(Math.abs(resolveDiamondHalfWidthAt(0.9) - 0.04) < 1e-9);
});

test("U14: diamond text fits the mask width at its own row", () => {
  const base = { shape: "diamond", frameEnabled: true, lineHeightPx: 57.6, width: 1200, height: 1200 };
  // Title row (the former default y=0.12, pre-U14-fix): the span reaches y=0.096, where the mask
  // is only ~7.2% of the canvas wide — vs the full 1200px the old fit used.
  const titleAvail = resolveShapeTextAvailableWidth({ ...base, centerYNorm: 0.12 });
  assert.ok(Math.abs(titleAvail - 86.4) < 1e-6, `titleAvail=${titleAvail}`);
  // Dedication row (the former default y=0.9) is similarly narrow.
  const dedAvail = resolveShapeTextAvailableWidth({ ...base, centerYNorm: 0.9 });
  assert.ok(dedAvail < 150, `dedAvail=${dedAvail}`);
  // Middle row is the widest the mask gets.
  const midAvail = resolveShapeTextAvailableWidth({ ...base, centerYNorm: 0.5 });
  assert.ok(Math.abs(midAvail - 998.4) < 1e-6, `midAvail=${midAvail}`);
  // A typical title (340px at base size) now shrinks on the title row
  // instead of being drawn across the apex at full size.
  assert.ok(resolveTextFitScale(340, titleAvail) < 1);
  assert.equal(resolveTextFitScale(340, 1200), 1); // old behaviour
});

test("U14: diamond text at the apex stays at the shrink floor — no full-size jump (Codex P2)", () => {
  const base = { shape: "diamond", frameEnabled: true, lineHeightPx: 57.6, width: 1200, height: 1200 };
  const line = 340;
  // Codex's exact example: at y=0.10 the line's span still touches mask
  // on both rows (bound ~38px) and the fit floors at 0.5. At y=0.08 the
  // span crosses the top apex (y=0.06), so the raw mask width across
  // the span is zero — real geometry reporting no room. That must floor
  // too, not jump back to full size (scale 1) as it did when the zero
  // flowed into resolveTextFitScale's unmeasurable-input guard.
  const at010 = resolveTextFitScale(line, resolveShapeTextAvailableWidth({ ...base, centerYNorm: 0.1 }));
  const at008 = resolveTextFitScale(line, resolveShapeTextAvailableWidth({ ...base, centerYNorm: 0.08 }));
  assert.equal(at010, MIN_TEXT_FIT_SCALE);
  assert.equal(at008, MIN_TEXT_FIT_SCALE);
  assert.equal(at008, at010); // continuous across the apex — no jump
  // The zero from geometry is clamped to the 1px bound at the source…
  assert.equal(resolveDiamondHalfWidthAt(0.056), 0); // raw geometry is still zero there
  assert.equal(resolveShapeTextAvailableWidth({ ...base, centerYNorm: 0.08 }), 1);
  // …while the shared helper's degenerate-input contract is untouched:
  // a zero bound arriving as "no measurement" still never scales.
  assert.equal(resolveTextFitScale(1200, 0), 1);
  // A line dragged fully past either apex stays floored as well.
  assert.equal(resolveTextFitScale(line, resolveShapeTextAvailableWidth({ ...base, centerYNorm: 0.03 })), MIN_TEXT_FIT_SCALE);
  assert.equal(resolveTextFitScale(line, resolveShapeTextAvailableWidth({ ...base, centerYNorm: 0.97 })), MIN_TEXT_FIT_SCALE);
});

test("U14: draft normalization syncs a stale shapeMask to the shape field", () => {
  const base = {
    version: 1,
    seed: "wave-d",
    datetimeISO: "2024-06-15T20:30:00.000Z",
    location: { name: "Paris, France", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris" },
    textBoxes: [],
    selectedStyle: "navyGold",
    aspectRatio: "square",
  };
  const stale = normalizeEditorDraftData({
    ...base,
    shape: "heart",
    renderOptions: { shapeMask: "circle" },
  });
  assert.equal(stale.ok, true);
  assert.equal(stale.value.shape, "heart");
  assert.equal(stale.value.renderOptions.shapeMask, "heart");
  // Legacy mask-only drafts still resolve shape from the mask, unchanged.
  const legacy = normalizeEditorDraftData({ ...base, renderOptions: { shapeMask: "star" } });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.value.shape, "star");
  assert.equal(legacy.value.renderOptions.shapeMask, "star");
});

test("U14: the store's shapeMask follows setShape and starts in sync", () => {
  // store.ts pulls extensionless imports plain Node cannot resolve, so
  // the wiring is pinned from source (repo convention for store-level
  // state; the draft-normalization behaviour above covers the data path).
  const source = read("src/lib/store.ts");
  assert.match(source, /shape: "rectangle",[\s\S]*?shapeMask: "rectangle",/);
  assert.match(
    source,
    // #407: setShape's updater became a block body so it can resolve
    // the design's layout footprint for the row relocation.
    /setShape: \(shape\) =>\s*\n?\s*set\(\(state\) => \{[\s\S]*?renderOptions: \{ \.\.\.state\.renderOptions, shapeMask: shape \},[\s\S]*?textBoxes: applyDefaultTextRowsForShape\(\s*state\.textBoxes,\s*shape,\s*resolveShapeMaskFootprint\(/,
  );
  // The textBoxes term is the U14-fix default-row relocation (fleet
  // PR #16); its behaviour is pinned in personaSweepU14DiamondFix.test.mjs.
});

test("U14: no fixed 'circle' mask default remains in recipe/store/sample sources", () => {
  for (const rel of ["src/lib/renderSky.ts", "src/lib/store.ts", "src/components/SimplifiedEditor/SimplifiedEditor.tsx"]) {
    const source = read(rel);
    assert.ok(!source.includes('shapeMask: "circle"'), `${rel} still defaults shapeMask to "circle"`);
    assert.ok(!source.includes('?? "circle"'), `${rel} still falls back to "circle"`);
  }
  const sky = read("src/lib/renderSky.ts");
  assert.match(sky, /shapeMask:\s*\n?\s*input\.shape \|\| \(input\.renderOptions\?\.shapeMask as Shape\) \|\| "rectangle"/);
});

/* ---------- U08: /download unverified state ---------- */

test("U08: HD badge, subtitle and preview placeholder are gated on verification", () => {
  const source = read("src/app/download/DownloadClient.tsx");
  // Badge renders only for verified (paid) visitors.
  assert.match(source, /\{paid \? \(\s*<span[^>]*>\s*HD ready/);
  // The not-verified subtitle replaces the final-file claim.
  assert.match(source, /status === "not-paid"\s*\?\s*"Your preview appears here once your access is verified\."/);
  // Static not-paid and no-draft placeholders sit between the preview
  // image branch and the spinner branch.
  const notPaidIdx = source.indexOf('status === "not-paid" ? (');
  const spinnerIdx = source.indexOf("Rendering your preview...");
  assert.ok(notPaidIdx !== -1 && spinnerIdx !== -1 && notPaidIdx < spinnerIdx);
  assert.match(source, /Access not verified yet — reopen your secure success link/);
  assert.match(source, /No map is saved on this device yet/);
  // The verified flow still renders the preview image + render path.
  assert.match(source, /if \(!paidRef\.current\) return;/);
});

/* ---------- U13: picker contrast + mobile badges ---------- */

test("U13: selected-tile pair meets 4.5:1 by the computed method (old pair did not)", () => {
  // New pair: midnight text on the solid amber-400 fill.
  assert.ok(contrastRatio(MIDNIGHT, AMBER_400) >= 4.5, `new=${contrastRatio(MIDNIGHT, AMBER_400)}`);
  // Badge on the selected fill: midnight at 70% over amber-400.
  assert.ok(contrastRatio(blend(MIDNIGHT, 0.7, AMBER_400), AMBER_400) >= 4.5);
  // Old pair (documents the defect): midnight on amber-500/20 composited
  // over the navy card — the fleet computed ~1.55:1.
  const oldBg = blend([245, 158, 11], 0.2, blend([255, 255, 255], 0.05, [15, 31, 58]));
  assert.ok(contrastRatio(MIDNIGHT, oldBg) < 2, `old=${contrastRatio(MIDNIGHT, oldBg)}`);
});

test("U13: both pickers use the solid fill; mobile shows the HD only badge", () => {
  const desktop = read("src/components/EditorExperience.tsx");
  assert.match(desktop, /"!text-midnight border-amber-400 bg-amber-400 shadow-amber-500\/20"/);
  // The shape tiles specifically no longer use the translucent gradient
  // (sibling tile groups keep it — observed, out of U13's scope).
  const shapeBlock = desktop.slice(desktop.indexOf("{shapes.map((shapeOption)"), desktop.indexOf("{shape !== \"rectangle\""));
  assert.ok(!shapeBlock.includes("from-amber-500/20"), "shape tiles still use the translucent gradient");
  const mobile = read("src/app/MobileCreate.tsx");
  assert.match(mobile, /"border-amber-400 bg-amber-400 !text-midnight"/);
  // Mobile premium set matches desktop's, with the badge rendered.
  assert.match(mobile, /shapeOption\.id !== "rectangle" && shapeOption\.id !== "circle"/);
  const shapeSection = mobile.slice(mobile.indexOf("{/* Shape */}"), mobile.indexOf("{/* Frame */}"));
  assert.ok(shapeSection.includes("HD only"), "mobile shape tiles lack the HD only badge");
});

/* ---------- U15: editor label contrast ---------- */

test("U15: LocationSearch colours meet 4.5:1 on the editor navy stops", () => {
  const WHITE = [255, 255, 255];
  const NEUTRAL_300 = [212, 212, 212];
  for (const bg of [NAVY_LIGHT, NAVY_DEEP]) {
    assert.ok(contrastRatio(WHITE, bg) >= 4.5);
    assert.ok(contrastRatio(NEUTRAL_300, bg) >= 4.5);
  }
  // Old colours (documents the defect): neutral-800 label ~1.05:1,
  // neutral-600/700 timezone line ~1.85:1 / ~1.39:1 in the fleet's
  // computation — all far below the floor on either navy stop.
  assert.ok(contrastRatio([38, 38, 38], NAVY_LIGHT) < 2);
  assert.ok(contrastRatio([82, 82, 82], NAVY_LIGHT) < 4.5);
  assert.ok(contrastRatio([64, 64, 64], NAVY_LIGHT) < 4.5);
  const source = read("src/components/LocationSearch.tsx");
  assert.match(source, /<label className="text-sm font-medium text-white">Location<\/label>/);
  assert.match(source, /Timezone: <span className="font-semibold text-white">/);
});

/* ---------- U19: header fit + canonical CTA ---------- */

test("U19: header CTA label is the canonical one everywhere; Gallery yields below sm", () => {
  const source = read("src/components/SiteTopNav.tsx");
  assert.ok(!source.includes("Create yours"));
  assert.match(source, />\s*Create map\s*<\/Link>/);
  const gallery = source.slice(source.indexOf("/star-map-gallery"), source.indexOf("Gallery"));
  assert.match(gallery, /hidden/);
  assert.match(gallery, /sm:inline-flex/);
});

/* ---------- Rider: keepsake card register ---------- */

test("Rider: remaining display copy says Keepsake card; GA4 item name deliberately kept", () => {
  assert.match(read("src/lib/printCatalog.ts"), /labelFallback: "Keepsake card \(4×6\)"/);
  assert.match(read("src/components/EditorExperience.tsx"), /Keepsake card artwork is missing/);
  assert.match(read("src/components/GiftFormatRoadmapModule.tsx"), /<li>Keepsake card<\/li>/);
  for (const rel of ["src/lib/printCatalog.ts", "src/components/GiftFormatRoadmapModule.tsx"]) {
    assert.ok(!read(rel).includes("Greeting card"), `${rel} still says Greeting card`);
  }
  // Not display copy: the analytics taxonomy label stays (renaming it
  // would split GA4 item history).
  assert.match(read("src/lib/analytics.ts"), /card_4x6: "Star Map Greeting Card"/);
});

/* ---------- U06 follow-up: transparent-mat frame parity (Codex round 2) ---------- */

test("frame parity: a transparent mat disables the text-fit frame even with the frame switch on", () => {
  // The Minimal tier bakes transparentBackground into the recipe; turning
  // Frame Border on afterwards yields {transparentBackground: true,
  // frameEnabled: true}. The full renderer draws no frame over a
  // transparent mat, so its text-fit frame flag is false.
  const minimalFrameOn = { transparentBackground: true, frameEnabled: true };
  assert.equal(resolveTransparentMat("preview", minimalFrameOn), true);
  assert.equal(resolveTextFitFrameEnabled("preview", minimalFrameOn), false);
});

test("frame parity: a framed non-transparent recipe keeps the text-fit frame", () => {
  assert.equal(resolveTextFitFrameEnabled("preview", { frameEnabled: true }), true);
  assert.equal(
    resolveTextFitFrameEnabled("preview", { frameEnabled: true, transparentBackground: false }),
    true,
  );
  // Defaults: no render options at all still means frame on, mat filled.
  assert.equal(resolveTextFitFrameEnabled("preview", undefined), true);
  // Frame switched off wins regardless of the mat.
  assert.equal(resolveTextFitFrameEnabled("preview", { frameEnabled: false }), false);
  assert.equal(
    resolveTextFitFrameEnabled("preview", { frameEnabled: false, transparentBackground: false }),
    false,
  );
  // Print purpose never has a transparent mat, so the frame flag follows
  // the frame switch alone.
  assert.equal(
    resolveTextFitFrameEnabled("print", { frameEnabled: true, transparentBackground: true }),
    true,
  );
});

test("frame parity: the flag flips the 400px fit between scale 1 and the frame-inset scale", () => {
  // Codex's example: a 400px-wide line on a 400px canvas. With the flag
  // off (transparent mat), the fit bound is the full canvas width and the
  // line renders at scale 1 in both the overlay and the full renderer.
  const layout = {
    shape: "rectangle",
    centerYNorm: 0.12,
    lineHeightPx: 57.6,
    width: 400,
    height: 400,
  };
  const minimalFrameOn = { transparentBackground: true, frameEnabled: true };
  const overlayFlag = resolveTextFitFrameEnabled("preview", minimalFrameOn);
  const framelessWidth = resolveShapeTextAvailableWidth({ ...layout, frameEnabled: overlayFlag });
  assert.equal(framelessWidth, 400);
  assert.equal(resolveTextFitScale(400, framelessWidth), 1);
  // With the flag on (framed, filled mat), the bound is the frame's inner
  // width (less the U14-fix rider's padding) and the same line shrinks to
  // 372/400 = 0.93 — the size the overlay wrongly produced for the
  // transparent-mat recipe before (376/400 = 0.94 pre-rider).
  const framedWidth = resolveShapeTextAvailableWidth({ ...layout, frameEnabled: true });
  assert.equal(
    framedWidth,
    400 - (resolveFrameInsetPx(400, 400) + resolveFrameTextFitPaddingPx(400)) * 2,
  );
  assert.equal(resolveTextFitScale(400, framedWidth), 0.93);
});

test("frame parity: harness stays locked to mapLookTiers and both call sites use the shared helper", () => {
  const lib = read("src/lib/mapLookTiers.ts");
  assert.match(lib, /export function resolveTextFitFrameEnabled\(/);
  assert.match(lib, /const showFrame = renderOptions\?\.frameEnabled \?\? true;/);
  assert.match(lib, /return showFrame && !resolveTransparentMat\(purpose, renderOptions\);/);
  const harness = read("scripts/unit/textFitFrameParity.harness.mjs");
  assert.match(harness, /return renderOptions\?\.transparentBackground \?\? false;/);
  assert.match(harness, /return showFrame && !resolveTransparentMat\(purpose, renderOptions\);/);

  const sky = read("src/lib/renderSky.ts");
  assert.match(sky, /resolveTextFitFrameEnabled,\n\s+resolveTransparentMat,/);
  assert.match(
    sky,
    /frameEnabled: resolveTextFitFrameEnabled\(matPurpose, recipe\.renderOptions\),/,
  );

  const preview = read("src/components/PreviewCanvas.tsx");
  assert.match(preview, /import \{ resolveTextFitFrameEnabled \} from "@\/lib\/mapLookTiers";/);
  assert.match(
    preview,
    /frameEnabled: resolveTextFitFrameEnabled\("preview", baseRecipe\?\.renderOptions\),/,
  );
  // The pre-fix overlay expression (frame switch only, no mat term) is gone.
  assert.ok(!preview.includes("baseRecipe?.renderOptions?.frameEnabled ?? true"));
});
