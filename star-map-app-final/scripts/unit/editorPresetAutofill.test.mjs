/**
 * D16 regression coverage: the occasion/sample preset decision layer.
 *
 * Census defect (coordination PR #7, repro 4/4 on fresh sessions): on
 * mobile, "Try a sample moment" applied the wedding preset's TEXT but kept
 * today's date and the empty (0,0) placeholder location, while the map
 * stayed captioned "Santorini, Greece". Desktop applied the full preset.
 *
 * Two cooperating causes, both covered here against the real source:
 *  1. MobileCreate's draft-restore heuristic treated ANY draft with
 *     `selectedOccasion: null` as a user-customized sky — including the
 *     untouched default the parent editor autosaves on first load, which
 *     MobileCreate (lazy-mounted) reads on mount. Fixed by the shared
 *     resolveRestoredCustomOccasion rule.
 *  2. useEditorLogic's autofill gate trusted that local flag even when
 *     the store still held the untouched placeholder sky. Fixed by
 *     shouldAutofillPresetSky: an untouched placeholder sky always
 *     autofills, so preset text + date + coordinates + timezone install
 *     atomically.
 *
 * Follow-up (Codex P2 on PR #310): the gate's remaining legacy branch
 * trusted the restore-derived flag in the opposite direction — a
 * restored draft holding an explicitly picked date but no location is
 * NOT custom by the shared rule, so the branch autofilled and silently
 * replaced the picked date with the sample date. The decision is now a
 * pure function of sky provenance (confirmed location / untouched
 * default date / any usable date), and the draft persists
 * dateTimeIsUntouchedDefault so restore reconstructs the store flag
 * exactly instead of hardcoding it to false.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { occasionPresets } from "../../src/lib/occasionPresets.ts";
import { resolveRestoredCustomOccasion } from "../../src/lib/editorDraft.ts";
// editorLocationPrefill.ts is exercised through its harness mirror (the
// module's "@/data" imports cannot resolve under plain node — same route
// as editorLocationPrefill.test.mjs).
import { hasConfirmedEditorLocation } from "./editorLocationPrefill.harness.mjs";
import { shouldAutofillPresetSky } from "../../src/lib/sampleDesignTextSync.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

// The store's untouched defaults (src/lib/store.ts): an evening "now"
// date flagged untouched, and the placeholder location (browser timezone).
const PLACEHOLDER_LOCATION = {
  name: "",
  latitude: 0,
  longitude: 0,
  timezone: "America/Vancouver",
};

function decide(state) {
  // customOccasion is intentionally NOT an input: the decision must not
  // depend on the restore-derived local flag (D16 in one direction,
  // Codex P2 in the other). State literals below keep it only to document
  // the full session state each cell describes.
  return shouldAutofillPresetSky({
    hasConfirmedLocation: hasConfirmedEditorLocation(state.location),
    dateTimeIsUntouchedDefault: state.dateTimeIsUntouchedDefault,
    // The store default date is a valid "now", so hasDate is always true
    // in practice; the gate must not depend on it for the placeholder sky.
    hasDate: state.hasDate ?? true,
  });
}

test("D16: untouched placeholder sky autofills even when customOccasion was wrongly set", () => {
  // Exact mobile state at tap time in the repro: MobileCreate's restore
  // effect had set customOccasion=true from the autosaved untouched draft.
  assert.equal(
    decide({
      location: PLACEHOLDER_LOCATION,
      dateTimeIsUntouchedDefault: true,
      customOccasion: true,
    }),
    true,
  );
});

test("fresh untouched sky autofills with no flags set", () => {
  assert.equal(
    decide({
      location: PLACEHOLDER_LOCATION,
      dateTimeIsUntouchedDefault: true,
      customOccasion: false,
    }),
    true,
  );
});

test("name-only location with untouched date still autofills (no real sky yet)", () => {
  assert.equal(
    decide({
      location: { name: "Paris, France", latitude: 0, longitude: 0, timezone: "UTC" },
      dateTimeIsUntouchedDefault: true,
      customOccasion: true,
    }),
    true,
  );
});

test("confirmed user location is preserved (no autofill)", () => {
  assert.equal(
    decide({
      location: { name: "Victoria, BC", latitude: 48.4284, longitude: -123.3656, timezone: "America/Vancouver" },
      dateTimeIsUntouchedDefault: true,
      customOccasion: true,
    }),
    false,
  );
  // Same protection when the local custom flag happens to be false: a
  // named, confirmed location blocks autofill through the legacy branch.
  assert.equal(
    decide({
      location: { name: "Victoria, BC", latitude: 48.4284, longitude: -123.3656, timezone: "America/Vancouver" },
      dateTimeIsUntouchedDefault: true,
      customOccasion: false,
    }),
    false,
  );
});

test("user-picked date with placeholder location is preserved", () => {
  assert.equal(
    decide({
      location: PLACEHOLDER_LOCATION,
      dateTimeIsUntouchedDefault: false, // setDateTime flips the flag on any real pick
      customOccasion: true,
    }),
    false,
  );
});

test("restored named draft sky is preserved", () => {
  // Restored drafts carry their persisted date provenance in the store.
  assert.equal(
    decide({
      location: { name: "Paris, France", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris" },
      dateTimeIsUntouchedDefault: false,
      customOccasion: false,
    }),
    false,
  );
});

test("Codex P2: restored draft with a picked date and no location preserves the date", () => {
  // The exact Codex cell, composed the way the app derives it: the user
  // picked a date (no location yet), reloaded, then tapped a preset. The
  // shared restore rule marks the draft non-custom (location unnamed),
  // and the persisted provenance says the date was picked. The old gate's
  // legacy branch (!customOccasion && !locationName) autofilled here and
  // silently replaced the picked date with the sample date.
  const draft = {
    selectedOccasion: null,
    location: { name: "" },
    dateTimeIsUntouchedDefault: false, // persisted: setDateTime cleared it on the pick
  };
  const customOccasion = resolveRestoredCustomOccasion(draft);
  assert.equal(customOccasion, false);
  assert.equal(
    decide({
      location: PLACEHOLDER_LOCATION,
      dateTimeIsUntouchedDefault: draft.dateTimeIsUntouchedDefault,
      customOccasion,
    }),
    false,
  );
});

test("restored untouched autosaved draft still autofills (persisted provenance)", () => {
  // The returning-user half of the tension: the user never picked
  // anything; the autosaved draft persisted dateTimeIsUntouchedDefault:
  // true, restore reconstructs the store flag from it, and the preset
  // must still install its full sky (D16 after a reload).
  const draft = {
    selectedOccasion: null,
    location: { name: "" },
    dateTimeIsUntouchedDefault: true, // persisted by the autosave
  };
  const customOccasion = resolveRestoredCustomOccasion(draft);
  assert.equal(customOccasion, false);
  assert.equal(
    decide({
      location: PLACEHOLDER_LOCATION,
      dateTimeIsUntouchedDefault: draft.dateTimeIsUntouchedDefault,
      customOccasion,
    }),
    true,
  );
});

test("no usable date and no confirmed location leaves nothing to preserve", () => {
  assert.equal(
    decide({
      location: PLACEHOLDER_LOCATION,
      dateTimeIsUntouchedDefault: false,
      customOccasion: false,
      hasDate: false,
    }),
    true,
  );
});

test("autosaved untouched draft (occasion null, unnamed location) is NOT custom — D16", () => {
  assert.equal(
    resolveRestoredCustomOccasion({ selectedOccasion: null, location: { name: "" } }),
    false,
  );
  assert.equal(
    resolveRestoredCustomOccasion({ selectedOccasion: null, location: { name: "   " } }),
    false,
  );
  assert.equal(
    resolveRestoredCustomOccasion({ selectedOccasion: null, location: {} }),
    false,
  );
});

test("draft with a named location and no occasion IS custom", () => {
  assert.equal(
    resolveRestoredCustomOccasion({ selectedOccasion: null, location: { name: "Paris, France" } }),
    true,
  );
});

test("draft with a selected occasion is NOT custom regardless of location", () => {
  assert.equal(
    resolveRestoredCustomOccasion({ selectedOccasion: "wedding", location: { name: "Paris, France" } }),
    false,
  );
  assert.equal(
    resolveRestoredCustomOccasion({ selectedOccasion: "wedding", location: { name: "" } }),
    false,
  );
});

test("applying the wedding preset to the D16 state installs date, coordinates, and timezone atomically", () => {
  const wedding = occasionPresets.find((p) => p.id === "wedding");
  assert.ok(wedding, "wedding preset required");

  // The hook's autofill branch: decision first (from the D16 state), then
  // setDateTime(preset.dateTimeISO) + setLocation(preset.location).
  const decision = decide({
    location: PLACEHOLDER_LOCATION,
    dateTimeIsUntouchedDefault: true,
    customOccasion: true,
  });
  assert.equal(decision, true);

  const draftAfter = decision
    ? { dateTime: wedding.dateTimeISO, location: { ...wedding.location } }
    : { dateTime: "today", location: PLACEHOLDER_LOCATION };

  assert.equal(draftAfter.dateTime, "2024-06-01T18:00:00.000Z");
  assert.equal(draftAfter.location.name, "Santorini, Greece");
  assert.equal(draftAfter.location.latitude, 36.3932);
  assert.equal(draftAfter.location.longitude, 25.4615);
  assert.equal(draftAfter.location.timezone, "Europe/Athens");
});

test("preset gate and both restore paths use the shared helpers (wiring)", () => {
  const hook = read("src/hooks/useEditorLogic.ts");
  assert.match(hook, /shouldAutofillPresetSky\(\{/);
  // The gate call must not take the restore-derived local flag or the
  // location name as inputs (D16 / Codex P2 — provenance only).
  const gateStart = hook.indexOf("const shouldAutofill = shouldAutofillPresetSky({");
  assert.ok(gateStart >= 0, "gate call site present");
  const gateCall = hook.slice(gateStart, hook.indexOf("});", gateStart));
  assert.ok(!gateCall.includes("customOccasion"), "gate ignores customOccasion");
  assert.ok(!gateCall.includes("locationName"), "gate ignores locationName");
  const mobile = read("src/app/MobileCreate.tsx");
  assert.match(mobile, /resolveRestoredCustomOccasion\(\{/);
  const desktop = read("src/components/EditorExperience.tsx");
  assert.match(desktop, /resolveRestoredCustomOccasion\(draft\)/);
  // Date provenance is persisted by the autosave and reconstructed by
  // the restore — never hardcoded in either direction.
  assert.match(desktop, /dateTimeIsUntouchedDefault: state\.dateTimeIsUntouchedDefault/);
  assert.match(desktop, /dateTimeIsUntouchedDefault: draft\.dateTimeIsUntouchedDefault/);
  assert.doesNotMatch(desktop, /dateTimeIsUntouchedDefault: false/);
});
