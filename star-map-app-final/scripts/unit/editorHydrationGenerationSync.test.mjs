/**
 * S96-2 F7 — the hydration guard's edit generation must advance
 * SYNCHRONOUSLY with an edit, not in a passive effect.
 *
 * The S93-2 class-5 fix counted edits in EditorExperience with a
 * passive useEffect keyed on the recipe fields. S96-2 constructed
 * the surviving interleaving from source:
 *
 *   1. The hydration fetch starts, capturing generation N.
 *   2. The user edits (e.g. updateTextBox) — the store updates.
 *   3. The fetch response continuation runs BEFORE the tracking
 *      effect has flushed, reads the generation, still sees N,
 *      and applies the fetched recipe over the edit.
 *
 * The generation now lives in the store and advances inside the
 * mutation itself (a synchronous Zustand subscription in
 * src/lib/store.ts, plus the selectedOccasion setter wrapper in
 * useEditorLogic for the one hook-local field). These tests run
 * in plain Node — there is no React and no effect queue here at
 * all — so an advance observed immediately after a mutation call
 * can only have happened synchronously, inside the call. That is
 * the construction the fix claims; these tests pin it against
 * the real store and the real guard.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { useStore, bumpEditGeneration } = await import(
  "../../src/lib/store.ts"
);
const { shouldApplyHydratedMapRecipe } = await import(
  "../../src/lib/editorHydrationGuard.ts"
);

const generation = () => useStore.getState().editGeneration;

const guardVerdict = (editGenerationAtFetchStart, editGenerationNow) =>
  shouldApplyHydratedMapRecipe({
    cancelled: false,
    requestedMapId: "map-1",
    currentMapId: "map-1",
    editGenerationAtFetchStart,
    editGenerationNow,
  });

test("F7 interleaving: an edit landing between fetch start and any effect flush defeats hydration in the same synchronous turn", () => {
  const box = useStore.getState().textBoxes[0];
  assert.ok(box, "the store seeds at least one text box");

  // 1. The fetch starts; the component captures the generation.
  const generationAtFetchStart = generation();

  // 2. The user edits while the response is in flight — the
  //    audit's own example call. No await, no timer, no effect
  //    flush intervenes: this is precisely the window the
  //    passive effect left open.
  useStore
    .getState()
    .updateTextBox(box.id, { text: "Edited while the map loads" });

  // 3. The response continuation now reads the generation. Under
  //    the old wiring it would still see the captured value here
  //    (the tracking effect had not run); the edit must ALREADY
  //    be counted.
  assert.ok(
    generation() > generationAtFetchStart,
    "the edit must advance the generation synchronously, inside the mutation call",
  );
  assert.equal(
    guardVerdict(generationAtFetchStart, generation()),
    false,
    "the late response is refused and the edit survives",
  );
});

test("control: with no intervening edit the generation is unchanged and hydration still applies", () => {
  const generationAtFetchStart = generation();
  assert.equal(generation(), generationAtFetchStart);
  assert.equal(guardVerdict(generationAtFetchStart, generation()), true);
});

// Every store-resident recipe field the guard tracks, exercised
// through its real setter. Each edit is a single store mutation,
// so the generation must advance by exactly one — the bump is
// part of the same state transition, not a follow-up write.
const otherThan = (current, candidates) =>
  candidates.find((candidate) => candidate !== current);

const fieldEdits = [
  [
    "dateTime",
    () => {
      const next =
        useStore.getState().dateTime === "2001-02-03T04:05:06.000Z"
          ? "2002-03-04T05:06:07.000Z"
          : "2001-02-03T04:05:06.000Z";
      useStore.getState().setDateTime(next);
    },
  ],
  [
    "location",
    () =>
      useStore
        .getState()
        .setLocation({ name: "Victoria, British Columbia" }),
  ],
  [
    "textBoxes",
    () =>
      useStore
        .getState()
        .setTextBoxes(
          useStore.getState().textBoxes.map((box) => ({ ...box })),
        ),
  ],
  [
    "selectedStyle",
    () =>
      useStore
        .getState()
        .setStyle(
          otherThan(useStore.getState().selectedStyle, [
            "navyGold",
            "midnightMinimal",
          ]),
        ),
  ],
  [
    "aspectRatio",
    () =>
      useStore
        .getState()
        .setAspectRatio(
          otherThan(useStore.getState().aspectRatio, ["square", "4:5"]),
        ),
  ],
  [
    "shape",
    () =>
      useStore
        .getState()
        .setShape(
          otherThan(useStore.getState().shape, ["rectangle", "circle"]),
        ),
  ],
  [
    "renderOptions",
    () =>
      useStore
        .getState()
        .setRenderOptions({ starGlow: !useStore.getState().renderOptions.starGlow }),
  ],
];

for (const [field, edit] of fieldEdits) {
  test(`a ${field} edit advances the generation synchronously, by exactly one`, () => {
    const before = generation();
    edit();
    assert.equal(
      generation(),
      before + 1,
      `${field} mutation must be counted inside the same synchronous turn`,
    );
  });
}

test("a direct useStore.setState recipe write (the draft-restore seam) also advances the generation synchronously", () => {
  const before = generation();
  useStore.setState({
    location: {
      name: "Restored Draft Lake",
      latitude: 48.4,
      longitude: -123.4,
      timezone: "America/Vancouver",
    },
  });
  assert.equal(generation(), before + 1);
});

test("non-recipe writes do not advance the generation", () => {
  const before = generation();
  const state = useStore.getState();
  state.setPaid(true);
  state.setRevealed(true);
  state.setPreviewFidelity("high");
  assert.equal(
    generation(),
    before,
    "paywall/reveal/fidelity churn must not defeat a pending hydration",
  );
});

test("a write that changes no recipe field value does not advance the generation", () => {
  const before = generation();
  useStore.getState().setStyle(useStore.getState().selectedStyle);
  assert.equal(generation(), before);
});

test("bumpEditGeneration (the selectedOccasion seam) advances by exactly one and does not recurse", () => {
  const before = generation();
  bumpEditGeneration();
  assert.equal(generation(), before + 1);
});
