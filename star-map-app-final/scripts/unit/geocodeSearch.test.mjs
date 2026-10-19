import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeGeocodeResults, shortenGeocodePlaceName } from "./geocodeSearch.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

// U10 (persona sweep 2026-10-19): suggestion rows showed raw Nominatim
// display names — district, postcode, "France métropolitaine" — and the
// editor stored that full string on the map (U06). The shared geocode
// layer now shortens names once, for both the quick-start typeahead and
// the editor's LocationSearch, so a pick in either stores the same name.

test("shortenGeocodePlaceName drops the metropolitan qualifier segment", () => {
  assert.equal(
    shortenGeocodePlaceName("Paris, Île-de-France, France métropolitaine, France"),
    "Paris, Île-de-France, France"
  );
});

test("shortenGeocodePlaceName drops regional-district and postcode segments", () => {
  assert.equal(
    shortenGeocodePlaceName("Tofino, Alberni-Clayoquot Regional District, British Columbia, V0R 2Z0, Canada"),
    "Tofino, British Columbia, Canada"
  );
});

test("shortenGeocodePlaceName drops UK postcodes and keeps city, region, country", () => {
  assert.equal(
    shortenGeocodePlaceName("Llanfairpwllgwyngyll, Ynys Môn, Cymru / Wales, LL61 5TX, United Kingdom"),
    "Llanfairpwllgwyngyll, Ynys Môn, United Kingdom"
  );
});

test("shortenGeocodePlaceName drops US county and ZIP segments", () => {
  assert.equal(
    shortenGeocodePlaceName("Austin, Travis County, Texas, 78701, United States"),
    "Austin, Texas, United States"
  );
});

test("shortenGeocodePlaceName preserves a leading house number on address results", () => {
  // Codex P2 on PR #335: LocationSearch supports address searches and
  // stores result.name, so the leading segment can be a house number.
  // Stripping it on numeric shape alone ("1600" matches the bare-numeric
  // postcode pattern) loses the address — and merges 1600/1601 into one
  // label. Postcode stripping applies only past the first segment,
  // like the admin-noise rule; the trailing ZIP still drops.
  assert.equal(
    shortenGeocodePlaceName(
      "1600, Pennsylvania Avenue Northwest, Washington, District of Columbia, 20500, United States"
    ),
    "1600, Pennsylvania Avenue Northwest, United States"
  );
  assert.equal(
    shortenGeocodePlaceName(
      "1601, Pennsylvania Avenue Northwest, Washington, District of Columbia, 20500, United States"
    ),
    "1601, Pennsylvania Avenue Northwest, United States"
  );
  assert.notEqual(
    shortenGeocodePlaceName(
      "1600, Pennsylvania Avenue Northwest, Washington, District of Columbia, 20500, United States"
    ),
    shortenGeocodePlaceName(
      "1601, Pennsylvania Avenue Northwest, Washington, District of Columbia, 20500, United States"
    )
  );
});

test("shortenGeocodePlaceName leaves already-short names untouched", () => {
  assert.equal(shortenGeocodePlaceName("Paris, France"), "Paris, France");
  assert.equal(
    shortenGeocodePlaceName("Victoria, British Columbia, Canada"),
    "Victoria, British Columbia, Canada"
  );
  assert.equal(shortenGeocodePlaceName("Paris"), "Paris");
});

test("shortenGeocodePlaceName never empties a name made only of droppable segments", () => {
  assert.equal(shortenGeocodePlaceName("V0R 2Z0"), "V0R 2Z0");
  assert.equal(
    shortenGeocodePlaceName("Alberni-Clayoquot Regional District"),
    "Alberni-Clayoquot Regional District"
  );
});

test("shortenGeocodePlaceName collapses duplicate segments", () => {
  assert.equal(shortenGeocodePlaceName("Singapore, Singapore"), "Singapore");
});

test("normalizeGeocodeResults drops exact duplicates (same name, same coordinates)", () => {
  // The U10 fixture: "Paris" returned 4 rows, two of them identical.
  const results = normalizeGeocodeResults([
    { id: 1, name: "Paris, Île-de-France, France métropolitaine, France", latitude: 48.8589, longitude: 2.32 },
    { id: 2, name: "Paris, Île-de-France, France métropolitaine, France", latitude: 48.8589, longitude: 2.32 },
    { id: 3, name: "Paris, Texas, United States", latitude: 33.6609, longitude: -95.5555 },
    { id: 4, name: "Paris, Île-de-France, France", latitude: 48.8566, longitude: 2.3522 },
  ]);
  assert.deepEqual(
    results.map((r) => r.id),
    [1, 3, 4]
  );
  // Trimmed names land on every surviving row.
  assert.equal(results[0].name, "Paris, Île-de-France, France");
  // Distinct places that share a name (or a city) are NOT merged:
  // Paris, Texas survives, and the second Paris, France at different
  // coordinates survives.
  assert.equal(results[1].name, "Paris, Texas, United States");
  assert.equal(results[2].name, "Paris, Île-de-France, France");
});

test("normalizeGeocodeResults keeps different house numbers at one address distinct", () => {
  // Same street, same coordinates, different house numbers: with the
  // leading number preserved these are two distinct labels and both
  // survive dedupe; stripped, they would collapse into a single row.
  const results = normalizeGeocodeResults([
    {
      id: 1,
      name: "1600, Pennsylvania Avenue Northwest, Washington, District of Columbia, 20500, United States",
      latitude: 38.8977,
      longitude: -77.0365,
    },
    {
      id: 2,
      name: "1601, Pennsylvania Avenue Northwest, Washington, District of Columbia, 20500, United States",
      latitude: 38.8977,
      longitude: -77.0365,
    },
  ]);
  assert.deepEqual(
    results.map((r) => r.id),
    [1, 2]
  );
  assert.equal(results[0].name, "1600, Pennsylvania Avenue Northwest, United States");
  assert.equal(results[1].name, "1601, Pennsylvania Avenue Northwest, United States");
});

test("geocode normalization lives in the shared layer both surfaces consume", () => {
  const lib = readSrc("lib/geocodeSearch.ts");
  // fetchGeocodeResults normalizes before caching, so fetch and cache
  // reads in both components return deduped, shortened results.
  assert.match(lib, /normalizeGeocodeResults\(\(await res\.json\(\)\) as GeocodeResult\[\]\)/);
  assert.match(lib, /export function shortenGeocodePlaceName/);
  assert.match(lib, /export function normalizeGeocodeResults/);

  // Neither surface forks its own trimming — both read from the shared lib.
  for (const component of ["components/LocationTypeahead.tsx", "components/LocationSearch.tsx"]) {
    const source = readSrc(component);
    assert.match(source, /from "@\/lib\/geocodeSearch"/);
    assert.equal(/shortenGeocodePlaceName|normalizeGeocodeResults/.test(source), false);
  }
});
