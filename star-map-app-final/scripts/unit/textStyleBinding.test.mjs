/**
 * Issue #408 regression coverage: text-style ownership bindings.
 *
 * Defect: "Add line" created text in playfair/#0c1021 (near-black) on every
 * template — invisible on dark templates — and applyStyleDefaults then
 * overwrote EVERY box's font/colour on any style change, including colours
 * and fonts the user had deliberately picked.
 *
 * Fix (SQ-66 design): every TextBox carries an optional textStyleBinding
 * marking colour and fontFamily independently "automatic" (follows style
 * defaults / tier typography) or "explicit" (authored; automatic layers
 * must not touch it). Missing/malformed provenance resolves to explicit,
 * so legacy saved designs are never silently recoloured.
 *
 * These tests exercise the REAL modules (store, styleDefaults,
 * mapLookTiers, editorDraft, textStyleBinding) through the tsAliasLoader —
 * no mirrors. Component wiring that cannot run under plain Node (JSX
 * handlers) is pinned at the source level at the bottom of this file.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  AUTOMATIC_TEXT_STYLE_BINDING,
  EXPLICIT_TEXT_STYLE_BINDING,
  cloneTextBoxWithExplicitBinding,
  cloneTextBoxWithNormalizedBinding,
  normalizeTextStyleBinding,
} = await import("../../src/lib/textStyleBinding.ts");
const { useStore } = await import("../../src/lib/store.ts");
const { applyStyleDefaults, getStyleTextDefaults } = await import(
  "../../src/lib/styleDefaults.ts"
);
const {
  applyTierTypography,
  applyTierTypographyProtected,
  buildMapLookSnapshotState,
} = await import("../../src/lib/mapLookTiers.ts");
const { parseEditorDraft, writeEditorDraft } = await import(
  "../../src/lib/editorDraft.ts"
);

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

const AUTO = { color: "automatic", fontFamily: "automatic" };
const EXPLICIT = { color: "explicit", fontFamily: "explicit" };

const baseBox = (overrides = {}) => ({
  id: "custom-1",
  label: "Line 1",
  text: "Hello",
  fontFamily: "playfair",
  color: "#0c1021",
  size: 28,
  align: "center",
  position: { x: 0.5, y: 0.5 },
  ...overrides,
});

const knownBoxes = () => [
  {
    id: "title",
    label: "Title",
    text: "Our Night Sky",
    fontFamily: "cinzel",
    color: "#d7b56c",
    size: 48,
    align: "center",
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: 0.12 },
    textStyleBinding: { ...AUTO },
  },
  {
    id: "subtitle",
    label: "Subtitle",
    text: "Under the vintage stars",
    fontFamily: "raleway",
    color: "#c8a662",
    size: 28,
    align: "center",
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: 0.18 },
    textStyleBinding: { ...AUTO },
  },
  {
    id: "dedication",
    label: "Dedication",
    text: "Celebrating our constellation of moments.",
    fontFamily: "script",
    color: "#b98a3d",
    size: 26,
    align: "center",
    textShadow: false,
    textGlow: false,
    position: { x: 0.5, y: 0.9 },
    textStyleBinding: { ...AUTO },
  },
];

const setStore = (partial) => useStore.setState(partial);
const storeBoxes = () => useStore.getState().textBoxes;

/* ------------------------------------------------------------------ */
/* Binding normalization rules                                         */
/* ------------------------------------------------------------------ */

test("normalizeTextStyleBinding: only literal 'automatic' grants automatic, per property", () => {
  assert.deepEqual(normalizeTextStyleBinding({ color: "automatic", fontFamily: "automatic" }), AUTO);
  assert.deepEqual(normalizeTextStyleBinding({ color: "automatic", fontFamily: "invalid" }), {
    color: "automatic",
    fontFamily: "explicit",
  });
  assert.deepEqual(normalizeTextStyleBinding({ color: "invalid", fontFamily: "automatic" }), {
    color: "explicit",
    fontFamily: "automatic",
  });
  assert.deepEqual(normalizeTextStyleBinding({ color: "explicit", fontFamily: "explicit" }), EXPLICIT);
});

