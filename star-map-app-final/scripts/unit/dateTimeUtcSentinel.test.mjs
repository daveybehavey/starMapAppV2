/**
 * Frame agreement for drafts carrying the placeholder timezone "UTC"
 * (the editorLocationPrefill sentinel on name-only drafts).
 *
 * History: PR #333's Codex round (P2) found DateTimeControls rendering
 * "UTC" through formatDateTimeForLocation (the UTC frame) while
 * combineDateTime parsed bare "UTC" as device-local — the frames
 * disagreed and a date-only edit shifted the stored instant by the
 * device offset. #333 aligned the pair on the device-local sentinel
 * frame.
 *
 * A2-4 retired that sentinel parse: "UTC" is also a real zone, and
 * every other caller of combineDateTime (SimplifiedEditor renders the
 * UTC frame already) got device-dependent instants for it. An explicit
 * "UTC" now parses as UTC, and DateTimeControls' rendering takes the
 * zoned branch for it — the #333 invariant (read frame == write frame,
 * so a date-only edit does not shift) is pinned here in the UTC frame.
 *
 * The component helper is module-private (and a .tsx the unit harness
 * cannot import), so behaviour is pinned through the real libs the two
 * frames are built from, under a controlled device timezone, plus a
 * source pin on the component's branch condition.
 */
process.env.TZ = "America/Vancouver";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const { combineDateTime } = await import("../../src/lib/dateInput.ts");
const { formatDateTimeForLocation } = await import("../../src/lib/dateTime.ts");

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

test("A2-4: a UTC-carrying draft renders and writes in the UTC frame; a date-only edit does not shift", () => {
  // A stored instant a name-only draft can hold, rendered through the
  // zoned branch (the UTC frame):
  const storedIso = "2026-10-19T19:00:00.000Z";
  const fields = formatDateTimeForLocation(storedIso, "UTC");
  assert.deepEqual(fields, { date: "2026-10-19", time: "19:00" });

  // Feeding those fields back through combineDateTime with an explicit
  // "UTC" parses as UTC on any device (device is America/Vancouver
  // here): changing only the date keeps the wall time and lands on the
  // entered date. The pre-A2-4 device-local parse of the same fields
  // produced 2026-10-21T02:00:00.000Z — the #333 day-late result.
  const editedIso = combineDateTime("2026-10-20", `${fields.time}:00`, "UTC");
  assert.equal(editedIso, "2026-10-20T19:00:00.000Z");
  assert.deepEqual(formatDateTimeForLocation(editedIso, "UTC"), {
    date: "2026-10-20",
    time: "19:00",
  });

  // A time-only edit round-trips in the same frame.
  const retimedIso = combineDateTime(fields.date, "21:30:00", "UTC");
  assert.equal(retimedIso, "2026-10-19T21:30:00.000Z");
  assert.deepEqual(formatDateTimeForLocation(retimedIso, "UTC"), {
    date: "2026-10-19",
    time: "21:30",
  });
});

test("A2-4: bare \"UTC\" now behaves like the real IANA zone it names", () => {
  const storedIso = "2026-10-19T19:00:00.000Z";
  // Etc/UTC is a real IANA zone and renders as itself; the placeholder
  // string "UTC" renders identically now.
  assert.deepEqual(formatDateTimeForLocation(storedIso, "Etc/UTC"), {
    date: "2026-10-19",
    time: "19:00",
  });
  assert.deepEqual(formatDateTimeForLocation(storedIso, "Europe/Paris"), {
    date: "2026-10-19",
    time: "21:00",
  });
  // And a real zone's write path stays zoned, not device-local.
  assert.equal(
    combineDateTime("2026-10-20", "19:00:00", "Europe/Paris"),
    "2026-10-20T17:00:00.000Z",
  );
  // An omitted timezone is the only device-local parse left.
  assert.equal(
    combineDateTime("2026-10-20", "19:00:00"),
    "2026-10-21T02:00:00.000Z",
  );
});

test("A2-4: DateTimeControls' zoned rendering branch covers every supplied zone, \"UTC\" included", () => {
  const controls = readSrc("components/DateTimeControls.tsx");
  const fnStart = controls.indexOf("function getDateTimeInputValues");
  assert.ok(fnStart >= 0);
  const fnEnd = controls.indexOf("\n}", fnStart);
  const fn = controls.slice(fnStart, fnEnd);
  assert.match(fn, /if \(timezone\) \{/);
  assert.match(fn, /formatDateTimeForLocation\(dateTime, timezone\)/);
  // The fallback below the branch is the device-local frame, reached
  // only when no timezone is supplied or the zone cannot resolve.
  assert.match(fn, /formatDateInput\(parsed\)/);
});
