/**
 * Blank exact-time default is 9:00 PM (not midnight) via DEFAULT_TIME / combineDateTime.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TIME,
  combineDateTime,
  normalizeTimeInput,
} from "../../src/lib/dateInput.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("DEFAULT_TIME is 21:00:00 (9 PM)", () => {
  assert.equal(DEFAULT_TIME, "21:00:00");
});

test("blank time input normalizes to 9 PM default", () => {
  assert.equal(normalizeTimeInput(""), "21:00:00");
  assert.equal(normalizeTimeInput("", DEFAULT_TIME), "21:00:00");
});

test("combineDateTime uses 9 PM when time is blank", () => {
  const isoUtc = combineDateTime("2024-06-01", "", "UTC");
  assert.ok(isoUtc);
  assert.equal(isoUtc, "2024-06-01T21:00:00.000Z");

  const isoAthens = combineDateTime("2024-06-01", "", "Europe/Athens");
  assert.ok(isoAthens);
  // 21:00 Europe/Athens in early June is UTC+3 → 18:00Z
  assert.equal(isoAthens, "2024-06-01T18:00:00.000Z");
});

test("editor help copy defaults blank exact time to 9 PM", () => {
  const simplified = fs.readFileSync(
    path.join(ROOT, "src/components/SimplifiedEditor/SimplifiedEditor.tsx"),
    "utf8"
  );
  const dateTimeControls = fs.readFileSync(
    path.join(ROOT, "src/components/DateTimeControls.tsx"),
    "utf8"
  );
  assert.match(simplified, /Leave blank to default to 9 PM/);
  assert.doesNotMatch(simplified, /Leave blank to default to midnight/);
  assert.match(dateTimeControls, /defaults to 9 PM/);
  assert.doesNotMatch(dateTimeControls, /defaults to midnight/);
});