test("normalizeTextStyleBinding: missing or malformed resolves explicit/explicit, fresh object", () => {
  for (const bad of [undefined, null, "automatic", 42, [], {}, { color: 1 }, { fontFamily: null }]) {
    assert.deepEqual(normalizeTextStyleBinding(bad), EXPLICIT, `input ${JSON.stringify(bad)}`);
  }
  const input = { color: "automatic", fontFamily: "automatic" };
  const out = normalizeTextStyleBinding(input);
  assert.notEqual(out, input);
  out.color = "explicit";
  assert.equal(input.color, "automatic", "result must not alias the input");
  assert.deepEqual(AUTOMATIC_TEXT_STYLE_BINDING, AUTO);
  assert.deepEqual(EXPLICIT_TEXT_STYLE_BINDING, EXPLICIT);
});

test("clone helpers: normalize or pin explicit without changing typography", () => {
  const box = baseBox({ textStyleBinding: { color: "automatic", fontFamily: "bogus" } });
  const normalized = cloneTextBoxWithNormalizedBinding(box);
  assert.deepEqual(normalized.textStyleBinding, { color: "automatic", fontFamily: "explicit" });
  assert.equal(normalized.color, box.color);
  assert.equal(normalized.fontFamily, box.fontFamily);
  const pinned = cloneTextBoxWithExplicitBinding(box);
  assert.deepEqual(pinned.textStyleBinding, EXPLICIT);
  assert.equal(pinned.color, box.color);
});

/* ------------------------------------------------------------------ */
/* Store: initial boxes, creation, updates, replacement                */
/* ------------------------------------------------------------------ */

test("store initial boxes: automatic bindings, authored values retained", () => {
  const boxes = storeBoxes();
  const byId = Object.fromEntries(boxes.map((b) => [b.id, b]));
  assert.deepEqual(byId.title.textStyleBinding, AUTO);
  assert.deepEqual(byId.subtitle.textStyleBinding, AUTO);
  assert.deepEqual(byId.dedication.textStyleBinding, AUTO);
  assert.equal(byId.subtitle.fontFamily, "raleway");
  assert.equal(byId.subtitle.color, "#c8a662");
  assert.equal(byId.dedication.fontFamily, "script");
  assert.equal(byId.dedication.color, "#b98a3d");
});

const CREATION_TABLE = {
  navyGold: { color: "#d7b56c", fontFamily: "cinzel" },
  midnightMinimal: { color: "#e0e0e0", fontFamily: "montserrat" },
  vintageEngraving: { color: "#d6d0c4", fontFamily: "ebGaramond" },
  parchmentScroll: { color: "#3f2f1f", fontFamily: "libreBaskerville" },
};

test("addTextBox: new line takes the selected template's colour/font with automatic binding", () => {
  for (const [style, expected] of Object.entries(CREATION_TABLE)) {
    setStore({ selectedStyle: style, textBoxes: knownBoxes() });
    useStore.getState().addTextBox();
    const added = storeBoxes().at(-1);
    assert.equal(added.color, expected.color, `${style} colour`);
    assert.equal(added.fontFamily, expected.fontFamily, `${style} font`);
    assert.deepEqual(added.textStyleBinding, AUTO, `${style} binding`);
    assert.match(added.id, /^custom-/);
  }
});

test("getStyleTextDefaults: template values, fresh object, playfair/#0c1021 fallback", () => {
  assert.deepEqual(getStyleTextDefaults("parchmentScroll"), {
    fontFamily: "libreBaskerville",
    color: "#3f2f1f",
  });
  const first = getStyleTextDefaults("navyGold");
  first.color = "#000000";
  assert.equal(getStyleTextDefaults("navyGold").color, "#d7b56c", "must return a fresh object");
  assert.deepEqual(getStyleTextDefaults("no-such-style"), {
    fontFamily: "playfair",
    color: "#0c1021",
  });
});

