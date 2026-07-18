import assert from "node:assert/strict";
import test from "node:test";
import {
  EDITOR_DRAFT_SCHEMA_VERSION,
  parseEditorDraft,
  readEditorDraft,
  readEditorDraftFromHost,
  writeEditorDraft,
  writeEditorDraftToHost,
} from "../../src/lib/editorDraft.ts";

const makeDraft = () => ({
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
      text: "Our Paris Night",
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
  renderOptions: {
    mapLookTier: "polished",
    visualMode: "enhanced",
    starIntensity: "bold",
    starGlow: true,
    constellationLines: "thin",
    constellationLabels: true,
    showGrid: false,
    showPlanets: true,
    premiumStars: "subtle",
    premiumPlanets: "realistic",
    planetEmphasis: "highlighted",
    showMoon: true,
    moonSize: "large",
    shapeMask: "heart",
    frameEnabled: true,
    backgroundColor: "#070b1b",
    constellationColor: "#ffffff",
    constellationLineScale: 1.2,
    transparentBackground: false,
    showTechnicalRing: true,
  },
  selectedOccasion: "anniversary",
});

test("valid current draft writes a versioned envelope and round-trips", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const now = new Date("2026-07-17T18:00:00.000Z");

  const write = writeEditorDraft(storage, makeDraft(), { now: () => now });
  assert.equal(write.status, "saved");
  assert.equal(write.envelope.schemaVersion, EDITOR_DRAFT_SCHEMA_VERSION);
  assert.equal(write.envelope.savedAt, now.toISOString());

  const read = readEditorDraft(storage);
  assert.equal(read.status, "restored");
  assert.equal(read.source, "versioned");
  assert.equal(read.needsMigration, false);
  assert.equal(read.savedAt, now.toISOString());
  assert.deepEqual(read.data, makeDraft());
});

test("optional in-memory fields may be undefined before JSON serialization", () => {
  const draft = makeDraft();
  draft.renderOptions.mapLookTier = undefined;
  draft.textBoxes[0].position = undefined;
  let raw = null;

  const result = writeEditorDraft({ setItem: (_key, value) => (raw = value) }, draft);
  assert.equal(result.status, "saved");
  assert.equal(parseEditorDraft(raw).status, "restored");
});

test("an existing versioned envelope parses without migration", () => {
  const raw = JSON.stringify({
    ...makeDraft(),
    schemaVersion: EDITOR_DRAFT_SCHEMA_VERSION,
    savedAt: "2026-07-17T18:00:00.000Z",
  });
  const result = parseEditorDraft(raw);
  assert.equal(result.status, "restored");
  assert.equal(result.source, "versioned");
  assert.equal(result.needsMigration, false);
});

test("datetimeISO accepts only the supported precise ISO variants without conversion", () => {
  const validDateTimes = [
    "2024-06-15T20:30:00.000Z",
    "2024-06-15T20:30:00Z",
    "2024-02-29T23:59:59.999Z",
    "2024-01-01T00:00:00+00:00",
    "2024-04-30T23:59:59Z",
    "2024-12-31T23:59:59-08:00",
    "2024-06-15T20:30:00.250+05:30",
    "2024-06-15T20:30:00-14:00",
    "2024-06-15T20:30:00+14:00",
  ];

  for (const datetimeISO of validDateTimes) {
    const result = parseEditorDraft(JSON.stringify({ ...makeDraft(), datetimeISO }));
    assert.equal(result.status, "restored", datetimeISO);
    assert.equal(result.data.datetimeISO, datetimeISO);
  }
});

test("datetimeISO rejects malformed, impossible, normalized, and out-of-range values", () => {
  const invalidDateTimes = [
    "2024-02-31T20:30:00.000Z",
    "2023-02-29T20:30:00.000Z",
    "2024-13-01T20:30:00.000Z",
    "2024-00-01T20:30:00.000Z",
    "2024-01-00T20:30:00.000Z",
    "2024-04-31T20:30:00.000Z",
    "2024-06-15T24:00:00.000Z",
    "2024-06-15T20:60:00.000Z",
    "2024-06-15T20:30:60.000Z",
    "2024-06-15T20:30:00+14:01",
    "2024-06-15T20:30:00+15:00",
    "2024-06-15T20:30:00+05:60",
    "March 1, 2024",
    "0",
    "2024-06-15T20:30:00.000Z trailing",
    "2024-06-15T20:30:00.000",
    "2024-06-15",
  ];

  for (const datetimeISO of invalidDateTimes) {
    const result = parseEditorDraft(JSON.stringify({ ...makeDraft(), datetimeISO }));
    assert.deepEqual(result, { status: "invalid", reason: "invalid_datetime" }, datetimeISO);
    assert.equal("data" in result, false);
  }
});

