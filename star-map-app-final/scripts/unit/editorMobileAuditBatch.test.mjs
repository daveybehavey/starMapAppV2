/**
 * Editor/mobile audit batch — fixes from the Astra audits #516 (PR #524)
 * and #518 (PR #526), triaged in QUEUE.md:
 *
 * (a) E5+M2+M4 — shared tier semantics. The desktop AdvancedPanel forced
 *     mapLookTier:"custom" over a Quick Look handler's explicit tier, and
 *     mobile render-option writes left the tier untouched, so the same
 *     edit resolved to different tiers per surface. Both surfaces now use
 *     the one AdvancedPanel, whose edits go through withUserEditTier:
 *     explicit tier wins, otherwise the edit marks the look "custom".
 * (b) M1 — mobile mounts the shared AdvancedPanel (the nine controls it
 *     lacked: grid, ring, starIntensity, starGlow, showPlanets,
 *     planetEmphasis, planetLabels, showMoon, moonSize — plus Quick Look).
 * (c) E1 — text size clamps to the UI range 10–64 in the numeric inputs
 *     and at draft restore (restore was 10–200).
 * (d) E4 — text inputs carry maxLength at the saved-map API's 240-char
 *     limit, with the limit surfaced in the UI (no more silent truncation).
 * (e) E2/M3 + E3 — desktop Font/Color/Align labels are associated with
 *     their controls; the panel's generic "On/Off" toggles carry specific
 *     accessible names + aria-pressed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

register("./tsAliasLoader.mjs", import.meta.url);

const { withUserEditTier } = await import("../../src/lib/mapLookTiers.ts");
const { clampTextBoxSize, TEXT_BOX_MAX_SIZE, TEXT_BOX_MIN_SIZE, TEXT_BOX_MAX_TEXT_LENGTH } =
  await import("../../src/lib/textBoxConstraints.ts");
const { normalizeEditorDraftData } = await import("../../src/lib/editorDraft.ts");
const { DEFAULT_RECIPE } = await import("../../src/lib/renderSky.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const panel = read("../../src/components/AdvancedPanel.tsx");
const desktop = read("../../src/components/EditorExperience.tsx");
const mobile = read("../../src/app/MobileCreate.tsx");

// ─── (a) tier semantics ─────────────────────────────────────────────────────

test("withUserEditTier preserves an explicit tier (Quick Look)", () => {
  assert.deepEqual(withUserEditTier({ mapLookTier: "minimal", visualMode: "astronomical" }), {
    mapLookTier: "minimal",
    visualMode: "astronomical",
  });
  assert.deepEqual(withUserEditTier({ mapLookTier: "polished" }), { mapLookTier: "polished" });
});

test("withUserEditTier marks a tier-less user edit custom", () => {
  assert.deepEqual(withUserEditTier({ showGrid: true }), { showGrid: true, mapLookTier: "custom" });
  assert.deepEqual(withUserEditTier({ starGlow: false }), { starGlow: false, mapLookTier: "custom" });
});

test("AdvancedPanel routes edits through withUserEditTier (no forced custom)", () => {
  assert.match(panel, /withUserEditTier\(next\)/);
  assert.doesNotMatch(panel, /\{\s*\.\.\.next,\s*mapLookTier: "custom"\s*\}/);
});

// ─── (b) mobile parity: shared panel mounted, duplicates removed ───────────

test("MobileCreate mounts the shared AdvancedPanel", () => {
  assert.match(mobile, /import\("@\/components\/AdvancedPanel"\)/);
  assert.match(mobile, /<AdvancedPanel/);
});

test("MobileCreate no longer hand-writes the panel's fields (single source)", () => {
  for (const field of [
    "showGrid",
    "showTechnicalRing",
    "starIntensity",
    "starGlow",
    "showPlanets",
    "planetEmphasis",
    "planetLabels",
    "showMoon",
    "moonSize",
    "constellationLines",
    "constellationColor",
    "constellationLineScale",
    "constellationLabels",
    "visualMode",
    "premiumStars",
    "premiumPlanets",
  ]) {
    assert.doesNotMatch(
      mobile,
      new RegExp(`setRenderOptions\\(\\{ ${field}:`),
      `mobile must not write ${field} outside the shared panel`,
    );
  }
});

test("the panel carries all nine previously-missing mobile controls", () => {
  for (const field of [
    "showGrid",
    "showTechnicalRing",
    "starIntensity",
    "starGlow",
    "showPlanets",
    "planetEmphasis",
    "planetLabels",
    "showMoon",
    "moonSize",
  ]) {
    assert.match(panel, new RegExp(field), `panel must expose ${field}`);
  }
  assert.match(panel, /Quick Look/);
});

// ─── (c) size clamp 10–64 everywhere ────────────────────────────────────────

test("clampTextBoxSize enforces the 10–64 UI range", () => {
  assert.equal(TEXT_BOX_MIN_SIZE, 10);
  assert.equal(TEXT_BOX_MAX_SIZE, 64);
  assert.equal(clampTextBoxSize(999), 64);
  assert.equal(clampTextBoxSize(200), 64);
  assert.equal(clampTextBoxSize(5), 10);
  assert.equal(clampTextBoxSize(40), 40);
});

test("draft restore clamps text size to 10–64 (was 10–200)", () => {
  const withSize = (size) => ({
    ...DEFAULT_RECIPE,
    textBoxes: [
      {
        id: "title",
        label: "Title",
        text: "Our Night",
        fontFamily: "cinzel",
        color: "#ffffff",
        size,
        align: "center",
        position: { x: 0.5, y: 0.15 },
      },
    ],
  });
  for (const [input, expected] of [[999, 64], [200, 64], [64, 64], [40, 40], [10, 10], [5, 10]]) {
    const result = normalizeEditorDraftData(withSize(input));
    assert.equal(result.ok, true, `size ${input} draft must normalize`);
    assert.equal(result.value.textBoxes[0].size, expected, `size ${input} -> ${expected}`);
  }
});

test("both surfaces use the shared TextBoxSizeInput for the numeric size field", () => {
  assert.match(desktop, /<TextBoxSizeInput/);
  assert.match(mobile, /<TextBoxSizeInput/);
});

test("size input holds a draft while editing and clamps on commit (gate P2, PR #530)", () => {
  const sizeInput = read("../../src/components/TextBoxSizeInput.tsx");
  // Partial entries stay local: the draft string, not the clamped number,
  // is what the input displays while focused.
  assert.match(sizeInput, /value=\{draft \?\? String\(value\)\}/);
  // In-range values commit live (slider/preview sync)…
  assert.match(sizeInput, /parsed >= 10 && parsed <= 64/);
  // …and out-of-range entries clamp only on blur/commit.
  assert.match(sizeInput, /onBlur=\{commitDraft\}/);
  assert.match(sizeInput, /onCommit\(clampTextBoxSize\(parsed\)\)/);
});

// ─── (d) text length limit surfaced ─────────────────────────────────────────

test("text length limit matches the saved-map API truncation point", () => {
  const route = read("../../src/app/api/maps/route.ts");
  assert.match(route, /MAX_TEXT_LENGTH = 240/);
  assert.equal(TEXT_BOX_MAX_TEXT_LENGTH, 240);
});

test("every text-box text input carries maxLength on both surfaces", () => {
  const count = (src) => (src.match(/maxLength=\{TEXT_BOX_MAX_TEXT_LENGTH\}/g) || []).length;
  assert.equal(count(desktop), 2, "desktop: guided + style-panel text inputs");
  assert.equal(count(mobile), 2, "mobile: guided + editor message inputs");
  assert.match(desktop, /Up to 240 characters per line\./);
  assert.match(mobile, /Up to 240 characters per line\./);
});

// ─── (e) accessibility ──────────────────────────────────────────────────────

test("desktop Font/Color/Align labels are associated with their controls", () => {
  for (const kind of ["font-select", "color-input", "align-select"]) {
    assert.match(desktop, new RegExp(`htmlFor=\\{\`${kind}-\\$\\{box\\.id\\}\`\\}`), `${kind} label`);
    assert.match(desktop, new RegExp(`id=\\{\`${kind}-\\$\\{box\\.id\\}\`\\}`), `${kind} control`);
  }
  assert.match(panel, /htmlFor="advanced-constellation-line-color"/);
  assert.match(panel, /id="advanced-constellation-line-color"/);
});

test("panel toggles expose specific accessible names and pressed state", () => {
  for (const name of [
    "Coordinate grid",
    "Technical ring",
    "Constellation labels",
    "Star glow",
    "Planets",
    "Planet names",
    "Moon",
  ]) {
    assert.match(panel, new RegExp(`aria-label="${name}"`), `toggle name: ${name}`);
  }
  assert.equal((panel.match(/aria-pressed=\{renderOptions\./g) || []).length, 7);
});