test("updateTextBox: colour/font payloads mark that property explicit (own-property presence)", () => {
  setStore({ selectedStyle: "navyGold", textBoxes: knownBoxes() });
  useStore.getState().updateTextBox("title", { color: "#ff3366" });
  let title = storeBoxes().find((b) => b.id === "title");
  assert.equal(title.color, "#ff3366");
  assert.deepEqual(title.textStyleBinding, { color: "explicit", fontFamily: "automatic" });

  useStore.getState().updateTextBox("title", { fontFamily: "playfair" });
  title = storeBoxes().find((b) => b.id === "title");
  assert.deepEqual(title.textStyleBinding, EXPLICIT);
});

test("updateTextBox: same-value edit still marks explicit; payload cannot smuggle a binding", () => {
  setStore({ selectedStyle: "navyGold", textBoxes: knownBoxes() });
  const current = storeBoxes().find((b) => b.id === "subtitle");
  useStore.getState().updateTextBox("subtitle", {
    color: current.color,
    textStyleBinding: { color: "automatic", fontFamily: "automatic" },
  });
  const subtitle = storeBoxes().find((b) => b.id === "subtitle");
  assert.equal(subtitle.textStyleBinding.color, "explicit", "same-value edit must mark explicit");
  assert.equal(subtitle.textStyleBinding.fontFamily, "automatic", "payload binding must be ignored");
});

test("updateTextBox: non-typography payloads (incl. automated position clamp) preserve ownership", () => {
  setStore({ selectedStyle: "navyGold", textBoxes: knownBoxes() });
  useStore.getState().updateTextBox("title", { position: { x: 0.4, y: 0.2 } });
  useStore.getState().updateTextBox("title", { size: 33 });
  const title = storeBoxes().find((b) => b.id === "title");
  assert.deepEqual(title.textStyleBinding, AUTO);
  assert.equal(title.size, 33);
});

test("setTextBoxes: bindings normalized per box, never merged from existing boxes by ID", () => {
  setStore({ selectedStyle: "navyGold", textBoxes: knownBoxes() }); // title is automatic in store
  const legacyTitle = { ...knownBoxes()[0] };
  delete legacyTitle.textStyleBinding;
  setStore({ textBoxes: [] });
  useStore.getState().setTextBoxes([legacyTitle]);
  const [title] = storeBoxes();
  assert.deepEqual(title.textStyleBinding, EXPLICIT, "missing provenance must not borrow the old box's binding");
  assert.equal(title.color, "#d7b56c", "authored values preserved");

  const autoBox = baseBox({ textStyleBinding: { color: "automatic", fontFamily: "bogus" } });
  useStore.getState().setTextBoxes([autoBox]);
  assert.deepEqual(storeBoxes()[0].textStyleBinding, {
    color: "automatic",
    fontFamily: "explicit",
  });
});

test("setTextBoxes: re-added subtitle prefix (cormorant/#d7b56c, no binding) resolves explicit", () => {
  setStore({ selectedStyle: "navyGold", textBoxes: knownBoxes().filter((b) => b.id !== "subtitle") });
  useStore.getState().setTextBoxes([
    ...storeBoxes(),
    {
      id: "subtitle",
      label: "Subtitle",
      text: "",
      fontFamily: "cormorant",
      color: "#d7b56c",
      size: 14,
      align: "center",
      position: { x: 0.5, y: 0.88 },
    },
  ]);
  const subtitle = storeBoxes().find((b) => b.id === "subtitle");
  assert.deepEqual(subtitle.textStyleBinding, EXPLICIT);
});

/* ------------------------------------------------------------------ */
/* Style defaults: ownership-aware application                         */
/* ------------------------------------------------------------------ */

