/**
 * S4 sweep A1/A2 — storefront silent-failure fixes.
 *
 * A1: EditorExperience's autosave effect honoured only
 * `status === "saved"` from writeEditorDraftToHost and discarded
 * every other outcome, while the UI kept showing "Draft autosaves
 * on this device" or a stale saved timestamp. A failed write
 * (storage denied, quota) silently left newer edits unprotected.
 * SimplifiedEditor's debounced save caught and ignored storage
 * errors the same way. The fix routes every write outcome through
 * a pure status transition (editorDraftSaveStatus.ts): a failure
 * surfaces an honest "couldn't save" status and only a later
 * successful write clears it.
 *
 * A2: the map-link hydration effect set its handled-once flag
 * before fetching and returned silently on non-OK HTTP, invalid
 * recipe, and rejected fetch/JSON — the editor continued with the
 * local draft and the user could never tell the linked design had
 * not loaded, and never retry. The fix classifies the attempt via
 * loadLinkedMapRecipe (editorHydrationGuard.ts) and surfaces an
 * explicit load-failed state with a retry action and an explicit
 * continue-with-this-draft choice. The edit-generation fence is
 * untouched: a guard-defeated response is NOT a load failure and
 * must not surface as one.
 *
 * Base behaviour (negative control): at the pre-fix head this file
 * fails — the status module does not exist, loadLinkedMapRecipe is
 * not exported, the autosave effect has no failure branch, and the
 * hydration catch is the old `// ignore failed hydration` line.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const saveStatus = await import("../../src/lib/editorDraftSaveStatus.ts");
const { loadLinkedMapRecipe } = await import("../../src/lib/editorHydrationGuard.ts");

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

/* ------------------------------ A1 ------------------------------ */

const { draftSaveStatusAfterWrite, draftSaveFailureText, INITIAL_DRAFT_SAVE_STATUS } =
  saveStatus;

test("A1: a successful write records the saved state with its label", () => {
  const next = draftSaveStatusAfterWrite(INITIAL_DRAFT_SAVE_STATUS, {
    status: "saved",
    savedAtLabel: "9:41 AM",
  });
  assert.deepEqual(next, { state: "saved", savedAtLabel: "9:41 AM" });
});

test("A1: success -> failure -> success (failure surfaces, clears only on the next success)", () => {
  let status = draftSaveStatusAfterWrite(INITIAL_DRAFT_SAVE_STATUS, {
    status: "saved",
    savedAtLabel: "9:41 AM",
  });
  status = draftSaveStatusAfterWrite(status, { status: "storage-unavailable" });
  assert.deepEqual(status, { state: "failed", lastSavedAtLabel: "9:41 AM" });
  // A second failure keeps the ORIGINAL last-success label.
  status = draftSaveStatusAfterWrite(status, { status: "invalid" });
  assert.deepEqual(status, { state: "failed", lastSavedAtLabel: "9:41 AM" });
  status = draftSaveStatusAfterWrite(status, {
    status: "saved",
    savedAtLabel: "9:42 AM",
  });
  assert.deepEqual(status, { state: "saved", savedAtLabel: "9:42 AM" });
});

