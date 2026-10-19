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

test("P1 regression (Codex repro): a Paris probe landing on midnight stays on the entered date", () => {
  // combineDateTime probes the zone offset with the entered wall fields
  // read as UTC; 2019-07-14T22:00Z is 2019-07-15 00:00 in Paris. Engines
  // whose parts formatter reports that midnight as hour 24 with the day
  // already advanced made Date.UTC count the day twice, returning
  // 2019-07-13T20:00:00.000Z — one day early. The converter normalizes
  // hour 24 -> 0 (as dateTime.ts's zoned helper already did).
  const iso = combineDateTime("2019-07-14", "22:00:00", "Europe/Paris");
  assert.equal(iso, "2019-07-14T20:00:00.000Z"); // 22:00 CEST = 20:00Z
  assert.deepEqual(formatDateTimeForLocation(iso, "Europe/Paris"), {
    date: "2019-07-14",
    time: "22:00",
  });
});

test("P1 regression: midnight-crossing probes in Sydney and New York stay on the entered date", () => {
  // 2019-07-14T14:00Z is 2019-07-15 00:00 in Sydney (AEST, UTC+10).
  const sydneyIso = combineDateTime("2019-07-14", "14:00:00", "Australia/Sydney");
  assert.equal(sydneyIso, "2019-07-14T04:00:00.000Z"); // 14:00 AEST = 04:00Z
  assert.deepEqual(formatDateTimeForLocation(sydneyIso, "Australia/Sydney"), {
    date: "2019-07-14",
    time: "14:00",
  });

  // 2019-07-14T04:00Z is 2019-07-14 00:00 in New York (EDT, UTC-4).
  const newYorkIso = combineDateTime("2019-07-14", "04:00:00", "America/New_York");
  assert.equal(newYorkIso, "2019-07-14T08:00:00.000Z"); // 04:00 EDT = 08:00Z
  assert.deepEqual(formatDateTimeForLocation(newYorkIso, "America/New_York"), {
    date: "2019-07-14",
    time: "04:00",
  });
});

test("P2-A regression (Codex repro): spring-forward morning resolves with the offset at the resulting instant", () => {
  // combineDateTime sampled the zone offset at the entered wall time read
  // as UTC — still EST on 2026-03-08 — so 03:30 (already EDT) stored
  // 2026-03-08T08:30:00.000Z and read back as 04:30. The offset is now
  // re-sampled at the resulting instant (two-pass resolution).
  const iso = combineDateTime("2026-03-08", "03:30:00", "America/New_York");
  assert.equal(iso, "2026-03-08T07:30:00.000Z"); // 03:30 EDT = 07:30Z
  assert.deepEqual(formatDateTimeForLocation(iso, "America/New_York"), {
    date: "2026-03-08",
    time: "03:30",
  });
});

test("P2-A regression: fall-back morning resolves to the post-transition offset", () => {
  // The single-pass probe read 2026-11-01T03:30Z as EDT and stored
  // 07:30Z, which reads back as 02:30 EST. 03:30 that day is EST.
  const iso = combineDateTime("2026-11-01", "03:30:00", "America/New_York");
  assert.equal(iso, "2026-11-01T08:30:00.000Z"); // 03:30 EST = 08:30Z
  assert.deepEqual(formatDateTimeForLocation(iso, "America/New_York"), {
    date: "2026-11-01",
    time: "03:30",
  });
});

test("P2-B regression: Paris just-after-midnight fields never carry hour 24; a date-only edit stays on the entered date", () => {
  // 2019-07-13T22:30:00.000Z is 2019-07-14 00:30 in Paris. Engines on
  // the h24 hour cycle (Node 20's en-CA, per the Codex repro) format
  // that as time "24:30"; formatDateTimeForLocation normalizes it, so
  // the fields name the same wall moment on every engine.
  const fields = formatDateTimeForLocation("2019-07-13T22:30:00.000Z", "Europe/Paris");
  assert.deepEqual(fields, { date: "2019-07-14", time: "00:30" });
  // The component's date-only edit path: the new date combined with the
  // field's timeValue. With "24:30:00" this stored July 16 at 00:30;
  // with the normalized fields it stores 00:30 Paris on the 15th.
  const edited = combineDateTime("2019-07-15", `${fields.time}:00`, "Europe/Paris");
  assert.equal(edited, "2019-07-14T22:30:00.000Z"); // 00:30 CEST on Jul 15 = 22:30Z on Jul 14
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