test("applyStyleDefaults: automatic properties follow the template, explicit ones survive", () => {
  const mixed = baseBox({
    color: "#ff3366",
    fontFamily: "playfair",
    textStyleBinding: { color: "explicit", fontFamily: "automatic" },
  });
  const { textBoxes: out } = applyStyleDefaults("midnightMinimal", [mixed]);
  assert.equal(out[0].color, "#ff3366", "explicit colour survives");
  assert.equal(out[0].fontFamily, "montserrat", "automatic font follows template");
  assert.deepEqual(out[0].textStyleBinding, { color: "explicit", fontFamily: "automatic" });

  const legacy = baseBox(); // no binding at all
  const legacyOut = applyStyleDefaults("navyGold", [legacy]).textBoxes;
  assert.equal(legacyOut[0].color, "#0c1021", "legacy box is never silently recoloured");
  assert.equal(legacyOut[0].fontFamily, "playfair");
});

test("applyStyleDefaults: a fresh automatic line follows every template switch", () => {
  let boxes = [baseBox({ color: "#d7b56c", fontFamily: "cinzel", textStyleBinding: { ...AUTO } })];
  for (const [style, expected] of Object.entries(CREATION_TABLE)) {
    boxes = applyStyleDefaults(style, boxes).textBoxes;
    assert.equal(boxes[0].color, expected.color, style);
    assert.equal(boxes[0].fontFamily, expected.fontFamily, style);
  }
});

/* ------------------------------------------------------------------ */
/* Tier typography: protective wrapper + acceptance matrix             */
/* ------------------------------------------------------------------ */

// font / colour per known ID, transcribed from the SQ-66 acceptance matrix.
const TIER_TABLE = {
  minimal: {
    navyGold: {
      title: ["bebasNeue", "#e4dcc8"],
      subtitle: ["montserrat", "#a89878"],
      dedication: ["montserrat", "#8a7a62"],
    },
    midnightMinimal: {
      title: ["montserrat", "#eef2ff"],
      subtitle: ["raleway", "#9fb3d2"],
      dedication: ["raleway", "#7a8ea8"],
    },
    vintageEngraving: {
      title: ["ebGaramond", "#e8e2d8"],
      subtitle: ["crimsonText", "#b8b0a4"],
      dedication: ["crimsonText", "#9a9288"],
    },
    parchmentScroll: {
      title: ["libreBaskerville", "#3f2f1f"],
      subtitle: ["lora", "#5a4a38"],
      dedication: ["lora", "#6a5a48"],
    },
  },
  polished: {
    navyGold: {
      title: ["cinzel", "#d7b56c"],
      subtitle: ["cormorant", "#c8a662"],
      dedication: ["script", "#b98a3d"],
    },
    midnightMinimal: {
      title: ["montserrat", "#e0e0e0"],
      subtitle: ["raleway", "#9fb3d2"],
      dedication: ["script", "#7a8ea8"],
    },
    vintageEngraving: {
      title: ["ebGaramond", "#d6d0c4"],
      subtitle: ["crimsonText", "#b8b0a4"],
      dedication: ["dancingScript", "#a89888"],
    },
    parchmentScroll: {
      title: ["libreBaskerville", "#3f2f1f"],
      subtitle: ["lora", "#5a4a38"],
      dedication: ["parisienne", "#6a5a48"],
    },
  },
};

test("protective wrapper: automatic known IDs match the tier x template acceptance matrix", () => {
  for (const [tier, byStyle] of Object.entries(TIER_TABLE)) {
    for (const [style, expected] of Object.entries(byStyle)) {
      const out = applyTierTypographyProtected(tier, style, knownBoxes());
      for (const [id, [fontFamily, color]] of Object.entries(expected)) {
        const box = out.find((b) => b.id === id);
        assert.equal(box.fontFamily, fontFamily, `${tier}/${style}/${id} font`);
        assert.equal(box.color, color, `${tier}/${style}/${id} colour`);
        assert.deepEqual(box.textStyleBinding, AUTO, `${tier}/${style}/${id} binding preserved`);
      }
    }
  }
});

test("protective wrapper: custom tier is an identity operation", () => {
  const boxes = knownBoxes();
  assert.equal(applyTierTypographyProtected("custom", "navyGold", boxes), boxes);
});

