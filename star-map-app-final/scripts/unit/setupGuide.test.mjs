import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getSetupGuideField } from "./setupGuide.harness.mjs";
import { scrollToSetupField } from "../../src/lib/setupGuide.ts";

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
  // The guide uses the same confirmed-place predicate as canReveal
  // (useEditorLogic's hasConfirmedEditorLocation): with the date set and
  // a name-only place — exactly what a free-typed quick-start handoff
  // produces — the guide must target "place", not read setup as complete
  // and leave both guide buttons dead.
  assert.match(mobile, /import \{ hasConfirmedEditorLocation \} from "@\/lib\/editorLocationPrefill";/);
  assert.match(mobile, /const hasConfirmedLocation = hasConfirmedEditorLocation\(location\);/);
  assert.match(mobile, /getSetupGuideField\(\{ hasDate, hasPlace: hasConfirmedLocation \}\)/);
  assert.doesNotMatch(mobile, /getSetupGuideField\(\{ hasDate, hasPlace: hasLocation \}\)/);
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

test("guide re-queries the field selector when the first query misses", () => {
  const guide = readSrc("lib/setupGuide.ts");
  // Initial lookup + the deferred re-query after an expand.
  assert.ok(countOccurrences(guide, "querySelector<HTMLElement>(SETUP_FIELD_SELECTORS[field])") >= 2);
});

function fakeField() {
  const field = {
    scrolls: [],
    focusCount: 0,
    focusOptions: undefined,
    scrollIntoView(options) {
      field.scrolls.push(options);
    },
    focus(options) {
      field.focusCount += 1;
      field.focusOptions = options;
    },
  };
  return field;
}

function installDomStubs() {
  const timers = [];
  const originals = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  globalThis.window = {
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
  };
  globalThis.document = { activeElement: null };
  globalThis.requestAnimationFrame = (fn) => {
    fn();
    return 1;
  };
  return {
    timers,
    restore() {
      globalThis.window = originals.window;
      globalThis.document = originals.document;
      globalThis.requestAnimationFrame = originals.requestAnimationFrame;
    },
  };
}

test("guide re-queries after a delay and focuses a field that mounts late", () => {
  const dom = installDomStubs();
  try {
    const field = fakeField();
    let mounted = false;
    const containerScrolls = [];
    const container = {
      querySelector: () => (mounted ? field : null),
      scrollIntoView(options) {
        containerScrolls.push(options);
      },
    };

    scrollToSetupField(container, "date");
    // Not mounted yet (the card is still expanding): container fallback
    // scroll, no focus attempt, exactly one deferred re-query queued.
    assert.deepEqual(containerScrolls, [{ behavior: "smooth", block: "start" }]);
    assert.equal(field.focusCount, 0);
    assert.equal(dom.timers.length, 1);
    assert.equal(dom.timers[0].ms, 350);

    // The expansion mounts the field; the re-query finds and focuses it.
    mounted = true;
    dom.timers[0].fn();
    assert.deepEqual(field.scrolls, [{ behavior: "smooth", block: "center" }]);
    assert.equal(field.focusCount, 1);
    assert.deepEqual(field.focusOptions, { preventScroll: true });
  } finally {
    dom.restore();
  }
});

test("guide gives up quietly when the field never mounts", () => {
  const dom = installDomStubs();
  try {
    const container = { querySelector: () => null, scrollIntoView() {} };
    scrollToSetupField(container, "place");
    assert.equal(dom.timers.length, 1);
    assert.doesNotThrow(() => dom.timers[0].fn());
  } finally {
    dom.restore();
  }
});

test("guide scrolls and focuses an already-mounted field immediately", () => {
  const dom = installDomStubs();
  try {
    const field = fakeField();
    const container = {
      querySelector: () => field,
      scrollIntoView() {
        throw new Error("container must not scroll when the field is mounted");
      },
    };
    scrollToSetupField(container, "date");
    assert.deepEqual(field.scrolls, [{ behavior: "smooth", block: "center" }]);
    // Focus lands through requestAnimationFrame (stubbed synchronous)…
    assert.equal(field.focusCount, 1);
    // …and the found-path focus retry does not refocus a focused field.
    globalThis.document.activeElement = field;
    assert.equal(dom.timers.length, 1);
    dom.timers[0].fn();
    assert.equal(field.focusCount, 1);
  } finally {
    dom.restore();
  }
});
