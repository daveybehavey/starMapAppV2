import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyEditorLocationQueryToState,
  parseEditorLocationQuery,
  withEditorLocation,
} from "./editorLocationPrefill.harness.mjs";

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
  assert.equal(parsed?.latitude, 0);
  assert.equal(parsed?.longitude, 0);
  assert.equal(parsed?.timezone, "UTC");
});

test("stale draft coordinates cannot survive under a new selected city name", () => {
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
  assert.equal(nameOnly?.latitude, 0);
  assert.equal(nameOnly?.longitude, 0);
  assert.equal(nameOnly?.timezone, "UTC");
  assert.notEqual(nameOnly?.latitude, previous.latitude);
  assert.notEqual(nameOnly?.longitude, previous.longitude);
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
  assert.match(editor, /latitude: parsed\.latitude/);
  assert.match(editor, /longitude: parsed\.longitude/);
  assert.match(editor, /timezone: parsed\.timezone/);
  // Generic name-only handoffs still reveal; city CTAs supply coords so sky is correct.
  assert.doesNotMatch(editor, /hasLocation = parsed\.hasResolvedCoordinates/);
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
