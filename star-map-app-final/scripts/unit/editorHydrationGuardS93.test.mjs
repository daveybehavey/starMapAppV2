import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// S93-2 class 5 — delayed hydration overwriting in-flight edits.
//
// S93-2 constructed the interleaving from source: the hydration
// effect set mapFromUrlHandledRef before the fetch, captured no
// editor generation, registered no cleanup, and applied the
// response whenever it arrived — applyHydratedMapRecipe then
// overwrote every field, so edits made during a slow fetch were
// silently reverted. The fix gates application on
// shouldApplyHydratedMapRecipe: not cancelled, same map id, and
// an unchanged edit generation. These tests pin the guard's truth
// table and the component wiring that feeds it. No render output
// is involved in this class: the render test files are untouched
// by it and keep passing unchanged.

const { shouldApplyHydratedMapRecipe } = await import(
  "../../src/lib/editorHydrationGuard.ts"
);

const read = (rel) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

const base = {
  cancelled: false,
  requestedMapId: "map-1",
  currentMapId: "map-1",
  editGenerationAtFetchStart: 3,
  editGenerationNow: 3,
};

test("guard: an untouched editor with a matching id applies hydration", () => {
  assert.equal(shouldApplyHydratedMapRecipe(base), true);
});

test("guard: any intervening edit defeats hydration (the proven race)", () => {
  assert.equal(
    shouldApplyHydratedMapRecipe({ ...base, editGenerationNow: 4 }),
    false,
    "one edit during the fetch is enough",
  );
  assert.equal(
    shouldApplyHydratedMapRecipe({ ...base, editGenerationNow: 30 }),
    false,
  );
});

test("guard: cleanup (unmount or dependency change) defeats hydration", () => {
  assert.equal(shouldApplyHydratedMapRecipe({ ...base, cancelled: true }), false);
});

test("guard: a response for a map the URL no longer names is refused", () => {
  assert.equal(
    shouldApplyHydratedMapRecipe({ ...base, currentMapId: "map-2" }),
    false,
  );
  assert.equal(
    shouldApplyHydratedMapRecipe({ ...base, requestedMapId: null }),
    false,
  );
  assert.equal(
    shouldApplyHydratedMapRecipe({ ...base, currentMapId: null }),
    false,
  );
});

test("wiring: the effect captures the generation, cleans up, and checks before applying", () => {
  const src = read("src/components/EditorExperience.tsx");
  // Generation + mirror refs exist.
  assert.match(src, /const editGenerationRef = useRef\(0\);/);
  assert.match(src, /const mapIdFromQueryRef = useRef\(mapIdFromQuery\);/);
  // The generation bumps on every recipe-field change — the same
  // field set hydration would overwrite.
  assert.match(
    src,
    /editGenerationRef\.current \+= 1;\s*\}, \[dateTime, location, textBoxes, selectedStyle, aspectRatio, shape, renderOptions, selectedOccasion\]\);/,
  );
  // Fetch-start capture and cleanup.
  assert.match(src, /const generationAtFetchStart = editGenerationRef\.current;/);
  assert.match(src, /return \(\) => \{\s*cancelled = true;\s*\};/);
  // The guard is consulted before applyHydratedMapRecipe runs.
  const guardAt = src.indexOf("shouldApplyHydratedMapRecipe({");
  const applyAt = src.indexOf("applyHydratedMapRecipe(data);");
  assert.ok(guardAt !== -1 && applyAt !== -1 && guardAt < applyAt);
});
