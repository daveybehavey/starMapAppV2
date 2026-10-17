/**
 * Sample design text sync: untouched wedding sample strings follow pickers;
 * manually edited boxes are preserved.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { occasionPresets } from "../../src/lib/occasionPresets.ts";
import {
  SAMPLE_DESIGN_DATE,
  SAMPLE_DESIGN_PLACE,
  SAMPLE_DESIGN_TITLE,
  formatSampleDedicationDate,
  syncSampleDesignTextBoxes,
} from "../../src/lib/sampleDesignTextSync.ts";

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
  assert.equal(synced.find((b) => b.id === "subtitle")?.text, "Paris, France");
  assert.equal(synced.find((b) => b.id === "dedication")?.text, "February 14, 2025");
  assert.equal(synced.find((b) => b.id === "title")?.text, SAMPLE_DESIGN_TITLE);
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
    locationDisplayName: "Paris, France",
    dateValue: "2025-02-14",
  });
  assert.equal(synced.find((b) => b.id === "subtitle")?.text, "Our beach house");
  assert.equal(synced.find((b) => b.id === "dedication")?.text, "Our anniversary");
  assert.equal(synced, boxes);
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
  assert.equal(synced.find((b) => b.id === "title")?.text, "Custom Title");
  assert.equal(synced.find((b) => b.id === "subtitle")?.text, "Chicago, IL");
  assert.equal(synced.find((b) => b.id === "dedication")?.text, "January 2, 2020");
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
  assert.equal(synced.find((b) => b.id === "subtitle")?.text, "Already customized place");
  assert.equal(synced.find((b) => b.id === "dedication")?.text, "February 14, 2025");
});
