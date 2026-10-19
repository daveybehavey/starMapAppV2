/**
 * Wave A (persona sweep U01/U07/U12): the editor's date/time path is
 * place-based. The Date/Time fields display and edit the wall-clock time
 * AT THE PLACE (location.timezone), combining resolves in the place's
 * timezone, an emptied mobile date field restores the stored date at
 * blur, and the mobile checklist/unlock copy use the confirmed-place
 * predicate like the desktop editor.
 *
 * Behaviour tests run against the real libs; component wiring is pinned
 * from source, per repo convention.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { combineDateTime, resolveDateInputBlurValue } from "../../src/lib/dateInput.ts";
import {
  formatDateTimeForLocation,
  maybeRebaseUntouchedDefaultOnTimezoneChange,
  parseCalendarDateParamToIso,
} from "../../src/lib/dateTime.ts";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

test("U01: entering 21:00 for Europe/Paris stores the instant that is 21:00 in Paris", () => {
  // The fleet repro: a Vancouver visitor typing 21:00 for Paris stored
  // 2019-07-15T04:00Z (06:00 in Paris) through the device-local path.
  const iso = combineDateTime("2019-07-14", "21:00:00", "Europe/Paris");
  assert.equal(iso, "2019-07-14T19:00:00.000Z"); // 21:00 CEST = 19:00Z
  // And the fields read that instant back as 2019-07-14 21:00 at the place.
  assert.deepEqual(formatDateTimeForLocation(iso, "Europe/Paris"), {
    date: "2019-07-14",
    time: "21:00",
  });
});

test("U01: a Sydney date displays as that calendar date in the fields", () => {
  // The fleet repro: /star-map-in/sydney-au for 2019-07-14 showed
  // 07/13/2019 07:00 PM through the device-local path.
  const prefillIso = parseCalendarDateParamToIso("2019-07-14", "Australia/Sydney");
  assert.ok(prefillIso);
  const shown = formatDateTimeForLocation(prefillIso, "Australia/Sydney");
  assert.equal(shown?.date, "2019-07-14");
  assert.equal(shown?.time, "12:00");

  const eveningIso = combineDateTime("2019-07-14", "21:00:00", "Australia/Sydney");
  assert.equal(eveningIso, "2019-07-14T11:00:00.000Z"); // AEST is UTC+10 in July
  assert.deepEqual(formatDateTimeForLocation(eveningIso, "Australia/Sydney"), {
    date: "2019-07-14",
    time: "21:00",
  });
});

test("U01: an untouched evening default rebases to 21:00 in the new place's zone", () => {
  const vancouverDefault = combineDateTime("2026-10-19", "21:00:00", "America/Vancouver");
  assert.ok(vancouverDefault);
  const rebased = maybeRebaseUntouchedDefaultOnTimezoneChange({
    dateTimeIso: vancouverDefault,
    previousTimezone: "America/Vancouver",
    nextTimezone: "Europe/Paris",
    dateTimeIsUntouchedDefault: true,
  });
  assert.deepEqual(formatDateTimeForLocation(rebased, "Europe/Paris"), {
    date: "2026-10-19",
    time: "21:00",
  });
});

test("U01: a user-set (preset/sample) instant is never rebased or rewritten on place change", () => {
  const presetIso = combineDateTime("2019-07-14", "21:00:00", "Europe/Paris");
  assert.ok(presetIso);
  const afterPlaceChange = maybeRebaseUntouchedDefaultOnTimezoneChange({
    dateTimeIso: presetIso,
    previousTimezone: "Europe/Paris",
    nextTimezone: "Australia/Sydney",
    dateTimeIsUntouchedDefault: false,
  });
  assert.equal(afterPlaceChange, presetIso);
});

test("U01: DateTimeControls derives its fields from the place timezone and never writes on render", () => {
  const controls = readSrc("components/DateTimeControls.tsx");
  // Field values come from the place-zone rendering of the stored instant.
  assert.match(controls, /formatDateTimeForLocation\(dateTime, timezone\)/);
  // Combining goes through the timezone-aware branch with the same prop.
  assert.match(controls, /combineDateTime\(value, timeValue, timezone\)/);
  // The summary box is the place-local rendering under the place's zone name.
  assert.match(controls, /Local time in \{timezoneLabel\}/);
  // Display is presentational only: no effect rewrites the stored instant
  // (restored drafts and preset instants keep their exact instant).
  assert.doesNotMatch(controls, /useEffect/);
  assert.equal((controls.match(/onChange\(iso\)/g) ?? []).length, 2);
});

test("U01: all three editor render sites pass the location's timezone", () => {
  const desktop = readSrc("components/EditorExperience.tsx");
  assert.match(
    desktop,
    /<DateTimeControls\s+dateTime=\{dateTime\}\s+onChange=\{handleDateTimeChange\}\s+timezone=\{location\.timezone\}\s*\/>/,
  );
  const mobile = readSrc("app/MobileCreate.tsx");
  assert.equal((mobile.match(/timezone=\{location\.timezone\}/g) ?? []).length, 2);
});

test("U12: an emptied date field restores the stored date at blur; typed entries stay", () => {
  assert.equal(resolveDateInputBlurValue("", "2026-10-19"), "2026-10-19");
  assert.equal(resolveDateInputBlurValue("2024-03-15", "2026-10-19"), "2024-03-15");
  assert.equal(resolveDateInputBlurValue("", undefined), "");
  const input = readSrc("components/IOSSafeDateInput.tsx");
  assert.match(input, /resolveDateInputBlurValue\(/);
});

test("U07: mobile checklist and unlock copy use the confirmed-place predicate, matching desktop", () => {
  const mobile = readSrc("app/MobileCreate.tsx");
  assert.match(mobile, /label: "Date \+ place", done: hasDate && hasConfirmedLocation/);
  assert.doesNotMatch(mobile, /done: hasDate && hasLocation/);
  assert.match(mobile, /"Confirm your place to unlock preview"/);
  assert.match(mobile, /"Confirm your place from suggestions to unlock preview\. Presets optional\."/);
  // The first branch keys off the confirmed predicate too, like desktop.
  assert.match(mobile, /const previewUnlockButtonLabel = !hasDate && !hasConfirmedLocation/);
});
