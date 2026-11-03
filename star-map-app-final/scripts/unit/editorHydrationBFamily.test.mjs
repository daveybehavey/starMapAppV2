import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Audit B-01..B-05 (StarMapCo audit loop, 2026-11-03) — the editor
// hydration / autosave overwrite family:
//
//   B-01  A user edit landing after the draft restore but before
//         the hydration fetch started was swept into the fetch
//         baseline and overwritten by the saved-map response.
//         The start gate now anchors a second baseline at restore
//         completion: initialization runs inside the store's
//         system-write scope and never advances the generation,
//         so ANY advance before the fetch starts refuses it.
//   B-02  Mobile refused premium render modes for unpaid users
//         (a paywall block) where desktop applied the mode and
//         showed the upsell. Mobile now applies like desktop and
//         only shows the upsell banner.
//   B-03  selectedOccasion lived in per-instance hook state, so
//         the desktop and mobile surfaces held divergent copies
//         and mobile rewrote the draft behind the parent's
//         autosave. It is store-resident now; mobile derives only
//         customOccasion from the draft and never writes it.
//   B-04  A second hook instance's mount initialization (the
//         quick-lock effect, the 150 ms visual-options timer)
//         overwrote the first surface's visual choices in the
//         shared store. Only the driving instance initializes;
//         mobile mounts as a non-driver.
//   B-05  Render-mode / intensity intent did not advance the edit
//         generation when the user acted — only ~150 ms later,
//         when the derived renderOptions write landed. The intent
//         fields are store-resident and counted synchronously
//         (behavioural pins: editorHydrationGenerationSync).
//
// These tests pin the B-01 start gate's truth table against the
// real guard, plus the component/hook wiring the behaviours rely
// on. Behavioural generation counting is pinned separately in
// editorHydrationGenerationSync.test.mjs; the S93/F7 wiring pins
// live in editorHydrationGuardS93.test.mjs.

const { shouldStartMapHydration } = await import(
  "../../src/lib/editorHydrationGuard.ts"
);

const read = (rel) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

const startBase = {
  restored: true,
  visualOptionsInitialized: true,
  alreadyHandled: false,
  mapId: "map-1",
};

test("B-01 start gate: matching restore baseline allows the fetch to start", () => {
  assert.equal(
    shouldStartMapHydration({
      ...startBase,
      editGenerationAtRestore: 7,
      editGenerationNow: 7,
    }),
    true,
  );
});

test("B-01 start gate: ANY generation advance between restore and start refuses the fetch", () => {
  assert.equal(
    shouldStartMapHydration({
      ...startBase,
      editGenerationAtRestore: 7,
      editGenerationNow: 8,
    }),
    false,
    "one pre-fetch user edit is enough — the response would overwrite it",
  );
  assert.equal(
    shouldStartMapHydration({
      ...startBase,
      editGenerationAtRestore: 7,
      editGenerationNow: 30,
    }),
    false,
  );
});

test("B-01 start gate: callers that do not track the baseline keep the legacy table", () => {
  // No generation fields at all.
  assert.equal(shouldStartMapHydration(startBase), true);
  // A null baseline (restore has not captured one) does not gate.
  assert.equal(
    shouldStartMapHydration({
      ...startBase,
      editGenerationAtRestore: null,
      editGenerationNow: 12,
    }),
    true,
  );
  // A missing live reading does not gate either.
  assert.equal(
    shouldStartMapHydration({
      ...startBase,
      editGenerationAtRestore: 7,
      editGenerationNow: undefined,
    }),
    true,
  );
});

test("B-01 start gate: the legacy conditions still refuse regardless of the baseline", () => {
  const matching = { editGenerationAtRestore: 7, editGenerationNow: 7 };
  assert.equal(
    shouldStartMapHydration({ ...startBase, ...matching, restored: false }),
    false,
  );
  assert.equal(
    shouldStartMapHydration({
      ...startBase,
      ...matching,
      visualOptionsInitialized: false,
    }),
    false,
  );
  assert.equal(
    shouldStartMapHydration({ ...startBase, ...matching, alreadyHandled: true }),
    false,
  );
  assert.equal(
    shouldStartMapHydration({ ...startBase, ...matching, mapId: null }),
    false,
  );
});

