/**
 * Codex fix round on PR #333 (P2): name-only drafts carry the placeholder
 * timezone "UTC" (the editorLocationPrefill sentinel). combineDateTime
 * deliberately treats bare "UTC" as the legacy device-local sentinel, so
 * DateTimeControls' field rendering must read in the same frame. Before
 * the fix, getDateTimeInputValues sent "UTC" through
 * formatDateTimeForLocation as if it were a real zone, so the read and
 * write frames disagreed: under TZ=America/Vancouver an instant displayed
 * as Oct 19 19:00 became Oct 21 02:00Z after changing only the date to
 * Oct 20 (the 19:00 UTC-frame fields were re-parsed as device-local).
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

const { combineDateTime, formatDateInput, formatTimeInput } = await import(
  "../../src/lib/dateInput.ts"
);
const { formatDateTimeForLocation } = await import("../../src/lib/dateTime.ts");

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

test("P2 (Codex repro): a UTC-sentinel draft renders device-local fields; a date-only edit does not shift", () => {
  // A stored instant a name-only draft can hold. The old zoned rendering
  // showed it as Oct 19 19:00 (the UTC frame) ...
  const storedIso = "2026-10-19T19:00:00.000Z";
  assert.deepEqual(formatDateTimeForLocation(storedIso, "UTC"), {
    date: "2026-10-19",
    time: "19:00",
  });
  // ... and feeding those fields back through the sentinel combine path
  // (device-local) is exactly the reported day-late result:
  assert.equal(combineDateTime("2026-10-20", "19:00:00", "UTC"), "2026-10-21T02:00:00.000Z");

  // The fixed rendering frame is device-local — the same helpers the
  // component's fallback branch calls (Vancouver is UTC-7 on this date):
  const parsed = new Date(storedIso);
  const fields = { date: formatDateInput(parsed), time: formatTimeInput(parsed) };
  assert.deepEqual(fields, { date: "2026-10-19", time: "12:00:00" });

  // Changing only the date now keeps the wall time and lands on the
  // entered date — no day or hour shift in either direction.
  const editedIso = combineDateTime("2026-10-20", fields.time, "UTC");
  assert.equal(editedIso, "2026-10-20T19:00:00.000Z");
  const edited = new Date(editedIso);
  assert.equal(formatDateInput(edited), "2026-10-20");
  assert.equal(formatTimeInput(edited), "12:00:00");

  // A time-only edit round-trips in the same frame.
  const retimedIso = combineDateTime(fields.date, "21:30:00", "UTC");
  assert.equal(retimedIso, "2026-10-20T04:30:00.000Z");
  const retimed = new Date(retimedIso);
  assert.equal(formatDateInput(retimed), "2026-10-19");
  assert.equal(formatTimeInput(retimed), "21:30:00");
});

test("P2: only the bare sentinel is special — real IANA zones keep the zoned frame", () => {
  const storedIso = "2026-10-19T19:00:00.000Z";
  // Etc/UTC is a real IANA zone and renders as itself, unlike the
  // placeholder string "UTC" that marks a name-only draft.
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
});

test("P2: DateTimeControls' zoned rendering branch excludes the bare-UTC sentinel", () => {
  const controls = readSrc("components/DateTimeControls.tsx");
  const fnStart = controls.indexOf("function getDateTimeInputValues");
  assert.ok(fnStart >= 0);
  const fnEnd = controls.indexOf("\n}", fnStart);
  const fn = controls.slice(fnStart, fnEnd);
  assert.match(fn, /if \(timezone && timezone !== "UTC"\)/);
  assert.match(fn, /formatDateTimeForLocation\(dateTime, timezone\)/);
  // The fallback below the branch is the device-local frame.
  assert.match(fn, /formatDateInput\(parsed\)/);
});