test("protective wrapper: explicit colour/font restored, other tier effects retained", () => {
  const boxes = knownBoxes();
  boxes[0] = {
    ...boxes[0],
    fontFamily: "playfair",
    color: "#ff3366",
    textStyleBinding: { ...EXPLICIT },
  };
  const out = applyTierTypographyProtected("polished", "navyGold", boxes);
  const title = out.find((b) => b.id === "title");
  assert.equal(title.fontFamily, "playfair");
  assert.equal(title.color, "#ff3366");
  // Non-typography tier patches still apply (SQ-66 worked example).
  assert.equal(title.size, 52);
  assert.equal(title.fontWeight, 600);
  assert.deepEqual(title.position, { x: 0.5, y: 0.12 });
  assert.equal(title.textGlow, true);
  assert.equal(title.textShadow, false);
  // Automatic siblings still take the tier table.
  const subtitle = out.find((b) => b.id === "subtitle");
  assert.equal(subtitle.fontFamily, "cormorant");
  assert.equal(subtitle.color, "#c8a662");
});

test("protective wrapper: custom-* lines are never tier-patched, under any tier", () => {
  const custom = baseBox({
    id: "custom-123",
    color: "#d7b56c",
    fontFamily: "cinzel",
    textStyleBinding: { ...AUTO },
  });
  for (const tier of ["minimal", "polished"]) {
    const out = applyTierTypographyProtected(tier, "navyGold", [custom]);
    assert.equal(out[0].fontFamily, "cinzel", tier);
    assert.equal(out[0].color, "#d7b56c", tier);
    assert.equal(out[0].id, "custom-123");
  }
});

test("snapshot builder: fixture typography unchanged (fixtures are deliberately automatic)", () => {
  for (const tier of ["minimal", "polished"]) {
    for (const style of Object.keys(CREATION_TABLE)) {
      const snapshot = buildMapLookSnapshotState(tier, style);
      const raw = applyTierTypography(
        tier,
        style,
        snapshot.textBoxes.map((b) => {
          const copy = { ...b };
          delete copy.textStyleBinding;
          return copy;
        })
      );
      // Recompute from the pristine fixture values: tier output on the
      // snapshot boxes must equal the pre-change raw transformation.
      const expected = TIER_TABLE[tier][style];
      for (const [id, [fontFamily, color]] of Object.entries(expected)) {
        const box = snapshot.textBoxes.find((b) => b.id === id);
        assert.equal(box.fontFamily, fontFamily, `${tier}/${style}/${id}`);
        assert.equal(box.color, color, `${tier}/${style}/${id}`);
      }
      assert.ok(raw.length === snapshot.textBoxes.length);
    }
  }
});

test("deliberate edits survive style switches, tier clicks and resets (composed pipeline)", () => {
  // Mirrors the EditorExperience/MobileCreate handler composition:
  // style defaults -> protective tier wrapper for non-custom tiers.
  let boxes = knownBoxes();
  boxes[0] = { ...boxes[0], color: "#ff3366", textStyleBinding: { color: "explicit", fontFamily: "automatic" } };
  const pipeline = (style, tier) => {
    const defaults = applyStyleDefaults(style, boxes).textBoxes;
    boxes = tier === "custom" ? defaults : applyTierTypographyProtected(tier, style, defaults);
  };
  pipeline("midnightMinimal", "minimal");
  pipeline("vintageEngraving", "polished");
  boxes = applyTierTypographyProtected("minimal", "vintageEngraving", boxes); // reset-style reapply
  const title = boxes.find((b) => b.id === "title");
  assert.equal(title.color, "#ff3366", "explicit colour survives everything");
  assert.equal(title.fontFamily, "ebGaramond", "automatic font follows the last tier table");
});

/* ------------------------------------------------------------------ */
/* Tier pin (bundled pre-existing bug): custom tier survives switches  */
/* ------------------------------------------------------------------ */