test("savedAt accepts only the canonical internally generated UTC representation", () => {
  const validSavedAt = [
    "2026-07-17T18:00:00.000Z",
    "2024-02-29T23:59:59.999Z",
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T23:59:59.999Z",
  ];

  for (const savedAt of validSavedAt) {
    const result = parseEditorDraft(
      JSON.stringify({
        ...makeDraft(),
        schemaVersion: EDITOR_DRAFT_SCHEMA_VERSION,
        savedAt,
      })
    );
    assert.equal(result.status, "restored", savedAt);
    assert.equal(result.savedAt, savedAt);
  }
});

test("savedAt rejects noncanonical and impossible values", () => {
  const invalidSavedAtValues = [
    "2024-02-31T20:30:00.000Z",
    "2023-02-29T20:30:00.000Z",
    "2024-13-01T20:30:00.000Z",
    "2024-00-01T20:30:00.000Z",
    "2024-01-00T20:30:00.000Z",
    "2024-04-31T20:30:00.000Z",
    "2024-06-15T24:00:00.000Z",
    "2024-06-15T20:60:00.000Z",
    "2024-06-15T20:30:60.000Z",
    "2024-06-15T20:30:00.000+15:00",
    "March 1, 2024",
    "0",
    "2024-06-15T20:30:00.000Z trailing",
    "2024-06-15T20:30:00.000",
    "2024-06-15T20:30:00Z",
    "2024-06-15T20:30:00.000+00:00",
  ];

  for (const savedAt of invalidSavedAtValues) {
    const result = parseEditorDraft(
      JSON.stringify({
        ...makeDraft(),
        schemaVersion: EDITOR_DRAFT_SCHEMA_VERSION,
        savedAt,
      })
    );
    assert.deepEqual(result, { status: "invalid", reason: "invalid_envelope" }, savedAt);
    assert.equal("data" in result, false);
  }
});

test("legacy raw recipe restores and can be migrated without deleting its data", () => {
  const legacy = makeDraft();
  legacy.datetimeISO = "2024-06-15T20:30:00Z";
  delete legacy.selectedOccasion;
  delete legacy.shape;
  legacy.renderOptions.shapeMask = "diamond";

  const parsed = parseEditorDraft(JSON.stringify(legacy));
  assert.equal(parsed.status, "restored");
  assert.equal(parsed.source, "legacy");
  assert.equal(parsed.needsMigration, true);
  assert.equal(parsed.data.shape, "diamond");
  assert.equal(parsed.data.selectedOccasion, null);
  assert.equal(parsed.data.datetimeISO, legacy.datetimeISO);
  assert.equal(parsed.data.textBoxes[0].text, "Our Paris Night");

  let migratedRaw = null;
  const migrated = writeEditorDraft({ setItem: (_key, value) => (migratedRaw = value) }, parsed.data, {
    now: () => new Date("2026-07-17T18:05:00.000Z"),
  });
  assert.equal(migrated.status, "saved");
  const reparsed = parseEditorDraft(migratedRaw);
  assert.equal(reparsed.status, "restored");
  assert.equal(reparsed.source, "versioned");
  assert.equal(reparsed.data.datetimeISO, legacy.datetimeISO);
  assert.equal(reparsed.data.textBoxes[0].text, "Our Paris Night");
});

test("corrupt JSON is rejected safely", () => {
  assert.deepEqual(parseEditorDraft('{"datetimeISO":'), {
    status: "invalid",
    reason: "malformed_json",
  });
});

test("a stored empty string is malformed rather than an empty draft", () => {
  assert.deepEqual(readEditorDraft({ getItem: () => "" }), {
    status: "invalid",
    reason: "malformed_json",
  });
});

