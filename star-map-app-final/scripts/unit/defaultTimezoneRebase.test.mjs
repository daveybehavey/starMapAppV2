/**
 * Untouched evening default rebases to 21:00 in the newly selected location TZ;
 * user-set date/time is left alone on location change.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_TIME, combineDateTime } from "../../src/lib/dateInput.ts";
import {
  formatDateTimeForLocation,
  maybeRebaseUntouchedDefaultOnTimezoneChange,
  rebaseUntouchedDefaultDateTime,
} from "../../src/lib/dateTime.ts";
import {
  parseEditorDraft,
  readEditorDraft,
  writeEditorDraft,
} from "../../src/lib/editorDraft.ts";
import {
  SAMPLE_DESIGN_DATE,
  SAMPLE_DESIGN_PLACE,
  syncSampleDesignTextBoxes,
} from "../../src/lib/sampleDesignTextSync.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Fresh-load style default: browser-local 21:00 on a fixed calendar day. */
function freshLoadDefaultIso(ymd = "2024-06-15") {
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y, m - 1, d, 21, 0, 0, 0);
  return local.toISOString();
}

test("rebaseUntouchedDefaultDateTime yields 21:00 wall time in the target timezone", () => {
  const defaultIso = freshLoadDefaultIso("2024-06-15");
  const athensIso = rebaseUntouchedDefaultDateTime(defaultIso, "Europe/Athens", "UTC");
  assert.ok(athensIso);
  const athens = formatDateTimeForLocation(athensIso, "Europe/Athens");
  assert.ok(athens);
  assert.equal(athens.time, "21:00");
  assert.equal(athens.date, "2024-06-15");

  const tokyoIso = rebaseUntouchedDefaultDateTime(defaultIso, "Asia/Tokyo", "UTC");
  assert.ok(tokyoIso);
  const tokyo = formatDateTimeForLocation(tokyoIso, "Asia/Tokyo");
  assert.ok(tokyo);
  assert.equal(tokyo.time, "21:00");
});

test("multi-hop rebase preserves prior-location calendar date (Honolulu → Tokyo)", () => {
  // Simulate UTC-browser fresh load: June 15 at 21:00 local → that UTC instant.
  const defaultIso = "2024-06-15T21:00:00.000Z";

  const honoluluIso = maybeRebaseUntouchedDefaultOnTimezoneChange({
    dateTimeIso: defaultIso,
    previousTimezone: "UTC",
    nextTimezone: "Pacific/Honolulu",
    dateTimeIsUntouchedDefault: true,
  });
  // June 15 21:00 Honolulu is June 16 07:00 UTC.
  assert.equal(honoluluIso, "2024-06-16T07:00:00.000Z");
  const honoluluWall = formatDateTimeForLocation(honoluluIso, "Pacific/Honolulu");
  assert.ok(honoluluWall);
  assert.equal(honoluluWall.date, "2024-06-15");
  assert.equal(honoluluWall.time, "21:00");

  // Bug used browser-local date of the stored instant (June 16 in a UTC browser) and
  // would rebase to June 16 21:00 Tokyo. Correct path keeps Honolulu's June 15.
  const tokyoIso = maybeRebaseUntouchedDefaultOnTimezoneChange({
    dateTimeIso: honoluluIso,
    previousTimezone: "Pacific/Honolulu",
    nextTimezone: "Asia/Tokyo",
    dateTimeIsUntouchedDefault: true,
  });
  const tokyo = formatDateTimeForLocation(tokyoIso, "Asia/Tokyo");
  assert.ok(tokyo);
  assert.equal(tokyo.date, "2024-06-15");
  assert.equal(tokyo.time, "21:00");
  assert.notEqual(tokyo.date, "2024-06-16");
});