test("tier pin: merged style options keep mapLookTier 'custom' across repeated switches", () => {
  // Mirrors the fixed EditorExperience/MobileCreate merge:
  //   { ...defaults.renderOptions, ...tierOptions, mapLookTier: tier }
  // with tierOptions = {} for custom. Before the pin, template defaults
  // (navyGold -> polished, midnightMinimal -> minimal) overwrote the tier.
  setStore({ selectedStyle: "navyGold", textBoxes: knownBoxes(), renderOptions: { ...useStore.getState().renderOptions, mapLookTier: "custom" } });
  for (const style of ["navyGold", "midnightMinimal", "vintageEngraving"]) {
    const defaults = applyStyleDefaults(style, storeBoxes());
    const tierOptions = {}; // custom tier contributes no options
    const mergedOptions = { ...defaults.renderOptions, ...tierOptions, mapLookTier: "custom" };
    useStore.getState().setRenderOptions(mergedOptions);
    assert.equal(
      useStore.getState().renderOptions.mapLookTier,
      "custom",
      `after switching to ${style}`
    );
  }
});

/* ------------------------------------------------------------------ */
/* Draft serialization round trips (schema stays v1)                   */
/* ------------------------------------------------------------------ */

const draftData = (textBoxes) => ({
  version: 1,
  seed: "binding-test",
  datetimeISO: "2024-06-15T20:30:00.000Z",
  location: { name: "Paris, France", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris" },
  textBoxes,
  selectedStyle: "navyGold",
  aspectRatio: "square",
  shape: "rectangle",
  renderOptions: { mapLookTier: "polished" },
  selectedOccasion: null,
  sampleDesignLastAutoSynced: { subtitle: null, dedication: null },
  dateTimeIsUntouchedDefault: false,
});

test("editorDraft round trip: bindings survive write/parse independently; schema stays v1", () => {
  const boxes = knownBoxes();
  boxes[1] = { ...boxes[1], textStyleBinding: { ...EXPLICIT } };
  const storage = new Map();
  const fakeStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
  };
  const outcome = writeEditorDraft(fakeStorage, draftData(boxes));
  assert.equal(outcome.status, "saved");
  assert.equal(outcome.envelope.schemaVersion, 1);
  const raw = JSON.parse(storage.get("star-map-draft"));
  assert.deepEqual(raw.textBoxes[0].textStyleBinding, AUTO);
  assert.deepEqual(raw.textBoxes[1].textStyleBinding, EXPLICIT);

  const parsed = parseEditorDraft(storage.get("star-map-draft"));
  assert.equal(parsed.status, "restored");
  assert.deepEqual(parsed.data.textBoxes[0].textStyleBinding, AUTO);
  assert.deepEqual(parsed.data.textBoxes[1].textStyleBinding, EXPLICIT);
  assert.deepEqual(parsed.data.textBoxes[2].textStyleBinding, AUTO);
});

test("editorDraft: legacy drafts (no binding) load explicit with authored values intact", () => {
  const legacy = draftData(knownBoxes().map((b) => {
    const copy = { ...b, color: "#123456" };
    delete copy.textStyleBinding;
    return copy;
  }));
  const parsed = parseEditorDraft(JSON.stringify({ ...legacy, schemaVersion: 1, savedAt: "2024-06-15T20:30:00.000Z" }));
  assert.equal(parsed.status, "restored");
  for (const box of parsed.data.textBoxes) {
    assert.deepEqual(box.textStyleBinding, EXPLICIT);
    assert.equal(box.color, "#123456", "values equal to nothing in particular are still preserved");
  }
});

test("editorDraft: malformed binding normalizes per property", () => {
  const data = draftData([
    { ...knownBoxes()[0], textStyleBinding: { color: "automatic", fontFamily: "invalid" } },
    { ...knownBoxes()[1], textStyleBinding: "automatic" },
  ]);
  const parsed = parseEditorDraft(JSON.stringify(data));
  assert.equal(parsed.status, "restored");
  assert.deepEqual(parsed.data.textBoxes[0].textStyleBinding, {
    color: "automatic",
    fontFamily: "explicit",
  });
  assert.deepEqual(parsed.data.textBoxes[1].textStyleBinding, EXPLICIT);
});