test("A1: a first-write failure never claims a save happened", () => {
  const status = draftSaveStatusAfterWrite(INITIAL_DRAFT_SAVE_STATUS, {
    status: "storage-unavailable",
  });
  assert.deepEqual(status, { state: "failed", lastSavedAtLabel: null });
  const text = draftSaveFailureText(status);
  assert.match(text, /Couldn't save/);
  assert.doesNotMatch(text, /autosaved|last saved/i);
});

test("A1: failure text names the last successful save when there was one", () => {
  const text = draftSaveFailureText({ state: "failed", lastSavedAtLabel: "9:41 AM" });
  assert.match(text, /Couldn't save your latest edits/);
  assert.match(text, /9:41 AM/);
});

test("A1 wiring: the autosave effect routes EVERY outcome through the status transition", () => {
  const src = read("src/components/EditorExperience.tsx");
  assert.match(
    src,
    /import \{\s*draftSaveStatusAfterWrite,\s*draftSaveFailureText,\s*INITIAL_DRAFT_SAVE_STATUS,\s*type DraftSaveStatus,\s*\} from "@\/lib\/editorDraftSaveStatus";/,
  );
  const effectAt = src.indexOf("const saveOutcome = writeEditorDraftToHost(");
  assert.ok(effectAt !== -1, "autosave effect still writes through the typed helper");
  const effectSegment = src.slice(effectAt, effectAt + 900);
  assert.match(effectSegment, /setDraftSaveStatus\(\(prev\) =>/);
  assert.match(effectSegment, /draftSaveStatusAfterWrite\(\s*prev,/);
  // The old lone-outcome check must not survive as the only branch.
  assert.doesNotMatch(
    effectSegment,
    /if \(saveOutcome\.status === "saved"\) \{\s*setLastDraftSavedAt\(/,
  );
});

test("A1 wiring: both save-copy sites render the failure state instead of the autosave promise", () => {
  const src = read("src/components/EditorExperience.tsx");
  const failureRenders = src.match(/draftSaveStatus\.state === "failed"/g) ?? [];
  assert.ok(
    failureRenders.length >= 2,
    "welcome panel and editing header both branch on the failed state",
  );
  assert.match(src, /draftSaveFailureText\(draftSaveStatus\)/);
  assert.doesNotMatch(src, /lastDraftSavedAt/);
});

test("A1 wiring: SimplifiedEditor surfaces its debounced-save failures the same way", () => {
  const src = read("src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.match(src, /from "@\/lib\/editorDraftSaveStatus";/);
  assert.match(src, /draftSaveStatusAfterWrite\(prev,/);
  assert.match(src, /draftSaveStatus\.state === "failed"/);
  const saveEffectAt = src.indexOf("draftSaveTimerRef.current = window.setTimeout(");
  assert.ok(saveEffectAt !== -1, "debounced save effect present");
  const saveSegment = src.slice(saveEffectAt, saveEffectAt + 1600);
  assert.doesNotMatch(saveSegment, /\/\/ ignore storage errors/);
});

/* ------------------------------ A2 ------------------------------ */

const recipeData = { id: "map-1", title: "Linked design" };
const okResponse = (data) => ({ ok: true, json: async () => data });
const isHydratable = (data) => Boolean(data && typeof data === "object" && "id" in data);
const applyAllowed = () => true;

test("A2: a non-OK HTTP response is a load failure (http-error), never silent", async () => {
  const result = await loadLinkedMapRecipe({
    mapId: "map-1",
    fetchRecipe: async () => ({ ok: false, json: async () => ({}) }),
    isHydratable,
    shouldApply: applyAllowed,
  });
  assert.deepEqual(result, { status: "failed", reason: "http-error" });
});

test("A2: a rejected fetch is a load failure (fetch-failed)", async () => {
  const result = await loadLinkedMapRecipe({
    mapId: "map-1",
    fetchRecipe: async () => {
      throw new Error("network down");
    },
    isHydratable,
    shouldApply: applyAllowed,
  });
  assert.deepEqual(result, { status: "failed", reason: "fetch-failed" });
});

test("A2: an unreadable JSON body is a load failure (fetch-failed)", async () => {
  const result = await loadLinkedMapRecipe({
    mapId: "map-1",
    fetchRecipe: async () => ({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    }),
    isHydratable,
    shouldApply: applyAllowed,
  });
  assert.deepEqual(result, { status: "failed", reason: "fetch-failed" });
});

test("A2: a well-formed response that is not a recipe is a load failure (invalid-recipe)", async () => {
  const result = await loadLinkedMapRecipe({
    mapId: "map-1",
    fetchRecipe: async () => okResponse({ hello: "world" }),
    isHydratable,
    shouldApply: applyAllowed,
  });
  assert.deepEqual(result, { status: "failed", reason: "invalid-recipe" });
});

test("A2: a good response the fence allows is applied", async () => {
  const result = await loadLinkedMapRecipe({
    mapId: "map-1",
    fetchRecipe: async () => okResponse(recipeData),
    isHydratable,
    shouldApply: applyAllowed,
  });
  assert.deepEqual(result, { status: "applied", data: recipeData });
});

test("A2: edits during an in-flight load defeat application — and that is NOT a load failure", async () => {
  const result = await loadLinkedMapRecipe({
    mapId: "map-1",
    fetchRecipe: async () => okResponse(recipeData),
    isHydratable,
    shouldApply: () => false,
  });
  assert.deepEqual(result, { status: "defeated" });
});

test("A2: retry after a failure can succeed", async () => {
  let attempt = 0;
  const fetchRecipe = async () => {
    attempt += 1;
    return attempt === 1 ? { ok: false, json: async () => ({}) } : okResponse(recipeData);
  };
  const first = await loadLinkedMapRecipe({
    mapId: "map-1",
    fetchRecipe,
    isHydratable,
    shouldApply: applyAllowed,
  });
  assert.equal(first.status, "failed");
  const second = await loadLinkedMapRecipe({
    mapId: "map-1",
    fetchRecipe,
    isHydratable,
    shouldApply: applyAllowed,
  });
  assert.deepEqual(second, { status: "applied", data: recipeData });
});

test("A2 wiring: the hydration effect classifies the attempt and surfaces failures", () => {
  const src = read("src/components/EditorExperience.tsx");
  assert.match(src, /loadLinkedMapRecipe\(\{/);
  const effectAt = src.indexOf("const generationAtFetchStart = useStore.getState().editGeneration;");
  assert.ok(effectAt !== -1);
  const effectSegment = src.slice(effectAt, effectAt + 4200);
  assert.match(effectSegment, /setMapHydrationFailure\(\{ mapId: requestedMapId \}\)/);
  assert.doesNotMatch(effectSegment, /\/\/ ignore failed hydration/);
  // The edit-generation fence still gates application inside the attempt.
  assert.match(effectSegment, /shouldApplyHydratedMapRecipe\(\{/);
});

test("A2 wiring: failure banner offers retry and an explicit continue-with-draft choice", () => {
  const src = read("src/components/EditorExperience.tsx");
  assert.match(src, /We couldn't load the design from your link\./);
  assert.match(src, /onClick=\{handleRetryMapHydration\}/);
  assert.match(src, /onClick=\{handleContinueWithDraft\}/);
  assert.match(src, />\s*Try again\s*</);
  assert.match(src, />\s*Continue with this draft\s*</);
  // Retry re-arms the handled-once flag, re-anchors the restore
  // baseline at the click, and bumps the attempt nonce the effect
  // depends on.
  const retryAt = src.indexOf("const handleRetryMapHydration = useCallback(");
  assert.ok(retryAt !== -1);
  const retrySegment = src.slice(retryAt, retryAt + 700);
  assert.match(retrySegment, /setMapHydrationFailure\(null\)/);
  assert.match(retrySegment, /mapFromUrlHandledRef\.current = false;/);
  assert.match(
    retrySegment,
    /editGenerationAtRestoreRef\.current = useStore\.getState\(\)\.editGeneration;/,
  );
  assert.match(retrySegment, /setMapHydrationRetryNonce\(\(n\) => n \+ 1\)/);
});