test("fresh-load default + location pick in another timezone → 21:00 local in picked TZ", () => {
  const defaultIso = freshLoadDefaultIso("2024-06-15");
  // Store starts as UTC location; picking Athens rebases the untouched default.
  const afterAthens = maybeRebaseUntouchedDefaultOnTimezoneChange({
    dateTimeIso: defaultIso,
    previousTimezone: "UTC",
    nextTimezone: "Europe/Athens",
    dateTimeIsUntouchedDefault: true,
  });
  const athens = formatDateTimeForLocation(afterAthens, "Europe/Athens");
  assert.ok(athens);
  assert.equal(athens.time, "21:00");

  // A second location pick while still untouched rebases again (Paris → London style).
  const afterLondon = maybeRebaseUntouchedDefaultOnTimezoneChange({
    dateTimeIso: afterAthens,
    previousTimezone: "Europe/Athens",
    nextTimezone: "Europe/London",
    dateTimeIsUntouchedDefault: true,
  });
  const london = formatDateTimeForLocation(afterLondon, "Europe/London");
  assert.ok(london);
  assert.equal(london.time, "21:00");
});

test("user-set time + location change → wall time / instant unchanged", () => {
  const userIso = combineDateTime("2024-03-20", "15:30:00", "UTC");
  assert.ok(userIso);
  const after = maybeRebaseUntouchedDefaultOnTimezoneChange({
    dateTimeIso: userIso,
    previousTimezone: "UTC",
    nextTimezone: "Europe/Athens",
    dateTimeIsUntouchedDefault: false,
  });
  assert.equal(after, userIso);

  // Same timezone is a no-op even when still marked untouched.
  const sameZone = maybeRebaseUntouchedDefaultOnTimezoneChange({
    dateTimeIso: userIso,
    previousTimezone: "Europe/Athens",
    nextTimezone: "Europe/Athens",
    dateTimeIsUntouchedDefault: true,
  });
  assert.equal(sameZone, userIso);
});

test("store wires untouched-default rebase through setLocation", () => {
  const store = readSrc("src/lib/store.ts");
  assert.match(store, /dateTimeIsUntouchedDefault/);
  assert.match(
    store,
    /import \{ maybeRebaseUntouchedDefaultOnTimezoneChange \} from "\.\/dateTime"/
  );
  assert.match(store, /maybeRebaseUntouchedDefaultOnTimezoneChange/);
  assert.match(store, /setDateTime: \(dateTime\) => set\(\{ dateTime, dateTimeIsUntouchedDefault: false \}\)/);
  assert.match(store, /setLocation: \(location\) =>/);
  assert.match(store, /previousTimezone: state\.location\.timezone/);
  assert.match(store, /nextTimezone: nextLocation\.timezone/);
  assert.match(store, /dateTimeIsUntouchedDefault: state\.dateTimeIsUntouchedDefault/);

  const dateTime = readSrc("src/lib/dateTime.ts");
  assert.match(dateTime, /formatDateTimeForLocation\(dateTimeIso, prevZone\)/);
  assert.match(dateTime, /toUTCDateFromLocalWall\(dateStr, normalizedTime, zone\)/);
});

test("draft save/restore round-trip preserves sampleDesignLastAutoSynced", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const draft = {
    version: 1,
    seed: "default",
    datetimeISO: "2024-06-15T20:30:00.000Z",
    location: {
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    },
    textBoxes: [
      {
        id: "subtitle",
        label: "Subtitle",
        text: "Paris, France",
        fontFamily: "raleway",
        color: "#c8a662",
        size: 28,
        align: "center",
      },
      {
        id: "dedication",
        label: "Dedication",
        text: "June 1, 2024",
        fontFamily: "script",
        color: "#b98a3d",
        size: 26,
        align: "center",
      },
    ],
    selectedStyle: "navyGold",
    aspectRatio: "square",
    shape: "circle",
    renderOptions: {},
    selectedOccasion: null,
    sampleDesignLastAutoSynced: {
      subtitle: "Paris, France",
      dedication: "June 1, 2024",
    },
  };

  const write = writeEditorDraft(storage, draft, {
    now: () => new Date("2026-10-17T00:00:00.000Z"),
  });
  assert.equal(write.status, "saved");
  assert.deepEqual(write.envelope.sampleDesignLastAutoSynced, {
    subtitle: "Paris, France",
    dedication: "June 1, 2024",
  });

  const read = readEditorDraft(storage);
  assert.equal(read.status, "restored");
  assert.deepEqual(read.data.sampleDesignLastAutoSynced, {
    subtitle: "Paris, France",
    dedication: "June 1, 2024",
  });
});

