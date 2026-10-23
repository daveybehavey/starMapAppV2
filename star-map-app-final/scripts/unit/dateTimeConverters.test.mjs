/**
 * T-SM-DATEFIX: fixed zone/instant fixtures for the wall-time → UTC
 * converters (deep-audit 2, findings A2-4…A2-8). These converters feed
 * the rendered sky itself, so every case pins an exact instant.
 *
 *  A2-4  combineDateTime sent an explicit "UTC" down the device-local
 *        no-suffix parse; it now parses with a Z suffix, distinct from
 *        an omitted timezone (which stays device-local).
 *  A2-5  astronomy.toUTCDateFromLocal did not normalize an Intl hour
 *        of 24; Date.UTC rolled the day and corrupted the offset.
 *  A2-6  astronomy.toUTCDateFromLocal and dateTime's zoned converter
 *        sampled the zone offset once, at the wall fields read as UTC;
 *        both now resolve the offset at the resulting instant via the
 *        same two-pass refinement combineDateTime already had.
 *  A2-7  nonexistent wall times (the spring-forward gap) were
 *        silently substituted with a neighbouring hour;
 *        combineDateTime now round-trip-validates and rejects (null).
 *  A2-8  combineDateTime's zoned path dropped the entered seconds.
 *
 * The device timezone is pinned to America/Vancouver so the UTC and
 * omitted-zone cases prove their device independence / dependence.
 */
process.env.TZ = "America/Vancouver";

import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

// astronomy.ts uses extensionless sibling imports and catalog JSON; the
// shared loader hooks resolve both for the plain-Node runner.
register("./tsAliasLoader.mjs", import.meta.url);

const { combineDateTime } = await import("../../src/lib/dateInput.ts");
const { toUTCDateFromLocal } = await import("../../src/lib/astronomy.ts");
const { parseCalendarDateParamToIso } = await import("../../src/lib/dateTime.ts");

test("A2-4: an explicit \"UTC\" parses as UTC on any device", () => {
  // Device is America/Vancouver (UTC-8 here): the old no-suffix parse
  // returned 18:20:30Z for this input.
  assert.equal(
    combineDateTime("2026-01-15", "10:20:30", "UTC"),
    "2026-01-15T10:20:30.000Z",
  );
});

test("A2-4: an omitted timezone stays the legacy device-local parse", () => {
  assert.equal(
    combineDateTime("2026-01-15", "10:20:30"),
    "2026-01-15T18:20:30.000Z", // 10:20:30 PST (UTC-8)
  );
});

test("A2-8: the zoned path preserves the entered seconds", () => {
  assert.equal(
    combineDateTime("2026-01-15", "10:20:30", "America/New_York"),
    "2026-01-15T15:20:30.000Z", // 10:20:30 EST (UTC-5), seconds intact
  );
});

test("A2-6: combineDateTime resolves the offset at the resulting instant (DST morning)", () => {
  // 03:30 in New York on spring-forward day is already EDT (UTC-4).
  // Sampling the offset at the wall fields read as UTC (still EST)
  // returned 08:30Z — the sky an hour late.
  assert.equal(
    combineDateTime("2026-03-08", "03:30:00", "America/New_York"),
    "2026-03-08T07:30:00.000Z",
  );
});

test("A2-7: a wall time inside the spring-forward gap is rejected, not substituted", () => {
  // 02:30 never occurs in New York on 2026-03-08 (02:00 EST → 03:00
  // EDT). The old conversion returned an instant displaying 03:30 (or
  // 01:30) — an hour the customer never picked.
  assert.equal(combineDateTime("2026-03-08", "02:30:00", "America/New_York"), null);
  // Same shape in the southern hemisphere (02:00 AEST → 03:00 AEDT).
  assert.equal(combineDateTime("2026-10-04", "02:30:00", "Australia/Sydney"), null);
  // The first existent minute after the Sydney gap converts normally.
  assert.equal(
    combineDateTime("2026-10-04", "03:30:00", "Australia/Sydney"),
    "2026-10-03T16:30:00.000Z", // 03:30 AEDT (UTC+11)
  );
});

test("A2-7: a fold wall time is existent and resolves to its first occurrence", () => {
  // 01:30 occurs twice in New York on 2026-11-01; the round-trip
  // guard must not reject it. First occurrence is EDT (UTC-4).
  assert.equal(
    combineDateTime("2026-11-01", "01:30:00", "America/New_York"),
    "2026-11-01T05:30:00.000Z",
  );
});

test("A2-6: astronomy.toUTCDateFromLocal resolves the offset at the resulting instant", () => {
  assert.equal(
    toUTCDateFromLocal("2026-03-08", "03:30", "America/New_York")?.toISOString(),
    "2026-03-08T07:30:00.000Z", // 03:30 EDT — single-pass gave 08:30Z
  );
  // Post-fold morning: 03:30 EST (UTC-5); single-pass gave 07:30Z.
  assert.equal(
    toUTCDateFromLocal("2026-11-01", "03:30", "America/New_York")?.toISOString(),
    "2026-11-01T08:30:00.000Z",
  );
  // The fold hour resolves deterministically to the first occurrence.
  assert.equal(
    toUTCDateFromLocal("2026-11-01", "01:30", "America/New_York")?.toISOString(),
    "2026-11-01T05:30:00.000Z", // 01:30 EDT
  );
});

test("A2-5: astronomy.toUTCDateFromLocal keeps the day straight when a probe reads local midnight", () => {
  // The probe instant (entered wall fields read as UTC) is exactly
  // local midnight in Karachi (UTC+5). On engines whose Intl hour
  // cycle reports that as hour 24 with the day advanced, the missing
  // normalization rolled Date.UTC a second day and the result landed
  // a day early; on h23 engines this is a plain fixed-offset control.
  assert.equal(
    toUTCDateFromLocal("2026-01-15", "19:00", "Asia/Karachi")?.toISOString(),
    "2026-01-15T14:00:00.000Z", // 19:00 PKT (UTC+5)
  );
  // Ordinary fixed behaviour is unchanged.
  assert.equal(
    toUTCDateFromLocal("2019-07-14", "21:00", "Europe/Paris")?.toISOString(),
    "2019-07-14T19:00:00.000Z", // 21:00 CEST (UTC+2)
  );
});

test("A2-6: dateTime's zoned converter lands the evening default on the right instant on transition days", () => {
  // parseCalendarDateParamToIso builds 21:00 local through the zoned
  // converter. On spring-forward day 21:00 is EDT (UTC-4): the
  // single-pass converter sampled EST at the probe and returned
  // 2026-03-09T02:00:00.000Z (22:00 EDT — an hour late, same date, so
  // the function's own date check could not catch it).
  assert.equal(
    parseCalendarDateParamToIso("2026-03-08", "America/New_York"),
    "2026-03-09T01:00:00.000Z", // 21:00 EDT
  );
  // Fall-back day: 21:00 is EST (UTC-5); single-pass returned
  // 2026-11-02T01:00:00.000Z (20:00 EST).
  assert.equal(
    parseCalendarDateParamToIso("2026-11-01", "America/New_York"),
    "2026-11-02T02:00:00.000Z", // 21:00 EST
  );
});
