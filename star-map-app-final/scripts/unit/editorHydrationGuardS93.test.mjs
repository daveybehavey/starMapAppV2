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

const { shouldApplyHydratedMapRecipe, shouldStartMapHydration } =
  await import("../../src/lib/editorHydrationGuard.ts");

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

// --- Fix round 1 (Codex P1): automatic visual initialization ---
//
// The class-5 wiring above could not tell a user edit apart from
// the editor's own automatic initialization: useEditorLogic's
// ~150 ms mount timer applies visual options, which writes
// renderOptions — bumping the edit generation and re-running the
// hydration effect, whose cleanup cancelled the in-flight fetch.
// A /api/maps response slower than the timer therefore lost its
// own hydration even with NO user edit, and mapFromUrlHandledRef
// blocked any retry: the user kept their previous draft instead
// of the requested map. The fix sequences initialization BEFORE
// hydration: the fetch may only start once the first visual-
// options application has landed, so the generation baseline
// captured at fetch start already includes the initialization
// write, and only later changes (user edits) can defeat it.

const startBase = {
  restored: true,
  visualOptionsInitialized: true,
  alreadyHandled: false,
  mapId: "map-1",
};

test("start gate: hydration may start only after restore AND automatic initialization", () => {
  assert.equal(typeof shouldStartMapHydration, "function");
  assert.equal(shouldStartMapHydration(startBase), true);
  // The regression condition: not yet initialized -> no start,
  // however ready everything else is.
  assert.equal(
    shouldStartMapHydration({ ...startBase, visualOptionsInitialized: false }),
    false,
  );
  assert.equal(shouldStartMapHydration({ ...startBase, restored: false }), false);
  assert.equal(
    shouldStartMapHydration({ ...startBase, alreadyHandled: true }),
    false,
  );
  assert.equal(shouldStartMapHydration({ ...startBase, mapId: null }), false);
});

test("scenario 1: slow /api/maps + automatic initialization + NO user edit -> hydration applies", () => {
  // Generation after the draft restore bumps settle.
  const generationAfterRestore = 3;
  // Before initialization lands, the fetch must not start at all
  // (at the previous head it started immediately, at generation 3).
  assert.equal(
    shouldStartMapHydration({ ...startBase, visualOptionsInitialized: false }),
    false,
  );
  // The automatic initialization writes renderOptions: generation
  // 3 -> 4. Only now does hydration start, capturing 4 as its
  // baseline.
  const generationAtFetchStart = generationAfterRestore + 1;
  assert.equal(shouldStartMapHydration(startBase), true);
  // The response arrives long after the 150 ms timer — slowly —
  // and nothing else changed: it applies.
  assert.equal(
    shouldApplyHydratedMapRecipe({
      cancelled: false,
      requestedMapId: "map-1",
      currentMapId: "map-1",
      editGenerationAtFetchStart: generationAtFetchStart,
      editGenerationNow: generationAtFetchStart,
    }),
    true,
    "initialization inside the baseline must not defeat hydration",
  );
  // Contrast — the defeated sequence at the previous head: the
  // fetch started pre-initialization (baseline 3) and the
  // initialization write landed mid-flight (now 4), so the same
  // slow response was refused.
  assert.equal(
    shouldApplyHydratedMapRecipe({
      cancelled: false,
      requestedMapId: "map-1",
      currentMapId: "map-1",
      editGenerationAtFetchStart: generationAfterRestore,
      editGenerationNow: generationAtFetchStart,
    }),
    false,
  );
});

test("scenario 3: automatic initialization, then a user edit during the fetch -> still defeated", () => {
  // Initialization is inside the baseline (fetch starts at 4)…
  const generationAtFetchStart = 4;
  assert.equal(shouldStartMapHydration(startBase), true);
  // …but a genuine user edit after the fetch started advances the
  // generation past it, and the class-5 invariant holds.
  assert.equal(
    shouldApplyHydratedMapRecipe({
      cancelled: false,
      requestedMapId: "map-1",
      currentMapId: "map-1",
      editGenerationAtFetchStart: generationAtFetchStart,
      editGenerationNow: generationAtFetchStart + 1,
    }),
    false,
    "a user edit after initialization still defeats hydration",
  );
});

test("wiring: initialization is marked by the visual-options callback and gates the fetch start", () => {
  const src = read("src/components/EditorExperience.tsx");
  // The guard's start predicate is imported.
  assert.match(
    src,
    /import \{\s*shouldApplyHydratedMapRecipe,\s*shouldStartMapHydration,\s*\} from "@\/lib\/editorHydrationGuard";/,
  );
  // Initialization state exists…
  assert.match(
    src,
    /const \[visualOptionsInitialized, setVisualOptionsInitialized\] = useState\(false\);/,
  );
  // …and is marked inside onVisualOptionsApplied, which is defined
  // before the useEditorLogic call that receives it — so the first
  // (automatic) application flips it.
  const callbackAt = src.indexOf("const onVisualOptionsApplied = useCallback(");
  const markedAt = src.indexOf("setVisualOptionsInitialized(true);");
  const hookCallAt = src.indexOf("useEditorLogic({");
  assert.ok(callbackAt !== -1 && markedAt > callbackAt && hookCallAt > markedAt);
  // The hydration effect consults the start predicate, with the
  // handled-once ref passed in rather than pre-checked…
  assert.match(
    src,
    /const requestedMapId = mapIdFromQuery;\s*if \(\s*!requestedMapId \|\|\s*!shouldStartMapHydration\(\{\s*restored,\s*visualOptionsInitialized,\s*alreadyHandled: mapFromUrlHandledRef\.current,\s*mapId: requestedMapId,\s*\}\)/,
  );
  // …before marking the map handled, and the effect re-runs when
  // initialization lands.
  const gateAt = src.indexOf("shouldStartMapHydration({");
  const handledAt = src.indexOf("mapFromUrlHandledRef.current = true;");
  assert.ok(gateAt !== -1 && handledAt !== -1 && gateAt < handledAt);
  assert.match(
    src,
    /\[applyHydratedMapRecipe, aspectRatio, mapIdFromQuery, renderOptions, restored, selectedStyle, shape, visualOptionsInitialized\]\);/,
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