test("missing required fields are rejected", () => {
  const draft = makeDraft();
  delete draft.location;
  assert.deepEqual(parseEditorDraft(JSON.stringify(draft)), {
    status: "invalid",
    reason: "invalid_location",
  });
});

test("invalid coordinates are rejected", () => {
  for (const location of [
    { ...makeDraft().location, latitude: 91 },
    { ...makeDraft().location, longitude: -181 },
    { ...makeDraft().location, latitude: Number.NaN },
  ]) {
    const result = parseEditorDraft(JSON.stringify({ ...makeDraft(), location }));
    assert.equal(result.status, "invalid");
    assert.equal(result.reason, "invalid_location");
  }
});

test("invalid enum values are rejected", () => {
  const invalidDrafts = [
    { ...makeDraft(), selectedStyle: "neon" },
    { ...makeDraft(), aspectRatio: "16:9" },
    { ...makeDraft(), shape: "hexagon" },
    {
      ...makeDraft(),
      renderOptions: { ...makeDraft().renderOptions, visualMode: "unknown" },
    },
  ];
  const expectedReasons = [
    "invalid_style",
    "invalid_aspect_ratio",
    "invalid_shape",
    "invalid_render_options",
  ];

  invalidDrafts.forEach((draft, index) => {
    const result = parseEditorDraft(JSON.stringify(draft));
    assert.equal(result.status, "invalid");
    assert.equal(result.reason, expectedReasons[index]);
  });
});

test("invalid text-box structures are rejected and safe legacy omissions are normalized", () => {
  const malformed = {
    ...makeDraft(),
    textBoxes: [{ ...makeDraft().textBoxes[0], text: 42 }],
  };
  assert.deepEqual(parseEditorDraft(JSON.stringify(malformed)), {
    status: "invalid",
    reason: "invalid_text_boxes",
  });

  const sparseLegacyBox = { ...makeDraft(), textBoxes: [{ text: "Preserve me" }] };
  const normalized = parseEditorDraft(JSON.stringify(sparseLegacyBox));
  assert.equal(normalized.status, "restored");
  assert.equal(normalized.data.textBoxes[0].text, "Preserve me");
  assert.equal(normalized.data.textBoxes[0].id, "title");
  assert.equal(normalized.data.textBoxes[0].fontFamily, "cinzel");
});

test("storage read and write failures return typed outcomes without throwing", () => {
  assert.deepEqual(
    readEditorDraft({
      getItem: () => {
        throw new Error("denied");
      },
    }),
    { status: "storage-unavailable", operation: "read" }
  );

  assert.deepEqual(
    writeEditorDraft(
      {
        setItem: () => {
          throw new Error("quota");
        },
      },
      makeDraft()
    ),
    { status: "storage-unavailable", operation: "write" }
  );
});

test("a throwing localStorage property getter returns typed outcomes", () => {
  const host = {};
  Object.defineProperty(host, "localStorage", {
    get() {
      throw new DOMException("Access denied", "SecurityError");
    },
  });

  assert.deepEqual(readEditorDraftFromHost(host), {
    status: "storage-unavailable",
    operation: "read",
  });
  assert.deepEqual(writeEditorDraftToHost(host, makeDraft()), {
    status: "storage-unavailable",
    operation: "write",
  });
});

test("an invalid draft exposes no data and cannot be partially restored", () => {
  const editorState = { title: "Default title", latitude: 0 };
  const before = structuredClone(editorState);
  const result = parseEditorDraft(
    JSON.stringify({
      ...makeDraft(),
      location: { ...makeDraft().location, latitude: 999 },
      textBoxes: [{ ...makeDraft().textBoxes[0], text: "Must not leak into state" }],
    })
  );

  if (result.status === "restored") {
    editorState.title = result.data.textBoxes[0].text;
    editorState.latitude = result.data.location.latitude;
  }
  assert.deepEqual(editorState, before);
  assert.equal(result.status, "invalid");
  assert.equal("data" in result, false);
});

test("invalid data is never written over the existing stored draft", () => {
  let writes = 0;
  const invalid = { ...makeDraft(), textBoxes: "not-an-array" };
  const result = writeEditorDraft({ setItem: () => (writes += 1) }, invalid);
  assert.equal(result.status, "invalid");
  assert.equal(writes, 0);
});
