/**
 * PROD-SM W2-4 (issue #490) — auto-generated occasion caption row.
 *
 * The caption line ("{Location} · {coords} · {date}") is generated from
 * the design's existing data and inserted as an ORDINARY text box
 * (id "caption") through the existing text-box machinery — no new text
 * system, no caption-specific state or renderer path.
 *
 * Pins:
 * - Generation from data: name + 4dp hemisphere coordinates + the
 *   long-form date rendered in the location's timezone (a date-boundary
 *   case proves the timezone is honoured, not the viewer's).
 * - No caption when data is absent: the placeholder location sentinel
 *   (0, 0 — same sentinel as the store / checkoutSkyGuard), non-finite
 *   or out-of-range coordinates, or an unparseable date all yield null.
 * - The inserted row is a plain TextBox: style defaults + automatic
 *   binding like the store's addTextBox precedent, centred anchor just
 *   below the dedication row; it survives the draft normalizer
 *   unchanged in kind (ordinary machinery), and a user edit to its text
 *   is just a text edit.
 * - Refresh semantics: upserting again replaces only the text (user
 *   position/style edits survive), and upserting the current caption
 *   is a no-op returning the same array.
 * - UI wiring: both editor surfaces (EditorExperience, MobileCreate)
 *   offer "+ Add Caption" only when a caption exists.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { buildAutoCaption, upsertAutoCaptionBox, resolveAutoCaptionRow, AUTO_CAPTION_BOX_ID } =
  await import("../../src/lib/autoCaption.ts");
const { normalizeEditorDraftData } = await import("../../src/lib/editorDraft.ts");
const { STANDARD_TEXT_BOX_ROWS, DIAMOND_TEXT_BOX_ROWS, HEART_TEXT_BOX_ROWS, STAR_TEXT_BOX_ROWS } =
  await import("../../src/lib/textFit.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const paris = {
  locationName: "Paris, France",
  latitude: 48.8566,
  longitude: 2.3522,
  dateTimeISO: "2024-06-15T20:30:00.000Z",
  timezone: "Europe/Paris",
};

// ─── Generation from data ────────────────────────────────────────────────────

test("caption is generated from the design's location and date data", () => {
  assert.equal(
    buildAutoCaption(paris),
    "Paris, France · 48.8566° N, 2.3522° E · June 15, 2024",
  );
});

test("coordinates carry hemisphere letters and 4dp precision", () => {
  assert.equal(
    buildAutoCaption({
      locationName: "Sydney, Australia",
      latitude: -33.8688,
      longitude: 151.2093,
      dateTimeISO: "2024-01-20T10:00:00.000Z",
      timezone: "Australia/Sydney",
    }),
    "Sydney, Australia · 33.8688° S, 151.2093° E · January 20, 2024",
  );
  assert.equal(
    buildAutoCaption({
      locationName: "Vancouver, BC",
      latitude: 49.2827,
      longitude: -123.1207,
      dateTimeISO: "2024-01-20T10:00:00.000Z",
      timezone: "America/Vancouver",
    }),
    "Vancouver, BC · 49.2827° N, 123.1207° W · January 20, 2024",
  );
});

test("the date renders in the location's timezone, not the viewer's", () => {
  const instant = "2024-06-15T01:30:00.000Z"; // Jun 15 in UTC, Jun 14 in New York
  const base = { locationName: "New York, NY", latitude: 40.7128, longitude: -74.006 };
  assert.match(buildAutoCaption({ ...base, dateTimeISO: instant, timezone: "UTC" }), /June 15, 2024$/);
  assert.match(
    buildAutoCaption({ ...base, dateTimeISO: instant, timezone: "America/New_York" }),
    /June 14, 2024$/,
  );
});

test("an empty or unrecognised timezone yields no caption, never a UTC-shifted date", () => {
  const instant = "2024-06-15T01:30:00.000Z"; // Jun 15 in UTC, Jun 14 in New York
  const base = { locationName: "New York, NY", latitude: 40.7128, longitude: -74.006, dateTimeISO: instant };
  assert.equal(buildAutoCaption({ ...base, timezone: "" }), null);
  assert.equal(buildAutoCaption({ ...base, timezone: "   " }), null);
  assert.equal(buildAutoCaption({ ...base, timezone: "Not/AZone" }), null);
});

test("the caption's initial row sits one gap below the shape's dedication row, inside every mask", () => {
  const caption = "Paris, France · 48.8566° N, 2.3522° E · June 15, 2024";
  const rowFor = (layout) =>
    upsertAutoCaptionBox([], caption, "navyGold", layout).find((b) => b.id === AUTO_CAPTION_BOX_ID)
      .position.y;
  const GAP = 0.05;
  // Standard shapes keep the long-standing row, exactly (stored rows
  // are recognised by exact equality in the default-row system).
  assert.equal(rowFor(undefined), 0.95);
  assert.equal(rowFor({ shape: "rectangle" }), 0.95);
  assert.equal(rowFor({ shape: "circle" }), 0.95);
  assert.ok(Math.abs(rowFor({ shape: "rectangle" }) - (STANDARD_TEXT_BOX_ROWS.dedication + GAP)) < 1e-9);
  // Diamond: the standard 0.95 is below the bottom apex (0.94); the
  // caption follows the diamond dedication row instead.
  assert.equal(rowFor({ shape: "diamond" }), 0.69);
  assert.ok(Math.abs(rowFor({ shape: "diamond" }) - (DIAMOND_TEXT_BOX_ROWS.dedication + GAP)) < 1e-9);
  // Heart/star rows are mask-authored (dedication 0.65): verbatim
  // without a footprint, converted through one with it.
  assert.equal(rowFor({ shape: "heart" }), 0.7);
  assert.equal(rowFor({ shape: "star" }), 0.7);
  assert.ok(Math.abs(rowFor({ shape: "heart" }) - (HEART_TEXT_BOX_ROWS.dedication + GAP)) < 1e-9);
  assert.ok(Math.abs(rowFor({ shape: "star" }) - (STAR_TEXT_BOX_ROWS.dedication + GAP)) < 1e-9);
  assert.equal(
    rowFor({
      shape: "heart",
      shapeMaskFootprint: { size: 800, offsetX: 100, offsetY: 200 },
      canvasHeight: 1000,
    }),
    0.76, // (200 + 0.70 * 800) / 1000 — the designed rows' own conversion
  );
  assert.equal(resolveAutoCaptionRow({ shape: "diamond" }), 0.69);
});

test("a missing location name yields a coords + date caption", () => {
  assert.equal(
    buildAutoCaption({ ...paris, locationName: "   " }),
    "48.8566° N, 2.3522° E · June 15, 2024",
  );
});

// ─── No caption when data is absent ──────────────────────────────────────────

test("no caption for the placeholder location sentinel", () => {
  assert.equal(buildAutoCaption({ ...paris, latitude: 0, longitude: 0 }), null);
});

test("no caption for non-finite, out-of-range, or dateless input", () => {
  assert.equal(buildAutoCaption({ ...paris, latitude: Number.NaN }), null);
  assert.equal(buildAutoCaption({ ...paris, longitude: Number.POSITIVE_INFINITY }), null);
  assert.equal(buildAutoCaption({ ...paris, latitude: 91 }), null);
  assert.equal(buildAutoCaption({ ...paris, longitude: -181 }), null);
  assert.equal(buildAutoCaption({ ...paris, dateTimeISO: "not a date" }), null);
  assert.equal(buildAutoCaption({ ...paris, dateTimeISO: "" }), null);
});

// ─── The row is an ordinary text box ─────────────────────────────────────────

const titleBox = {
  id: "title",
  label: "Title",
  text: "Our Night Sky",
  fontFamily: "cinzel",
  color: "#d7b56c",
  textStyleBinding: { color: "automatic", fontFamily: "automatic" },
  size: 48,
  align: "center",
  textShadow: false,
  textGlow: false,
  position: { x: 0.5, y: 0.12 },
};

test("upsert appends a plain caption TextBox built like sibling rows", () => {
  const caption = buildAutoCaption(paris);
  const next = upsertAutoCaptionBox([titleBox], caption, "navyGold");
  assert.equal(next.length, 2);
  const box = next.find((b) => b.id === AUTO_CAPTION_BOX_ID);
  assert.ok(box, "caption box exists");
  assert.equal(box.label, "Caption");
  assert.equal(box.text, caption);
  assert.equal(box.align, "center");
  assert.equal(box.size, 20);
  assert.deepEqual(box.position, { x: 0.5, y: 0.95 });
  assert.deepEqual(box.textStyleBinding, { color: "automatic", fontFamily: "automatic", fontWeight: "automatic" });
  assert.equal(typeof box.fontFamily, "string");
  assert.equal(typeof box.color, "string");
  // Sibling rows are untouched.
  assert.equal(next[0], titleBox);
});

test("the caption box passes the ordinary draft machinery unchanged in kind", () => {
  const caption = buildAutoCaption(paris);
  const boxes = upsertAutoCaptionBox([titleBox], caption, "navyGold");
  const outcome = normalizeEditorDraftData({
    version: 1,
    seed: "auto-caption-test",
    datetimeISO: "2024-06-15T20:30:00.000Z",
    location: { name: "Paris, France", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris" },
    textBoxes: boxes,
    selectedStyle: "navyGold",
    aspectRatio: "square",
    shape: "rectangle",
    renderOptions: {},
    selectedOccasion: "anniversary",
    sampleDesignLastAutoSynced: { subtitle: null, dedication: null },
    dateTimeIsUntouchedDefault: false,
  });
  assert.equal(outcome.ok, true);
  const roundTripped = outcome.value.textBoxes.find((b) => b.id === AUTO_CAPTION_BOX_ID);
  assert.ok(roundTripped, "caption box survives draft normalization");
  assert.equal(roundTripped.text, caption);
});

test("the caption row edits like any other text box", () => {
  const caption = buildAutoCaption(paris);
  const boxes = upsertAutoCaptionBox([titleBox], caption, "navyGold");
  // The store's updateTextBox applies a Partial<TextBox> by id — the
  // same operation works on the caption row with no special casing.
  const edited = boxes.map((box) =>
    box.id === AUTO_CAPTION_BOX_ID ? { ...box, text: "Our first night in Paris" } : box,
  );
  assert.equal(
    edited.find((b) => b.id === AUTO_CAPTION_BOX_ID).text,
    "Our first night in Paris",
  );
  assert.equal(edited.length, boxes.length);
});

test("refresh replaces only the text; user position edits survive; no-op when current", () => {
  const first = buildAutoCaption(paris);
  let boxes = upsertAutoCaptionBox([titleBox], first, "navyGold");
  // User drags the caption row.
  boxes = boxes.map((box) =>
    box.id === AUTO_CAPTION_BOX_ID ? { ...box, position: { x: 0.5, y: 0.8 } } : box,
  );
  const moved = buildAutoCaption({ ...paris, dateTimeISO: "2025-06-15T20:30:00.000Z" });
  const refreshed = upsertAutoCaptionBox(boxes, moved, "navyGold");
  assert.equal(refreshed.length, boxes.length);
  const box = refreshed.find((b) => b.id === AUTO_CAPTION_BOX_ID);
  assert.equal(box.text, moved);
  assert.deepEqual(box.position, { x: 0.5, y: 0.8 });

  assert.equal(upsertAutoCaptionBox(refreshed, moved, "navyGold"), refreshed);
});

// ─── UI wiring + no-new-system guard ─────────────────────────────────────────

test("both editor surfaces offer Add Caption, gated on an available caption", () => {
  for (const rel of ["../../src/components/EditorExperience.tsx", "../../src/app/MobileCreate.tsx"]) {
    const source = read(rel);
    assert.match(source, /buildAutoCaption\(\{/);
    assert.match(source, /upsertAutoCaptionBox\(textBoxes, autoCaption, selectedStyle, \{/);
    assert.match(source, /resolveShapeMaskFootprint\(/);
    assert.match(source, /\{autoCaption && \(/);
    assert.match(source, /\+ Add Caption/);
  }
});

test("the caption helper introduces no parallel text system", () => {
  const lib = read("../../src/lib/autoCaption.ts");
  assert.doesNotMatch(lib, /useStore|renderStarMap|drawText/);
  assert.match(lib, /from "\.\/styleDefaults"/);
  assert.match(lib, /from "\.\/textStyleBinding"/);
});
