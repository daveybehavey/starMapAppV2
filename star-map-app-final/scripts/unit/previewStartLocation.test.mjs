import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolvePreviewLocationFields } from "./previewStartLocation.harness.mjs";
import { parseEditorLocationQuery } from "./editorLocationPrefill.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

// A fixture place as /api/geocode returns it (Nominatim display_name) and
// as a typeahead pick resolves it (timezone via tz-lookup in the client).
const FIXTURE_PICK = {
  name: "Paris, Île-de-France, France",
  latitude: 48.8566,
  longitude: 2.3522,
  timezone: "Europe/Paris",
};

function paramsFromFields(fields) {
  const params = new URLSearchParams();
  params.set("location", fields.location);
  if (fields.lat !== undefined) params.set("lat", fields.lat);
  if (fields.lon !== undefined) params.set("lon", fields.lon);
  if (fields.tz !== undefined) params.set("tz", fields.tz);
  return params;
}

test("picked suggestion submits the coordinate-resolved payload", () => {
  const fields = resolvePreviewLocationFields({
    locationText: FIXTURE_PICK.name,
    picked: FIXTURE_PICK,
    defaultCoords: null,
    initialLocation: "",
  });
  assert.deepEqual(fields, {
    location: FIXTURE_PICK.name,
    lat: "48.8566",
    lon: "2.3522",
    tz: "Europe/Paris",
  });

  // The editor parses it as a resolved selection, like a prefilled city.
  const parsed = parseEditorLocationQuery(paramsFromFields(fields));
  assert.equal(parsed.hasResolvedCoordinates, true);
  assert.equal(parsed.name, FIXTURE_PICK.name);
  assert.equal(parsed.latitude, FIXTURE_PICK.latitude);
  assert.equal(parsed.longitude, FIXTURE_PICK.longitude);
  assert.equal(parsed.timezone, FIXTURE_PICK.timezone);
});

test("picked payload is identical to the previous coordinate-resolved submit", () => {
  // Previous form: a city landing prefilled name + hidden lat/lon/tz from
  // defaultLocationCoords. New form: the same place picked from the
  // typeahead. Both routes through the helper must yield the same fields.
  const viaPick = resolvePreviewLocationFields({
    locationText: FIXTURE_PICK.name,
    picked: FIXTURE_PICK,
    defaultCoords: null,
    initialLocation: "",
  });
  const viaDefaults = resolvePreviewLocationFields({
    locationText: FIXTURE_PICK.name,
    picked: null,
    defaultCoords: {
      latitude: FIXTURE_PICK.latitude,
      longitude: FIXTURE_PICK.longitude,
      timezone: FIXTURE_PICK.timezone,
    },
    initialLocation: FIXTURE_PICK.name,
  });
  assert.deepEqual(viaPick, viaDefaults);
});

test("editing the text after picking un-resolves the place (name-only submit)", () => {
  const fields = resolvePreviewLocationFields({
    locationText: "Paris, Texas",
    picked: FIXTURE_PICK,
    defaultCoords: null,
    initialLocation: "",
  });
  assert.deepEqual(fields, { location: "Paris, Texas" });

  const parsed = parseEditorLocationQuery(paramsFromFields(fields));
  assert.equal(parsed.hasResolvedCoordinates, false);
  assert.equal(parsed.latitude, 0);
  assert.equal(parsed.longitude, 0);
  assert.equal(parsed.timezone, "UTC");
});

test("free-typed location with no pick and no defaults stays name-only", () => {
  const fields = resolvePreviewLocationFields({
    locationText: "Somewhere I have not picked",
    picked: null,
    defaultCoords: null,
    initialLocation: "",
  });
  assert.deepEqual(fields, { location: "Somewhere I have not picked" });
});

test("landing defaults apply only while the text matches the prefill", () => {
  const defaults = { latitude: 49.2827, longitude: -123.1207, timezone: "America/Vancouver" };
  const untouched = resolvePreviewLocationFields({
    locationText: "Vancouver, BC",
    picked: null,
    defaultCoords: defaults,
    initialLocation: "Vancouver, BC",
  });
  assert.deepEqual(untouched, {
    location: "Vancouver, BC",
    lat: "49.2827",
    lon: "-123.1207",
    tz: "America/Vancouver",
  });

  const edited = resolvePreviewLocationFields({
    locationText: "Vancouver, WA",
    picked: null,
    defaultCoords: defaults,
    initialLocation: "Vancouver, BC",
  });
  assert.deepEqual(edited, { location: "Vancouver, WA" });
});

test("quick-start form wires the typeahead and keeps the submit contract", () => {
  const form = readSrc("components/PreviewStartForm.tsx");
  assert.match(form, /import LocationTypeahead from "@\/components\/LocationTypeahead";/);
  assert.match(form, /resolvePreviewLocationFields/);
  assert.match(form, /<LocationTypeahead/);
  assert.match(form, /id="preview-location"/);
  assert.match(form, /name="location"/);
  // Hidden coordinate fields still submit under the same names.
  assert.match(form, /name="lat"/);
  assert.match(form, /name="lon"/);
  assert.match(form, /name="tz"/);
  // The pre-existing submit validation copy is unchanged.
  assert.match(form, /Enter date and location first\./);
  assert.match(form, /syncCoordsForEditedLocation/);
});

test("typeahead and editor search share one geocode module", () => {
  const typeahead = readSrc("components/LocationTypeahead.tsx");
  assert.match(typeahead, /from "@\/lib\/geocodeSearch"/);
  assert.match(typeahead, /role="combobox"/);
  assert.match(typeahead, /name=\{name\}/);

  const editorSearch = readSrc("components/LocationSearch.tsx");
  assert.match(editorSearch, /from "@\/lib\/geocodeSearch"/);
  // The endpoint lives in the shared module only — no private copies.
  assert.doesNotMatch(editorSearch, /api\/geocode\?q=/);
  assert.doesNotMatch(typeahead, /api\/geocode\?q=/);
  assert.doesNotMatch(editorSearch, /tz-lookup/);
});
