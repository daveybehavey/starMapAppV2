import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyEditorLocationQueryToState,
  hasConfirmedEditorLocation,
  isValidEditorTimeZone,
  parseEditorLocationQuery,
  withEditorLocation,
} from "./editorLocationPrefill.harness.mjs";
import { formatDateTimeForLocation } from "./calendarDatePrefill.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

function paramsFromHref(href) {
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

test("withEditorLocation encodes spaces and punctuation for editor contract", () => {
  const href = withEditorLocation(
    "/editor?mode=quick&source=city-new-york-ny-framed",
    "New York, NY"
  );
  assert.match(href, /^\/editor\?/);
  assert.equal(paramsFromHref(href).get("location"), "New York, NY");
  assert.match(href, /location=New\+York%2C\+NY|location=New%20York%2C%20NY/);

  const punctuated = withEditorLocation(
    "/editor?mode=quick&source=city-st-louis-mo",
    "St. Louis, MO"
  );
  assert.equal(paramsFromHref(punctuated).get("location"), "St. Louis, MO");
  assert.match(punctuated, /St\.|St%2E/);

  const apostrophe = withEditorLocation("/editor?mode=quick&source=city-test", "O'Fallon, IL");
  assert.equal(paramsFromHref(apostrophe).get("location"), "O'Fallon, IL");
});

test("coordinate prefill includes lat/lon/tz and cannot be name-only", () => {
  const href = withEditorLocation("/editor?mode=quick&source=sticky-city-miami-fl", {
    name: "Miami, FL",
    latitude: 25.7617,
    longitude: -80.1918,
    timezone: "America/New_York",
  });
  const params = paramsFromHref(href);
  assert.equal(params.get("location"), "Miami, FL");
  assert.equal(params.get("lat"), "25.7617");
  assert.equal(params.get("lon"), "-80.1918");
  assert.equal(params.get("tz"), "America/New_York");

  const parsed = parseEditorLocationQuery(params);
  assert.equal(parsed?.hasResolvedCoordinates, true);
  assert.equal(parsed?.latitude, 25.7617);
  assert.equal(parsed?.longitude, -80.1918);
  assert.equal(parsed?.timezone, "America/New_York");
  assert.notEqual(parsed?.latitude, 0);
  assert.notEqual(parsed?.longitude, 0);
});

test("name-only query is not treated as coordinate-resolved selected location", () => {
  const href = withEditorLocation(
    "/editor?mode=quick&source=star-map-in-hub&lat=48.8566&lon=2.3522&tz=Europe/Paris",
    "Paris, France"
  );
  const params = paramsFromHref(href);
  assert.equal(params.get("location"), "Paris, France");
  assert.equal(params.get("lat"), null);
  assert.equal(params.get("lon"), null);
  assert.equal(params.get("tz"), null);

  const parsed = parseEditorLocationQuery(params);
  assert.equal(parsed?.hasResolvedCoordinates, false);
  // Must not invent (0,0) as a selected/resolved location.
  assert.equal(Number.isNaN(parsed?.latitude), true);
  assert.equal(Number.isNaN(parsed?.longitude), true);
  assert.equal(parsed?.timezone, "");
});

test("generic location+date does not invent a (0,0) sky selection", () => {
  const parsed = parseEditorLocationQuery(
    new URLSearchParams({ location: "Our Backyard", date: "2024-06-12" })
  );
  assert.equal(parsed?.hasResolvedCoordinates, false);
  assert.equal(Number.isNaN(parsed?.latitude), true);
  assert.equal(Number.isNaN(parsed?.longitude), true);
  // Applying name-only onto a fresh default (0,0) must not promote it to resolved.
  const applied = applyEditorLocationQueryToState(
    { name: "", latitude: 0, longitude: 0, timezone: "UTC" },
    new URLSearchParams({ location: "Our Backyard" })
  );
  assert.equal(applied?.hasResolvedCoordinates, false);
  assert.equal(applied?.name, "Our Backyard");
  assert.equal(applied?.latitude, 0);
  assert.equal(applied?.longitude, 0);
  assert.equal(hasConfirmedEditorLocation(applied), false);
});

test("name-only with date cannot unlock/reveal a (0,0) sky", () => {
  assert.equal(
    hasConfirmedEditorLocation({ name: "Paris, France", latitude: 0, longitude: 0 }),
    false
  );
  assert.equal(
    hasConfirmedEditorLocation({
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
    }),
    true
  );

  const editor = readSrc("components/EditorExperience.tsx");
  const logic = readSrc("hooks/useEditorLogic.ts");
  assert.match(logic, /hasConfirmedEditorLocation\(location\)/);
  assert.match(editor, /hasConfirmedEditorLocation/);
  // Auto-reveal still requires resolved coordinates from the query parser.
  assert.match(editor, /if \(parsed\.hasResolvedCoordinates\)/);
});

test("canonical city overwrites stale draft; name-only preserves restored coordinates", () => {
  const previous = {
    name: "Santorini, Greece",
    latitude: 36.3932,
    longitude: 25.4615,
    timezone: "Europe/Athens",
  };

  const cityParams = new URLSearchParams({
    location: "New York, NY",
    lat: "40.7128",
    lon: "-74.006",
    tz: "America/New_York",
  });
  const applied = applyEditorLocationQueryToState(previous, cityParams);
  assert.equal(applied?.name, "New York, NY");
  assert.equal(applied?.latitude, 40.7128);
  assert.equal(applied?.longitude, -74.006);
  assert.equal(applied?.timezone, "America/New_York");
  assert.equal(applied?.hasResolvedCoordinates, true);
  assert.notEqual(applied?.latitude, previous.latitude);
  assert.notEqual(applied?.longitude, previous.longitude);

  const nameOnly = applyEditorLocationQueryToState(
    previous,
    new URLSearchParams({ location: "Chicago, IL" })
  );
  assert.equal(nameOnly?.name, "Chicago, IL");
  assert.equal(nameOnly?.hasResolvedCoordinates, false);
  // Legacy name-only: must not wipe restored valid coordinates into (0,0).
  assert.equal(nameOnly?.latitude, previous.latitude);
  assert.equal(nameOnly?.longitude, previous.longitude);
  assert.equal(nameOnly?.timezone, previous.timezone);
});

test("invalid timezone never stores crashing Intl zone; valid timezone still works", () => {
  assert.equal(isValidEditorTimeZone("America/New_York"), true);
  assert.equal(isValidEditorTimeZone("Not/AZone"), false);
  assert.equal(isValidEditorTimeZone(""), false);

  const invalid = parseEditorLocationQuery(
    new URLSearchParams({
      location: "Somewhere",
      lat: "1",
      lon: "1",
      tz: "Not/AZone",
    })
  );
  assert.equal(invalid?.hasResolvedCoordinates, true);
  assert.equal(invalid?.latitude, 1);
  assert.equal(invalid?.longitude, 1);
  // Documented safe fallback — never store the invalid string.
  assert.equal(invalid?.timezone, "UTC");
  assert.equal(isValidEditorTimeZone(invalid.timezone), true);
  assert.doesNotThrow(() => {
    const formatted = formatDateTimeForLocation("2024-06-12T12:00:00.000Z", invalid.timezone);
    assert.ok(formatted);
  });

  // Defense in depth: even a raw invalid zone must not throw through format helper.
  assert.equal(formatDateTimeForLocation("2024-06-12T12:00:00.000Z", "Not/AZone"), null);

  const valid = parseEditorLocationQuery(
    new URLSearchParams({
      location: "New York, NY",
      lat: "40.7128",
      lon: "-74.006",
      tz: "America/New_York",
    })
  );
  assert.equal(valid?.hasResolvedCoordinates, true);
  assert.equal(valid?.timezone, "America/New_York");
  assert.doesNotThrow(() => {
    const formatted = formatDateTimeForLocation("2024-06-12T16:00:00.000Z", valid.timezone);
    assert.ok(formatted);
  });
});

test("withEditorLocation is a no-op for empty location (non-city / generic paths)", () => {
  const base = "/editor?mode=quick&source=star-map-in-hub";
  assert.equal(withEditorLocation(base, undefined), base);
  assert.equal(withEditorLocation(base, null), base);
  assert.equal(withEditorLocation(base, ""), base);
  assert.equal(withEditorLocation(base, "   "), base);
  assert.equal(paramsFromHref(withEditorLocation(base, undefined)).get("location"), null);
});

test("PreviewStartForm prefills editable location and optional coords without locking", () => {
  const source = readSrc("components/PreviewStartForm.tsx");
  assert.match(source, /defaultLocation\?: string/);
  assert.match(source, /defaultLocationCoords\?:/);
  assert.match(source, /defaultValue=\{initialLocation \|\| undefined\}/);
  assert.match(source, /name="lat"/);
  assert.match(source, /name="lon"/);
  assert.match(source, /name="tz"/);
  assert.match(source, /syncCoordsForEditedLocation/);
  assert.match(source, /id="preview-location"/);
  assert.match(source, /name="location"/);
  assert.doesNotMatch(source, /id="preview-location"[\s\S]{0,500}\breadOnly\b/);
  assert.doesNotMatch(source, /id="preview-location"[\s\S]{0,500}\bdisabled\b/);
});

test("city landing page wires coordinate-resolved prefill into primary CTAs", () => {
  const page = readSrc("app/star-map-in/[slug]/page.tsx");
  assert.match(page, /resolveSeoLocationEditorPrefill/);
  assert.match(page, /defaultLocation=\{locationPrefill\.name\}/);
  assert.match(page, /defaultLocationCoords=\{/);
  assert.match(page, /framedCtaHref = withEditorLocation\([\s\S]*locationPrefill/);
  assert.match(page, /stickyPrimaryHref = withEditorLocation\([\s\S]*locationPrefill/);
  assert.match(page, /location=\{locationPrefill\}/);
  assert.match(page, /href=\{framedCtaHref\}/);

  const editor = readSrc("components/EditorExperience.tsx");
  assert.match(editor, /parseEditorLocationQuery/);
  assert.match(editor, /parsed\.hasResolvedCoordinates/);
  // Only resolved city queries count as location for auto-reveal.
  assert.match(editor, /hasLocation = true/);
  assert.match(editor, /setLocation\(\{\s*name: parsed\.name\s*\}\)/);
  // Must not overwrite full location for unresolved name-only handoffs.
  assert.match(
    editor,
    /if \(parsed\.hasResolvedCoordinates\)[\s\S]*?setLocation\(\{[\s\S]*?latitude: parsed\.latitude/
  );
});

test("generic / non-city entry paths do not force city coords", () => {
  const hub = readSrc("app/star-map-in/page.tsx");
  assert.doesNotMatch(hub, /defaultLocation=/);
  assert.doesNotMatch(hub, /defaultLocationCoords=/);
  assert.doesNotMatch(hub, /withEditorLocation/);
  assert.match(hub, /source="star-map-in-hub"/);

  const wedding = readSrc("app/wedding/page.tsx");
  assert.doesNotMatch(wedding, /defaultLocation=/);
  assert.doesNotMatch(wedding, /defaultLocationCoords=/);

  const gallery = readSrc("app/star-map-gallery/page.tsx");
  assert.doesNotMatch(gallery, /defaultLocation=/);
  assert.doesNotMatch(gallery, /defaultLocationCoords=/);
});

test("every indexable city slug has canonical coordinates", () => {
  const indexing = readSrc("data/seoIndexing.ts");
  const coords = readSrc("data/seoLocationCoordinates.ts");
  const slugs = [...indexing.matchAll(/"([a-z0-9-]+)"/g)]
    .map((match) => match[1])
    .filter((slug) => slug.includes("-") || ["new-york-ny"].includes(slug));

  // Pull INDEXABLE_LOCATION_SLUGS block specifically.
  const block = indexing.match(/INDEXABLE_LOCATION_SLUGS = \[([\s\S]*?)\] as const/);
  assert.ok(block);
  const indexable = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(indexable.length >= 20);
  for (const slug of indexable) {
    assert.match(coords, new RegExp(`"${slug}"\\s*:`), `missing coords for ${slug}`);
  }
  // Silence unused if filter above unused in some environments
  assert.ok(Array.isArray(slugs));
});