test("legacy drafts without sampleDesignLastAutoSynced restore null provenance", () => {
  const legacy = {
    version: 1,
    seed: "default",
    datetimeISO: "2024-06-15T20:30:00.000Z",
    location: {
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    },
    textBoxes: [
      {
        id: "subtitle",
        label: "Subtitle",
        text: "Paris, France",
        fontFamily: "raleway",
        color: "#c8a662",
        size: 28,
        align: "center",
      },
    ],
    selectedStyle: "navyGold",
    aspectRatio: "square",
    shape: "circle",
    renderOptions: {},
    selectedOccasion: null,
  };
  const result = parseEditorDraft(JSON.stringify(legacy));
  assert.equal(result.status, "restored");
  assert.deepEqual(result.data.sampleDesignLastAutoSynced, {
    subtitle: null,
    dedication: null,
  });
});

test("post-restore location change still re-syncs an untouched auto-synced subtitle (Paris → reload → London)", () => {
  // After reload, text is still Paris and provenance was restored from the draft.
  const boxes = [
    { id: "title", text: "The Night We Became One" },
    { id: "subtitle", text: "Paris, France" },
    { id: "dedication", text: SAMPLE_DESIGN_DATE },
  ];
  const restoredLastAutoSynced = {
    subtitle: "Paris, France",
    dedication: SAMPLE_DESIGN_DATE,
  };

  const afterLondon = syncSampleDesignTextBoxes({
    textBoxes: boxes,
    touched: { subtitle: false, dedication: false },
    lastAutoSynced: restoredLastAutoSynced,
    locationDisplayName: "London, United Kingdom",
  });
  assert.equal(afterLondon.changed, true);
  assert.equal(afterLondon.textBoxes.find((b) => b.id === "subtitle")?.text, "London, United Kingdom");
  assert.equal(afterLondon.lastAutoSynced.subtitle, "London, United Kingdom");
  // Without restored provenance, Paris would fail the eligibility check:
  const withoutProvenance = syncSampleDesignTextBoxes({
    textBoxes: boxes,
    touched: { subtitle: false, dedication: false },
    lastAutoSynced: { subtitle: null, dedication: null },
    locationDisplayName: "London, United Kingdom",
  });
  assert.equal(withoutProvenance.changed, false);
  assert.equal(withoutProvenance.textBoxes.find((b) => b.id === "subtitle")?.text, "Paris, France");
  assert.equal(SAMPLE_DESIGN_PLACE, "Santorini, Greece");
});

test("both editor draft serializers persist sampleDesignLastAutoSynced on save and restore", () => {
  const editorExperience = readSrc("src/components/EditorExperience.tsx");
  assert.match(editorExperience, /sampleDesignLastAutoSynced: state\.sampleDesignLastAutoSynced/);
  assert.match(editorExperience, /sampleDesignLastAutoSynced: draft\.sampleDesignLastAutoSynced/);
  assert.match(editorExperience, /dateTimeIsUntouchedDefault: false/);

  const simplified = readSrc("src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.match(simplified, /sampleDesignLastAutoSynced,/);
  assert.match(simplified, /setSampleDesignLastAutoSynced\(\{/);
  assert.match(simplified, /sampleDesignLastAutoSynced,/);

  const editorDraft = readSrc("src/lib/editorDraft.ts");
  assert.match(editorDraft, /sampleDesignLastAutoSynced/);
  assert.match(editorDraft, /normalizeSampleDesignLastAutoSynced/);

  assert.equal(DEFAULT_TIME, "21:00:00");
});
