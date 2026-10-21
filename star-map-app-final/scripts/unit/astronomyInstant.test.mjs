/**
 * E-1: the renderer must consume the stored instant exactly.
 *
 * Before the fix, computeSky / computeGalacticBandAngle / the astronomy
 * worker formatted recipe.datetimeISO into wall-clock fields in the
 * location zone (formatDateTimeForLocation) and computeVisibleStars rebuilt
 * the instant from those fields via toUTCDateFromLocal, which samples the
 * zone offset once at a probe instant. On DST transition days the probe and
 * the true instant sit on opposite sides of the transition, so the rebuilt
 * instant is off by the zone's DST delta (±60 min in America/New_York) —
 * e.g. a stored 2026-03-08 03:30 EDT instant rendered the 04:30 EDT sky.
 * In the fall-back fold the wall fields cannot even name which occurrence
 * of 01:30 was stored, so no wall reconstruction can ever be right there.
 *
 * These tests pin the astronomy layer's contract:
 *  - a `datetimeISO` param is computed as `new Date(iso)` — proven by
 *    equality with a direct-UTC-frame computation of the same instant;
 *  - the legacy wall-field path (genuine wall-time inputs) is byte-for-byte
 *    the pre-fix behaviour, including its transition-window quirk;
 *  - ordinary days and fixed-offset zones are bit-identical either way.
 *
 * The galactic-band / worker / computeSky wiring is pinned at source level
 * (same precedent as checkoutSkyGuard's source pins).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

// astronomy.ts uses extensionless sibling imports and catalog JSON; the
// shared loader hooks resolve both for the plain-Node runner.
register("./tsAliasLoader.mjs", import.meta.url);

const { computeVisibleStars } = await import("../../src/lib/astronomy.ts");

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

const NY = { lat: 40.7128, lon: -74.006, timezone: "America/New_York" };
const W = 800;
const H = 800;

/** Sky for a stored instant through the new exact path. */
function skyForInstant(datetimeISO, at = NY) {
  return computeVisibleStars(
    { datetimeISO, lat: at.lat, lon: at.lon },
    W,
    H,
  );
}

/** Sky through the legacy wall-field path (pre-fix rendering route). */
function skyForWall(date, time, at = NY) {
  return computeVisibleStars(
    { date, time, lat: at.lat, lon: at.lon, timezone: at.timezone },
    W,
    H,
  );
}

/**
 * Direct-Date oracle: the same instant computed through the wall path in
 * the UTC frame, where reconstruction is exact (offset is always zero).
 * Equality with this is equality with `new Date(iso)` computation.
 */
function skyOracle(iso) {
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return computeVisibleStars(
    { date, time, lat: NY.lat, lon: NY.lon, timezone: "UTC" },
    W,
    H,
  );
}

test("E-1 spring forward: stored 2026-03-08 03:30 EDT renders the 03:30 sky, not 04:30", () => {
  const iso = "2026-03-08T07:30:00.000Z"; // 03:30 EDT, after the 02:00→03:00 jump
  const exact = skyForInstant(iso);
  assert.ok(exact.stars.length > 0, "expected a non-empty sky for the proof instant");
  // The instant path computes exactly the instant.
  assert.deepEqual(exact, skyOracle(iso));
  // The pre-fix route rendered this stored instant one hour late.
  const legacy = skyForWall("2026-03-08", "03:30");
  assert.notDeepEqual(exact, legacy);
  // …and the wall path itself is untouched: it still resolves those wall
  // fields to 08:30Z (04:30 EDT), the pre-fix behaviour, pinned.
  assert.deepEqual(legacy, skyOracle("2026-03-08T08:30:00.000Z"));
});

test("E-1 fall back: the fold hour's second occurrence renders its own sky", () => {
  const secondOccurrence = "2026-11-01T06:30:00.000Z"; // 01:30 EST (2nd)
  const firstOccurrence = "2026-11-01T05:30:00.000Z"; // 01:30 EDT (1st)
  const exactSecond = skyForInstant(secondOccurrence);
  assert.ok(exactSecond.stars.length > 0, "expected a non-empty sky for the fold instant");
  assert.deepEqual(exactSecond, skyOracle(secondOccurrence));
  // Wall fields "2026-11-01 01:30" cannot name the second occurrence: the
  // legacy path deterministically renders the first occurrence's sky.
  const legacy = skyForWall("2026-11-01", "01:30");
  assert.deepEqual(legacy, skyOracle(firstOccurrence));
  assert.notDeepEqual(exactSecond, legacy);
  // The first occurrence happens to be exact through both paths.
  assert.deepEqual(skyForInstant(firstOccurrence), legacy);
  // Post-fold morning window: a stored 03:30 EST instant rendered an hour
  // early pre-fix; the instant path is exact.
  const morning = "2026-11-01T08:30:00.000Z"; // 03:30 EST
  assert.deepEqual(skyForInstant(morning), skyOracle(morning));
  assert.notDeepEqual(skyForInstant(morning), skyForWall("2026-11-01", "03:30"));
});

test("E-1 control: ordinary day is bit-identical through both paths", () => {
  const iso = "2026-06-16T01:00:00.000Z"; // Jun 15 21:00 EDT, no transition nearby
  const exact = skyForInstant(iso);
  assert.ok(exact.stars.length > 0, "expected a non-empty sky for the control instant");
  assert.deepEqual(exact, skyForWall("2026-06-15", "21:00"));
  assert.deepEqual(exact, skyOracle(iso));
});

test("E-1 control: fixed-offset zone (no DST) is bit-identical through both paths", () => {
  const phoenix = { lat: 33.4484, lon: -112.074, timezone: "America/Phoenix" };
  const iso = "2026-03-08T10:30:00.000Z"; // 03:30 MST — NY's transition day, Phoenix has none
  const exact = skyForInstant(iso, phoenix);
  assert.ok(exact.stars.length > 0, "expected a non-empty sky for the Phoenix control");
  assert.deepEqual(exact, skyForWall("2026-03-08", "03:30", phoenix));
});

test("E-1: an invalid datetimeISO yields the empty sky, not a crash", () => {
  const sky = skyForInstant("not-a-date");
  assert.deepEqual(sky, { stars: [], planets: [], moon: null, constellations: [] });
});

test("E-1 source pins: every render entry path consumes the instant directly", () => {
  const renderSky = readSrc("lib/renderSky.ts");
  const computeSkyBody = renderSky.slice(
    renderSky.indexOf("export function computeSky"),
    renderSky.indexOf("export function buildRecipeFromState"),
  );
  assert.match(computeSkyBody, /datetimeISO: recipe\.datetimeISO/);
  assert.ok(
    !computeSkyBody.includes("formatDateTimeForLocation"),
    "computeSky must not rebuild the instant from wall fields",
  );

  const bandBody = renderSky.slice(
    renderSky.indexOf("function computeGalacticBandAngle"),
    renderSky.indexOf("function projectRaDec"),
  );
  assert.match(bandBody, /new Date\(recipe\.datetimeISO\)/);
  assert.ok(
    !bandBody.includes("toUTCDateFromLocal") && !bandBody.includes("formatDateTimeForLocation"),
    "computeGalacticBandAngle must not rebuild the instant from wall fields",
  );

  const worker = readSrc("workers/astronomy.worker.ts");
  assert.match(worker, /datetimeISO: dateTime/);
  assert.ok(
    !worker.includes("formatDateTimeForLocation"),
    "the astronomy worker must not rebuild the instant from wall fields",
  );
});
