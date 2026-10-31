import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// S93-2 class 6 — draft-key stale restore in SimplifiedEditor.
//
// The constructible sequence S93-2 proved: SimplifiedEditor saves
// design A to BOTH its private key (starmap-simplified-draft) and
// the shared key (star-map-draft); EditorExperience then saves
// design B to the shared key only; a SimplifiedEditor remount read
// ONLY the private key, restored A, and its save effect re-wrote A
// over B in both keys. The private draft carries no timestamp, so
// the fix is precedence, not recency: resolveSharedFirstDraftRestore
// (editorDraft.ts) — validated shared draft wins, present-but-
// unreadable shared blocks restore, absent shared falls back to
// the legacy private-only path. No render output is involved.

const {
  EDITOR_DRAFT_STORAGE_KEY,
  resolveSharedFirstDraftRestore,
  writeEditorDraft,
} = await import("../../src/lib/editorDraft.ts");

const read = (rel) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

const PRIVATE_KEY = "starmap-simplified-draft";

function makeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

function makeDraft(titleText) {
  return {
    version: 1,
    seed: "draft-test",
    datetimeISO: "2024-06-15T20:30:00.000Z",
    location: {
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    },
    textBoxes: [
      {
        id: "title",
        label: "Title",
        text: titleText,
        fontFamily: "cinzel",
        color: "#d7b56c",
        size: 48,
        fontWeight: 600,
        align: "center",
        textShadow: true,
        textGlow: false,
        position: { x: 0.5, y: 0.12 },
      },
    ],
    selectedStyle: "navyGold",
    aspectRatio: "3:4",
    shape: "heart",
    renderOptions: { showMoon: true, frameEnabled: true },
    selectedOccasion: null,
    sampleDesignLastAutoSynced: { subtitle: null, dedication: null },
    dateTimeIsUntouchedDefault: false,
  };
}

test("the proven stale sequence: the shared design wins over the stale private draft", () => {
  const storage = makeStorage();
  // SimplifiedEditor saved design A to both keys (its shared write
  // is a bare, unenveloped recipe object).
  storage.setItem(PRIVATE_KEY, JSON.stringify({ dateTime: "2024-01-01T00:00:00.000Z", textBoxes: [{ id: "title", text: "Design A" }] }));
  storage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify(makeDraft("Design A")));
  // EditorExperience then saved design B to the shared key only.
  const written = writeEditorDraft(storage, makeDraft("Design B"));
  assert.equal(written.status, "saved");

  const restore = resolveSharedFirstDraftRestore(storage);
  assert.equal(restore.source, "shared");
  assert.equal(restore.data.textBoxes[0].text, "Design B", "B survives the remount; A is not resurrected");
});

test("a legacy unenveloped shared draft (SimplifiedEditor's own write shape) still restores", () => {
  const storage = makeStorage();
  storage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify(makeDraft("Bare Shared")));
  const restore = resolveSharedFirstDraftRestore(storage);
  assert.equal(restore.source, "shared");
  assert.equal(restore.data.textBoxes[0].text, "Bare Shared");
});

test("no shared draft: private-only (the legacy migration path stays open)", () => {
  const storage = makeStorage();
  storage.setItem(PRIVATE_KEY, JSON.stringify({ dateTime: "2024-01-01T00:00:00.000Z" }));
  assert.deepEqual(resolveSharedFirstDraftRestore(storage), { source: "private-only" });
  assert.deepEqual(resolveSharedFirstDraftRestore(makeStorage()), { source: "private-only" });
});

test("a present-but-invalid shared draft blocks restore instead of resurrecting the private copy", () => {
  const storage = makeStorage();
  storage.setItem(PRIVATE_KEY, JSON.stringify({ dateTime: "2024-01-01T00:00:00.000Z" }));
  storage.setItem(EDITOR_DRAFT_STORAGE_KEY, "{not json");
  const blocked = resolveSharedFirstDraftRestore(storage);
  assert.equal(blocked.source, "shared-blocked");
  assert.equal(blocked.status, "invalid");

  const future = makeStorage();
  future.setItem(
    EDITOR_DRAFT_STORAGE_KEY,
    JSON.stringify({ ...makeDraft("Future"), schemaVersion: 99, savedAt: "2024-06-15T20:30:00.000Z" }),
  );
  assert.equal(resolveSharedFirstDraftRestore(future).source, "shared-blocked");
});

test("unreadable storage blocks restore (never guess from the private key)", () => {
  const throwing = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {},
  };
  const restore = resolveSharedFirstDraftRestore(throwing);
  assert.equal(restore.source, "shared-blocked");
  assert.equal(restore.status, "storage-unavailable");
});

test("wiring: SimplifiedEditor arbitrates shared-first before touching its private key", () => {
  const src = read("src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  const arbitrateAt = src.indexOf("resolveSharedFirstDraftRestore(localStorage)");
  const privateReadAt = src.indexOf("localStorage.getItem(DRAFT_STORAGE_KEY)");
  assert.ok(arbitrateAt !== -1, "the resolver is consulted in the restore effect");
  assert.ok(privateReadAt !== -1 && arbitrateAt < privateReadAt, "shared arbitration precedes the private read");
  assert.match(src, /sharedFirst\.source === "shared-blocked"/, "the blocked branch exists and restores nothing");
});
