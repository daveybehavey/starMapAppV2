/**
 * Sample design text sync: untouched wedding sample strings follow pickers;
 * auto-sync remains repeatable until the user manually edits a box.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { occasionPresets } from "../../src/lib/occasionPresets.ts";
import {
  SAMPLE_DESIGN_DATE,
  SAMPLE_DESIGN_PLACE,
  SAMPLE_DESIGN_TITLE,
  formatSampleDedicationDate,
  syncSampleDesignTextBoxes,
} from "../../src/lib/sampleDesignTextSync.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

const wedding = occasionPresets.find((p) => p.id === "wedding");

test("wedding sample text matches exported sample constants", () => {
  assert.ok(wedding, "wedding preset required");
  const title = wedding.textBoxes.find((b) => b.id === "title");
  const subtitle = wedding.textBoxes.find((b) => b.id === "subtitle");
  const dedication = wedding.textBoxes.find((b) => b.id === "dedication");
  assert.equal(title?.text, SAMPLE_DESIGN_TITLE);
  assert.equal(subtitle?.text, SAMPLE_DESIGN_PLACE);
  assert.equal(dedication?.text, SAMPLE_DESIGN_DATE);
});

test("formatSampleDedicationDate matches June 1, 2024 style", () => {
  assert.equal(formatSampleDedicationDate("2024-06-01"), "June 1, 2024");
  assert.equal(formatSampleDedicationDate("2023-09-15"), "September 15, 2023");
});

test("untouched sample text syncs on location and date picker change", () => {
  assert.ok(wedding);
  const boxes = wedding.textBoxes.map((b) => ({ ...b }));
  const synced = syncSampleDesignTextBoxes({
    textBoxes: boxes,
    touched: {},
    locationDisplayName: "Paris, France",
    dateValue: "2025-02-14",
  });
  assert.equal(synced.changed, true);
  assert.equal(synced.textBoxes.find((b) => b.id === "subtitle")?.text, "Paris, France");
  assert.equal(synced.textBoxes.find((b) => b.id === "dedication")?.text, "February 14, 2025");
  assert.equal(synced.textBoxes.find((b) => b.id === "title")?.text, SAMPLE_DESIGN_TITLE);
  assert.equal(synced.lastAutoSynced.subtitle, "Paris, France");
  assert.equal(synced.lastAutoSynced.dedication, "February 14, 2025");
});

test("user-edited subtitle and dedication are preserved", () => {
  assert.ok(wedding);
  const boxes = wedding.textBoxes.map((b) =>
    b.id === "subtitle"
      ? { ...b, text: "Our beach house" }
      : b.id === "dedication"
        ? { ...b, text: "Our anniversary" }
        : { ...b }
  );
  const synced = syncSampleDesignTextBoxes({
    textBoxes: boxes,
    touched: { subtitle: true, dedication: true },
    lastAutoSynced: { subtitle: "Paris, France", dedication: "February 14, 2025" },
    locationDisplayName: "Paris, France",
    dateValue: "2025-02-14",
  });
  assert.equal(synced.changed, false);
  assert.equal(synced.textBoxes.find((b) => b.id === "subtitle")?.text, "Our beach house");
  assert.equal(synced.textBoxes.find((b) => b.id === "dedication")?.text, "Our anniversary");
  assert.equal(synced.textBoxes, boxes);
});

test("untouched sample is still overwritten even when other boxes were edited", () => {
  assert.ok(wedding);
  const boxes = wedding.textBoxes.map((b) =>
    b.id === "title" ? { ...b, text: "Custom Title" } : { ...b }
  );
  const synced = syncSampleDesignTextBoxes({
    textBoxes: boxes,
    touched: { subtitle: false, dedication: false },
    locationDisplayName: "Chicago, IL",
    dateValue: "2020-01-02",
  });
  assert.equal(synced.textBoxes.find((b) => b.id === "title")?.text, "Custom Title");
  assert.equal(synced.textBoxes.find((b) => b.id === "subtitle")?.text, "Chicago, IL");
  assert.equal(synced.textBoxes.find((b) => b.id === "dedication")?.text, "January 2, 2020");
});

test("non-sample subtitle text is not overwritten even when untouched", () => {
  assert.ok(wedding);
  const boxes = wedding.textBoxes.map((b) =>
    b.id === "subtitle" ? { ...b, text: "Already customized place" } : { ...b }
  );
  const synced = syncSampleDesignTextBoxes({
    textBoxes: boxes,
    touched: {},
    locationDisplayName: "Paris, France",
    dateValue: "2025-02-14",
  });
  assert.equal(synced.textBoxes.find((b) => b.id === "subtitle")?.text, "Already customized place");
  assert.equal(synced.textBoxes.find((b) => b.id === "dedication")?.text, "February 14, 2025");
});

test("two consecutive location changes leave the untouched subtitle as London", () => {
  assert.ok(wedding);
  const boxes = wedding.textBoxes.map((b) => ({ ...b }));
  const first = syncSampleDesignTextBoxes({
    textBoxes: boxes,
    touched: {},
    locationDisplayName: "Paris, France",
  });
  assert.equal(first.textBoxes.find((b) => b.id === "subtitle")?.text, "Paris, France");
  assert.equal(first.lastAutoSynced.subtitle, "Paris, France");

  const second = syncSampleDesignTextBoxes({
    textBoxes: first.textBoxes,
    touched: {},
    lastAutoSynced: first.lastAutoSynced,
    locationDisplayName: "London, UK",
  });
  assert.equal(second.changed, true);
  assert.equal(second.textBoxes.find((b) => b.id === "subtitle")?.text, "London, UK");
  assert.equal(second.lastAutoSynced.subtitle, "London, UK");
});

test("manual edit after an auto-sync is never overwritten", () => {
  assert.ok(wedding);
  const boxes = wedding.textBoxes.map((b) => ({ ...b }));
  const first = syncSampleDesignTextBoxes({
    textBoxes: boxes,
    touched: {},
    locationDisplayName: "Paris, France",
    dateValue: "2025-02-14",
  });
  const afterManualEdit = first.textBoxes.map((b) =>
    b.id === "subtitle" ? { ...b, text: "Our beach house" } : b
  );
  const second = syncSampleDesignTextBoxes({
    textBoxes: afterManualEdit,
    touched: { subtitle: true },
    lastAutoSynced: first.lastAutoSynced,
    locationDisplayName: "London, UK",
    dateValue: "2026-03-20",
  });
  assert.equal(second.textBoxes.find((b) => b.id === "subtitle")?.text, "Our beach house");
  assert.equal(second.textBoxes.find((b) => b.id === "dedication")?.text, "March 20, 2026");
  assert.equal(second.lastAutoSynced.subtitle, "Paris, France");
  assert.equal(second.lastAutoSynced.dedication, "March 20, 2026");
});

test("mobile handler path syncs untouched sample text on date/location change", () => {
  const mobile = read("src/app/MobileCreate.tsx");
  assert.match(mobile, /import \{ syncSampleDesignTextBoxes \} from "@\/lib\/sampleDesignTextSync"/);
  assert.match(mobile, /import \{ formatDateTimeForLocation \} from "@\/lib\/dateTime"/);
  assert.match(mobile, /const syncSampleTextFromPickers = useCallback\(/);
  assert.match(mobile, /syncSampleDesignTextBoxes\(\{/);
  assert.match(mobile, /lastAutoSynced: state\.sampleDesignLastAutoSynced/);
  assert.match(mobile, /touched: \{ subtitle: subtitleTouched, dedication: dedicationTouched \}/);
  assert.match(
    mobile,
    /const handleDateTimeChange = useCallback\([\s\S]*?syncSampleTextFromPickers\(\{ dateValue:/
  );
  assert.match(
    mobile,
    /const handleLocationChange = useCallback\([\s\S]*?syncSampleTextFromPickers\(\{ locationName:/
  );
  assert.match(mobile, /handleTextBoxTextChange/);
  assert.match(mobile, /setSubtitleTouched\(true\)/);
  assert.match(mobile, /setDedicationTouched\(true\)/);
  assert.doesNotMatch(
    mobile,
    /box\.text === SAMPLE_DESIGN_PLACE|SAMPLE_DESIGN_PLACE ===/
  );

  const store = read("src/lib/store.ts");
  assert.match(store, /sampleDesignLastAutoSynced/);
  assert.match(store, /setSampleDesignLastAutoSynced/);
  assert.match(store, /clearSampleDesignLastAutoSynced/);
});
