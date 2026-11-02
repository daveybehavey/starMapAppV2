/**
 * PROD-SM W1-2 (issue #481) — font weight control per text row.
 *
 * TextBox.fontWeight has always been consumed by the renderer
 * (renderSky drawText: `box.fontWeight ?? 600`) and set by tier
 * typography, but neither editor surface offered a weight control —
 * buyers could change font/size/colour but not make a title lighter
 * or bolder. This change is UI wiring only: a Weight control in the
 * desktop text-styling card (EditorExperience) and the mobile editor
 * (MobileCreate), both writing the existing field via updateTextBox.
 *
 * Pins:
 * - Both surfaces offer exactly the weights 400/500/600/700 with the
 *   labels Regular/Medium/Semi-bold/Bold.
 * - The unset state displays as 600 on both surfaces, matching the
 *   renderer's `?? 600` default (the control can never show a weight
 *   the renderer would not use).
 * - The recipe builder carries a box's fontWeight through verbatim
 *   and leaves an unset weight unset (no silent defaulting upstream
 *   of the renderer).
 * - The store's user-edit boundary marks a fontWeight payload as
 *   explicit ownership, so a buyer-set weight is restored by
 *   applyTierTypographyProtected instead of being overwritten by the
 *   next tier change (Codex P2 on the gate).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { buildRecipeFromState } = await import("../../src/lib/renderSky.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const editor = read("../../src/components/EditorExperience.tsx");
const mobile = read("../../src/app/MobileCreate.tsx");
const renderSky = read("../../src/lib/renderSky.ts");
const store = read("../../src/lib/store.ts");
const mapsRoute = read("../../src/app/api/maps/route.ts");

test("renderer default weight is 600 when a box carries none", () => {
  assert.match(renderSky, /box\.fontWeight \?\? 600/);
});

test("desktop editor offers the four weights via updateTextBox", () => {
  assert.match(editor, /updateTextBox\(box\.id, \{\s*fontWeight: option\.value,?\s*\}\)/);
  for (const [value, label] of [
    [400, "Regular"],
    [500, "Medium"],
    [600, "Semi-bold"],
    [700, "Bold"],
  ]) {
    assert.match(
      editor,
      new RegExp(`\\{ value: ${value}, label: "${label}" \\}`),
      `desktop weight option ${value}/${label}`,
    );
  }
  // Unset weight displays as the renderer default.
  assert.match(editor, /box\.fontWeight \?\? 600/);
});

test("mobile editor offers the same four weights (parity)", () => {
  assert.match(mobile, /id=\{`weight-select-\$\{box\.id\}`\}/);
  assert.match(mobile, /updateTextBox\(box\.id, \{ fontWeight: Number\(e\.target\.value\) \}\)/);
  for (const [value, label] of [
    [400, "Regular"],
    [500, "Medium"],
    [600, "Semi-bold"],
    [700, "Bold"],
  ]) {
    assert.match(mobile, new RegExp(`<option value=\\{${value}\\}>${label}</option>`), `mobile weight option ${value}/${label}`);
  }
  assert.match(mobile, /box\.fontWeight \?\? 600/);
});

test("recipe builder carries fontWeight verbatim, unset stays unset", () => {
  const base = {
    dateTime: "2026-11-02T21:00:00.000Z",
    location: { name: "Victoria", latitude: 48.4, longitude: -123.4, timezone: "UTC" },
    selectedStyle: "navyGold",
  };
  const box = {
    id: "title",
    label: "Title",
    text: "Our Night",
    fontFamily: "cinzel",
    color: "#ffffff",
    size: 40,
    align: "center",
  };

  const weighted = buildRecipeFromState({ ...base, textBoxes: [{ ...box, fontWeight: 400 }] });
  assert.equal(weighted.textBoxes[0].fontWeight, 400);

  const unweighted = buildRecipeFromState({ ...base, textBoxes: [box] });
  assert.equal(unweighted.textBoxes[0].fontWeight, undefined);
});

test("store marks a fontWeight edit as explicit ownership (tier protection)", () => {
  assert.match(store, /hasOwnProperty\.call\(payload, "fontWeight"\)/);
  assert.match(store, /binding\.fontWeight = "explicit"/);
});

test("saved-map API sanitizer validates and retains fontWeight", () => {
  assert.match(mapsRoute, /typeof box\.fontWeight === "number" && Number\.isFinite\(box\.fontWeight\)/);
  assert.match(mapsRoute, /\n    fontWeight,\n/);
});
