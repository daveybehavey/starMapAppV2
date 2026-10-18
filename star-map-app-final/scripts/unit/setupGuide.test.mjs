import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getSetupGuideField } from "./setupGuide.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test("guide targets date before place when both are missing", () => {
  assert.equal(getSetupGuideField({ hasDate: false, hasPlace: false }), "date");
});

test("guide targets the only missing field", () => {
  assert.equal(getSetupGuideField({ hasDate: true, hasPlace: false }), "place");
  assert.equal(getSetupGuideField({ hasDate: false, hasPlace: true }), "date");
});

test("guide is null once setup is complete", () => {
  assert.equal(getSetupGuideField({ hasDate: true, hasPlace: true }), null);
});

test("guide targets the fields the editors actually render", () => {
  const guide = readSrc("lib/setupGuide.ts");
  // DateTimeControls' date input id and LocationSearch's combobox role.
  assert.match(guide, /#star-date/);
  assert.match(guide, /input\[role="combobox"\]/);
});

test("MobileCreate unlock buttons are guides, not dead disabled controls", () => {
  const mobile = readSrc("app/MobileCreate.tsx");
  assert.match(mobile, /import \{ getSetupGuideField, scrollToSetupField \} from "@\/lib\/setupGuide";/);
  // Definition + main reveal button + preview-panel mini button.
  assert.ok(countOccurrences(mobile, "handleRevealButtonPress") >= 3);
  assert.doesNotMatch(mobile, /disabled=\{!canReveal \|\| isRevealing\}/);
  // Still truly disabled only while a reveal is in flight.
  assert.match(mobile, /disabled=\{isRevealing\}/);
  // The guide keeps MobileCreate's own completeness semantics (named place).
  assert.match(mobile, /getSetupGuideField\(\{ hasDate, hasPlace: hasLocation \}\)/);
});

test("EditorExperience unlock button gets the same guide treatment", () => {
  const desktop = readSrc("components/EditorExperience.tsx");
  assert.match(desktop, /import \{ getSetupGuideField, scrollToSetupField \} from "@\/lib\/setupGuide";/);
  assert.ok(countOccurrences(desktop, "handleRevealButtonPress") >= 2);
  assert.doesNotMatch(desktop, /disabled=\{!canReveal \|\| isRevealing\}/);
  assert.match(desktop, /disabled=\{isRevealing\}/);
  // Desktop requires a confirmed place, and expands its card when collapsed.
  assert.match(desktop, /getSetupGuideField\(\{ hasDate, hasPlace: hasConfirmedLocation \}\)/);
  assert.match(desktop, /setCardState\(\{ dateLocation: false \}\)/);
});
