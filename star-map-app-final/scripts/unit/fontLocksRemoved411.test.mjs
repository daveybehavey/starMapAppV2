/**
 * Editor polish #411 — font payment locks removed (David, 2026-10-27:
 * "Yes dont charge extra for the fonts").
 *
 * Every font in the catalogue is selectable by everyone. There is no
 * premium/locked font state in the picker surfaces, and the render path
 * resolves a text box's font purely from FONT_STACKS — it never branched
 * on a font entitlement before this change and must never start.
 *
 * Behavioural checks load src/lib/fonts.ts (type-only imports only);
 * the TSX picker surfaces and the render path are pinned from source,
 * the same style as editorPolish410415.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fontOptions, FONT_STACKS } from "../../src/lib/fonts.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(ROOT, "src", relativePath), "utf8");
}

/* ------------------------- catalogue integrity ------------------------- */

test("fontOptions: exact 15 fonts, original ids, labels and order", () => {
  assert.deepEqual(
    fontOptions.map((o) => [o.id, o.label]),
    [
      ["playfair", "Playfair Display"],
      ["cinzel", "Cinzel"],
      ["script", "Great Vibes"],
      ["cormorant", "Cormorant Garamond"],
      ["montserrat", "Montserrat"],
      ["libreBaskerville", "Libre Baskerville"],
      ["ebGaramond", "EB Garamond"],
      ["crimsonText", "Crimson Text"],
      ["lora", "Lora"],
      ["raleway", "Raleway"],
      ["poppins", "Poppins"],
      ["dancingScript", "Dancing Script"],
      ["parisienne", "Parisienne"],
      ["bebasNeue", "Bebas Neue"],
      ["abrilFatface", "Abril Fatface"],
    ]
  );
});

test("fontOptions: no option carries a premium/locked flag of any kind", () => {
  for (const option of fontOptions) {
    assert.deepEqual(
      Object.keys(option).sort(),
      ["id", "label"],
      `font "${option.id}" must expose only id+label — a reintroduced lock flag fails here`
    );
  }
});

test("the 10 formerly-locked fonts are plain catalogue entries now", () => {
  const formerlyLocked = [
    "libreBaskerville",
    "ebGaramond",
    "crimsonText",
    "lora",
    "raleway",
    "poppins",
    "dancingScript",
    "parisienne",
    "bebasNeue",
    "abrilFatface",
  ];
  for (const id of formerlyLocked) {
    const option = fontOptions.find((o) => o.id === id);
    assert.ok(option, `formerly-locked font "${id}" must still be in the catalogue`);
    assert.equal(option.premium, undefined);
  }
});

test("FONT_STACKS resolves every catalogue font (render path needs no fallback)", () => {
  assert.deepEqual(
    Object.keys(FONT_STACKS).sort(),
    fontOptions.map((o) => o.id).sort()
  );
  for (const option of fontOptions) {
    assert.equal(typeof FONT_STACKS[option.id], "string");
    assert.ok(FONT_STACKS[option.id].length > 0);
  }
});

/* --------------------------- source-level pins -------------------------- */

test("fonts.ts source: no premium property or premium flag type remains", () => {
  const source = readSrc("lib/fonts.ts");
  assert.ok(!/premium\s*:/.test(source), "fonts.ts must not assign a premium property");
  assert.ok(!/premium\?\s*:/.test(source), "fonts.ts type must not declare premium?:");
});

test("FontSelector: no paid prop, no premium callback, no locked rendering", () => {
  const source = readSrc("components/FontSelector.tsx");
  assert.ok(!/\bpaid\b/.test(source), "FontSelector must not take a paid prop");
  assert.ok(!/onPremiumClick/.test(source), "FontSelector must not take onPremiumClick");
  assert.ok(!/premium/.test(source), "FontSelector must not reference premium at all");
  assert.ok(!/isLocked/.test(source), "FontSelector must not compute a locked state");
  assert.ok(!/🔒/.test(source), "FontSelector must not render a lock glyph");
});

test("EditorExperience: font select applies the choice, never opens a font paywall", () => {
  const source = readSrc("components/EditorExperience.tsx");
  assert.ok(!/premium_font/.test(source), "no premium_font paywall reason may remain");
  assert.ok(!/opt\.premium/.test(source), "font options must not be read for a premium flag");
  assert.ok(!/fontMeta/.test(source), "the font paywall gate lookup must be gone");
});

test("MobileCreate: no font block, no font upsell banner, no locked labels", () => {
  const source = readSrc("app/MobileCreate.tsx");
  assert.ok(!/paywall_font_blocked/.test(source), "font selections must not be blocked/tracked as paywalled");
  assert.ok(!/mobile_font_upsell/.test(source), "the font upsell banner and its tracking must be gone");
  assert.ok(!/showFontBanner/.test(source), "font upsell banner state must be gone");
  assert.ok(!/opt\.premium/.test(source), "font options must not be read for a premium flag");
});

test("AdvancedOptionsPanel: FontSelector is invoked without payment props", () => {
  const source = readSrc("components/SimplifiedEditor/AdvancedOptionsPanel.tsx");
  const start = source.indexOf("<FontSelector");
  assert.ok(start >= 0, "AdvancedOptionsPanel must render FontSelector");
  const invocation = source.slice(start, source.indexOf("/>", start));
  assert.ok(!/paid/.test(invocation), "FontSelector must not receive a paid prop");
  assert.ok(!/onPremiumClick/.test(invocation), "FontSelector must not receive onPremiumClick");
});

test("render path: fonts resolve from FONT_STACKS only, no entitlement branch", () => {
  const renderSky = readSrc("lib/renderSky.ts");
  assert.ok(
    renderSky.includes("FONT_STACKS[box.fontFamily]"),
    "renderSky must resolve text fonts via FONT_STACKS[box.fontFamily]"
  );
  assert.ok(!/fontOptions/.test(renderSky), "renderSky must not consult the picker catalogue/entitlements");
  const downloadClient = readSrc("app/download/DownloadClient.tsx");
  assert.ok(
    downloadClient.includes("FONT_STACKS[box.fontFamily"),
    "DownloadClient must resolve text fonts via FONT_STACKS"
  );
  assert.ok(!/fontOptions/.test(downloadClient), "DownloadClient must not consult font entitlements");
});