test("SimplifiedEditor save round trip: raw JSON of textBoxes -> setTextBoxes keeps ownership", () => {
  // SimplifiedEditor's save effect stringifies the store's textBoxes raw
  // (its own key) and its load path feeds the parsed array back through
  // setTextBoxes. This reproduces that exact surface against the real store.
  setStore({ selectedStyle: "navyGold", textBoxes: knownBoxes() });
  useStore.getState().updateTextBox("dedication", { color: "#ff3366" });
  const saved = JSON.stringify({ textBoxes: storeBoxes() });
  const restored = JSON.parse(saved);
  setStore({ textBoxes: [] });
  useStore.getState().setTextBoxes(restored.textBoxes);
  const byId = Object.fromEntries(storeBoxes().map((b) => [b.id, b]));
  assert.deepEqual(byId.title.textStyleBinding, AUTO);
  assert.deepEqual(byId.dedication.textStyleBinding, {
    color: "explicit",
    fontFamily: "automatic",
  });
  assert.equal(byId.dedication.color, "#ff3366");
});

/* ------------------------------------------------------------------ */
/* Preset paths: authored typography is explicit                       */
/* ------------------------------------------------------------------ */

test("preset clones: typography pinned explicit, so style defaults cannot recolour them", () => {
  const presetBox = baseBox({ fontFamily: "cormorant", color: "#abcdef" });
  const [clone] = [cloneTextBoxWithExplicitBinding(presetBox)];
  const after = applyStyleDefaults("midnightMinimal", [clone]).textBoxes[0];
  assert.equal(after.color, "#abcdef");
  assert.equal(after.fontFamily, "cormorant");
  const afterTier = applyTierTypographyProtected("polished", "midnightMinimal", [
    { ...clone, id: "title" },
  ])[0];
  assert.equal(afterTier.color, "#abcdef");
  assert.equal(afterTier.fontFamily, "cormorant");
});

/* ------------------------------------------------------------------ */
/* Source pins: component wiring that plain Node cannot execute        */
/* ------------------------------------------------------------------ */

test("source pins: tier call sites use the protective wrapper, never the raw transform", () => {
  const rawCall = /(?<![\w])applyTierTypography\(/;
  for (const rel of [
    "src/components/EditorExperience.tsx",
    "src/app/MobileCreate.tsx",
    "src/components/AdvancedPanel.tsx",
  ]) {
    const src = read(rel);
    assert.ok(!rawCall.test(src), `${rel} still calls raw applyTierTypography`);
    assert.ok(src.includes("applyTierTypographyProtected("), `${rel} must use the wrapper`);
  }
});

test("source pins: style handlers pin mapLookTier in the merged options (both tier surfaces)", () => {
  for (const rel of ["src/components/EditorExperience.tsx", "src/app/MobileCreate.tsx"]) {
    const src = read(rel);
    assert.ok(src.includes("mapLookTier: tier"), `${rel} must pin mapLookTier: tier`);
  }
});

test("source pins: SimplifiedEditor font/colour controls go through updateTextBox", () => {
  const panel = read("src/components/SimplifiedEditor/AdvancedOptionsPanel.tsx");
  assert.ok(panel.includes("updateTextBox"), "panel must take an updateTextBox prop");
  assert.ok(
    /updateTextBox\(boxId, \{ fontFamily \}\)/.test(panel),
    "font handler must call the user-edit boundary"
  );
  assert.ok(
    /updateTextBox\(boxId, \{ color \}\)/.test(panel),
    "colour handler must call the user-edit boundary"
  );
  const editor = read("src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.ok(editor.includes("updateTextBox={updateTextBox}"), "editor must pass updateTextBox down");
});

test("source pins: preset paths mark clones explicit before resolution/commit", () => {
  const hook = read("src/hooks/useEditorLogic.ts");
  const occurrences = hook.split("cloneTextBoxWithExplicitBinding").length - 1;
  assert.ok(occurrences >= 2, "both applyPreset and applyProPreset must mark preset clones explicit");
});