test("B-01 wiring: EditorExperience captures the restore baseline and feeds the start gate", () => {
  const src = read("src/components/EditorExperience.tsx");
  // The baseline ref exists and is captured from the store when
  // the restore effect completes…
  assert.match(
    src,
    /const editGenerationAtRestoreRef = useRef<number \| null>\(null\);/,
  );
  assert.match(
    src,
    /editGenerationAtRestoreRef\.current = useStore\.getState\(\)\.editGeneration;/,
  );
  // …the restore and the URL prefill both run inside the
  // system-write scope, so neither can move the generation past
  // the baseline…
  assert.match(src, /runAsSystemWrite\(\(\) => useStore\.setState\(\{/);
  assert.match(src, /runAsSystemWrite\(\(\) => \{\s*const sourceParam = searchParams\.get\("source"\);/);
  // …and the start-gate call passes both generation readings.
  assert.match(
    src,
    /editGenerationAtRestore: editGenerationAtRestoreRef\.current,\s*editGenerationNow: useStore\.getState\(\)\.editGeneration,/,
  );
});

test("B-04 wiring: only the driving hook instance seeds defaults and runs the visual-options timer", () => {
  const hook = read("src/hooks/useEditorLogic.ts");
  // The driver flag defaults to true (desktop drives)…
  assert.match(hook, /visualOptionsDriver = true/);
  // …the seed effect is driver-only…
  assert.match(
    hook,
    /if \(!visualOptionsDriver\) return;\s*seedEditorIntensityDefaults\(isQuick \? 70 : 50\);/,
  );
  // …the ~150 ms apply effect is driver-only…
  assert.match(
    hook,
    /useEffect\(\(\) => \{\s*if \(!visualOptionsDriver\) return;\s*const t = setTimeout\(/,
  );
  // …the visual-options derivation is ALWAYS a system write: it
  // is a pure function of (mode, intensity) and never solely
  // carries user work (the intent fields record the gesture
  // synchronously), so not even the derivation following the
  // automatic premium cap can advance the generation past the
  // restore baseline (B-01; Codex P1 on PR #549).
  assert.match(
    hook,
    /runAsSystemWrite\(\(\) => setRenderOptions\(derivedOptions\)\);/,
  );
  assert.doesNotMatch(hook, /visualOptionsAppliedOnceRef/);
  // …and the display→intensity sync defers into a system write
  // for the same reason: on a fresh unpaid quick mount its
  // premium cap (seeded 70 → 60) fires with no user gesture.
  assert.match(
    hook,
    /const t = setTimeout\(\(\) => \{\s*runAsSystemWrite\(\(\) => setIntensity\(next\)\);/,
  );
});

test("B-03/B-04 wiring: MobileCreate mounts as a non-driver and never writes the draft selection", () => {
  const mobile = read("src/app/MobileCreate.tsx");
  assert.match(
    mobile,
    /useEditorLogic\(\{ variant, visualOptionsDriver: false \}\);/,
  );
  // No quick-lock mount effect re-imposing cinematic/70 (B-04)…
  assert.doesNotMatch(mobile, /lockedIntensity/);
  // …no effect syncing the selection back into the draft behind
  // the parent's autosave, and no draft writes from this surface
  // at all (B-03)…
  assert.doesNotMatch(mobile, /Sync selectedOccasion to draft/);
  assert.doesNotMatch(mobile, /localStorage\.setItem\("star-map-draft"/);
  assert.doesNotMatch(mobile, /setSelectedOccasion\(parsed\.selectedOccasion\)/);
  // …the mount effect only derives customOccasion for a
  // null-selection draft, and depends on nothing but that setter.
  const mountAt = mobile.indexOf("// Derive customOccasion from the draft on mount.");
  const nextAt = mobile.indexOf("// Handle intensity change", mountAt);
  assert.ok(mountAt !== -1 && nextAt > mountAt);
  const mountEffect = mobile.slice(mountAt, nextAt);
  assert.match(mountEffect, /resolveRestoredCustomOccasion\(\{/);
  assert.match(mountEffect, /\}, \[setCustomOccasion\]\);/);
});

test("B-02 wiring: mobile render-mode change shows the upsell but applies the mode like desktop", () => {
  const mobile = read("src/app/MobileCreate.tsx");
  const startAt = mobile.indexOf("const handleRenderModeChange = useCallback(");
  const endAt = mobile.indexOf("const handleStartPreset", startAt);
  assert.ok(startAt !== -1 && endAt > startAt);
  const handler = mobile.slice(startAt, endAt);
  // The paywall block event and the early return are gone…
  assert.doesNotMatch(handler, /paywall_render_mode_blocked/);
  assert.doesNotMatch(handler, /return;/);
  // …the upsell banner + event remain, and the mode is applied
  // after them.
  const upsellAt = handler.indexOf('track("mobile_render_mode_upsell_shown"');
  const applyAt = handler.indexOf("setRenderMode(mode);");
  assert.ok(upsellAt !== -1 && applyAt > upsellAt);
  assert.match(handler, /setShowRenderModeBanner\(true\);/);
  assert.match(handler, /track\("render_mode_changed", \{ mode \}\);/);
});
