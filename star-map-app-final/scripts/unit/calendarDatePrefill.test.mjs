import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatDateTimeForLocation,
  parseCalendarDateParamToIso,
} from "./calendarDatePrefill.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

test("city-timezone date parse keeps the requested local calendar date across large offsets", () => {
  // Codex P1 reproduction: LA-browser noon ISO for June 12 becomes June 13 in Tokyo.
  const buggyBrowserNoonIso = "2024-06-12T19:00:00.000Z"; // 12:00 America/Los_Angeles (PDT)
  assert.equal(formatDateTimeForLocation(buggyBrowserNoonIso, "Asia/Tokyo")?.date, "2024-06-13");

  const tokyoIso = parseCalendarDateParamToIso("2024-06-12", "Asia/Tokyo");
  assert.ok(tokyoIso);
  const tokyoLocal = formatDateTimeForLocation(tokyoIso, "Asia/Tokyo");
  assert.equal(tokyoLocal?.date, "2024-06-12");
  assert.equal(tokyoLocal?.time, "12:00");

  const laIso = parseCalendarDateParamToIso("2024-06-12", "America/Los_Angeles");
  assert.ok(laIso);
  const laLocal = formatDateTimeForLocation(laIso, "America/Los_Angeles");
  assert.equal(laLocal?.date, "2024-06-12");
  assert.equal(laLocal?.time, "12:00");

  // Materially different zones both preserve the same requested calendar date.
  assert.notEqual(tokyoIso, laIso);
  assert.equal(
    formatDateTimeForLocation(tokyoIso, "Asia/Tokyo")?.date,
    formatDateTimeForLocation(laIso, "America/Los_Angeles")?.date
  );
});

test("Sydney vs New York city timezones preserve the same requested calendar date", () => {
  const date = "2023-12-31";
  const sydneyIso = parseCalendarDateParamToIso(date, "Australia/Sydney");
  const nyIso = parseCalendarDateParamToIso(date, "America/New_York");
  assert.ok(sydneyIso);
  assert.ok(nyIso);
  assert.equal(formatDateTimeForLocation(sydneyIso, "Australia/Sydney")?.date, date);
  assert.equal(formatDateTimeForLocation(nyIso, "America/New_York")?.date, date);
  assert.notEqual(sydneyIso, nyIso);
});

test("generic/non-city date parse without timezone keeps browser-local noon behavior", () => {
  const iso = parseCalendarDateParamToIso("2024-06-12", null);
  assert.ok(iso);
  const local = new Date(2024, 5, 12, 12, 0, 0, 0);
  assert.equal(iso, local.toISOString());
  assert.equal(parseCalendarDateParamToIso("2024-06-31", "Asia/Tokyo"), null);
  assert.equal(parseCalendarDateParamToIso("not-a-date", "Asia/Tokyo"), null);
});

test("EditorExperience uses city timezone for coordinate-resolved date prefill", () => {
  const editor = readSrc("components/EditorExperience.tsx");
  assert.match(editor, /parseCalendarDateParamToIso/);
  assert.match(editor, /resolvedCityTimeZone/);
  assert.match(editor, /parseCalendarDateParamToIso\(dateParam, resolvedCityTimeZone\)/);
  assert.doesNotMatch(editor, /function parseDateParamToIso/);
  // Location is applied before date so city TZ is available.
  const locationIdx = editor.indexOf("parseEditorLocationQuery(searchParams)");
  const dateIdx = editor.indexOf("parseCalendarDateParamToIso(dateParam, resolvedCityTimeZone)");
  assert.ok(locationIdx > 0 && dateIdx > locationIdx);
  // Only resolved coordinates promote city timezone for date parsing / reveal.
  assert.match(editor, /if \(parsed\.hasResolvedCoordinates\)/);
  assert.match(editor, /resolvedCityTimeZone = parsed\.timezone/);
});

test("invalid timezone cannot crash formatDateTimeForLocation via Intl", () => {
  assert.equal(formatDateTimeForLocation("2024-06-12T12:00:00.000Z", "Not/AZone"), null);
  assert.ok(formatDateTimeForLocation("2024-06-12T12:00:00.000Z", "America/New_York"));
});
