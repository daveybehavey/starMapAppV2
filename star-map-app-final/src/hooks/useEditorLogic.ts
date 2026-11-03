"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  runAsSystemWrite,
  seedEditorIntensityDefaults,
  useStore,
  type RenderOptions,
} from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { occasionPresets } from "@/lib/occasionPresets";
import { proPresets } from "@/lib/proPresets";
import { renderModes, type RenderModeId } from "@/lib/renderModes";
import { applyStyleDefaults } from "@/lib/styleDefaults";
import { track } from "@/lib/analytics";
import { hasConfirmedEditorLocation } from "@/lib/editorLocationPrefill";
import { formatDateTimeForLocation } from "@/lib/dateTime";
import { resolvePresetTextBoxesOnApply, shouldAutofillPresetSky } from "@/lib/sampleDesignTextSync";
import {
  cloneTextBoxWithExplicitBinding,
  cloneTextBoxWithNormalizedBinding,
} from "@/lib/textStyleBinding";

export interface UseEditorLogicOptions {
  /** Editor variant affects default intensity value */
  variant?: "quick" | "full";
  /** Callback when visual options are applied (for loading states) */
  onVisualOptionsApplied?: () => void;
  /**
   * Whether this instance drives the shared visual-options
   * initialization: the ~150 ms applyVisualOptions effect that
   * derives renderOptions from renderMode/intensity. Exactly one
   * mounted instance may drive it (the desktop editor). A second
   * instance (the mobile surface) shares the same store state but
   * must not re-run the initialization on mount — its own initial
   * values landing in the shared store overwrote the other
   * surface's choices (audit B-04). Non-driving instances still
   * apply visual options immediately from their own event
   * handlers. Defaults to true.
   */
  visualOptionsDriver?: boolean;
}

export interface UseEditorLogicReturn {
  // Store state (passthrough for convenience)
  dateTime: string;
  location: ReturnType<typeof useStore.getState>["location"];
  textBoxes: ReturnType<typeof useStore.getState>["textBoxes"];
  selectedStyle: ReturnType<typeof useStore.getState>["selectedStyle"];
  aspectRatio: ReturnType<typeof useStore.getState>["aspectRatio"];
  shape: ReturnType<typeof useStore.getState>["shape"];
  renderOptions: ReturnType<typeof useStore.getState>["renderOptions"];
  previewFidelity: ReturnType<typeof useStore.getState>["previewFidelity"];
  paid: boolean;
  revealed: boolean;
  selectedOccasion: ReturnType<typeof useStore.getState>["selectedOccasion"];
  renderMode: ReturnType<typeof useStore.getState>["renderMode"];
  intensity: ReturnType<typeof useStore.getState>["intensity"];
  intensityDisplay: ReturnType<typeof useStore.getState>["intensityDisplay"];

  // Store setters (passthrough for convenience)
  setDateTime: ReturnType<typeof useStore.getState>["setDateTime"];
  setLocation: ReturnType<typeof useStore.getState>["setLocation"];
  setTextBoxes: ReturnType<typeof useStore.getState>["setTextBoxes"];
  updateTextBox: ReturnType<typeof useStore.getState>["updateTextBox"];
  removeTextBox: ReturnType<typeof useStore.getState>["removeTextBox"];
  addTextBox: ReturnType<typeof useStore.getState>["addTextBox"];
  setStyle: ReturnType<typeof useStore.getState>["setStyle"];
  setAspectRatio: ReturnType<typeof useStore.getState>["setAspectRatio"];
  setShape: ReturnType<typeof useStore.getState>["setShape"];
  setRenderOptions: ReturnType<typeof useStore.getState>["setRenderOptions"];
  setPreviewFidelity: ReturnType<typeof useStore.getState>["setPreviewFidelity"];
  setPaid: ReturnType<typeof useStore.getState>["setPaid"];
  setRevealed: ReturnType<typeof useStore.getState>["setRevealed"];
  setSelectedOccasion: ReturnType<typeof useStore.getState>["setSelectedOccasion"];
  setRenderMode: ReturnType<typeof useStore.getState>["setRenderMode"];
  setIntensity: ReturnType<typeof useStore.getState>["setIntensity"];
  setIntensityDisplay: ReturnType<typeof useStore.getState>["setIntensityDisplay"];

  // Local editor state (per-instance UI state, not design state)
  customOccasion: boolean;
  setCustomOccasion: (value: boolean) => void;
  presetHint: string | null;
  setPresetHint: (hint: string | null) => void;

  // Derived state
  locationName: string;
  hasDate: boolean;
  canReveal: boolean;

  // Actions
  applyVisualOptions: (mode: RenderModeId, level: number) => void;
  applyPreset: (id: string, scrollTarget?: HTMLElement | null) => void;
  applyProPreset: (id: string) => void;
}

/**
 * Shared editor logic hook that extracts common functionality from
 * EditorExperience and MobileCreate components.
 *
 * Includes:
 * - Store state selectors with useShallow
 * - Render mode and intensity management
 * - Preset application logic
 * - Derived state calculations
 * - Memory leak prevention for timers
 */
export function useEditorLogic(options: UseEditorLogicOptions = {}): UseEditorLogicReturn {
  const { variant = "full", onVisualOptionsApplied, visualOptionsDriver = true } = options;
  const isQuick = variant === "quick";

  // Store state with useShallow to prevent unnecessary re-renders
  const {
    dateTime,
    location,
    textBoxes,
    selectedStyle,
    aspectRatio,
    shape,
    renderOptions,
    previewFidelity,
    paid,
    revealed,
    selectedOccasion,
    renderMode,
    intensity,
    intensityDisplay,
    setDateTime,
    setLocation,
    setTextBoxes,
    updateTextBox,
    removeTextBox,
    addTextBox,
    setStyle,
    setAspectRatio,
    setShape,
    setRenderOptions,
    setPreviewFidelity,
    setPaid,
    setRevealed,
    setSelectedOccasion,
    setRenderMode,
    setIntensity,
    setIntensityDisplay,
  } = useStore(
    useShallow((state) => ({
      dateTime: state.dateTime,
      location: state.location,
      textBoxes: state.textBoxes,
      selectedStyle: state.selectedStyle,
      aspectRatio: state.aspectRatio,
      shape: state.shape,
      renderOptions: state.renderOptions,
      previewFidelity: state.previewFidelity,
      paid: state.paid,
      revealed: state.revealed,
      selectedOccasion: state.selectedOccasion,
      renderMode: state.renderMode,
      intensity: state.intensity,
      intensityDisplay: state.intensityDisplay,
      setDateTime: state.setDateTime,
      setLocation: state.setLocation,
      setTextBoxes: state.setTextBoxes,
      updateTextBox: state.updateTextBox,
      removeTextBox: state.removeTextBox,
      addTextBox: state.addTextBox,
      setStyle: state.setStyle,
      setAspectRatio: state.setAspectRatio,
      setShape: state.setShape,
      setRenderOptions: state.setRenderOptions,
      setPreviewFidelity: state.setPreviewFidelity,
      setPaid: state.setPaid,
      setRevealed: state.setRevealed,
      setSelectedOccasion: state.setSelectedOccasion,
      setRenderMode: state.setRenderMode,
      setIntensity: state.setIntensity,
      setIntensityDisplay: state.setIntensityDisplay,
    }))
  );

  // renderMode / intensity / intensityDisplay / selectedOccasion
  // are store-resident (see src/lib/store.ts). They used to be
  // per-instance useState here, which gave the desktop and mobile
  // hook instances divergent copies of the same design intent:
  // autosave serialized one instance's occasion while the other
  // instance's selection was what the user saw (audit B-03), a
  // second instance's mount initialization overwrote the first
  // surface's visual choices in the shared store (B-04), and
  // neither a mode change nor the S96-2 F7 occasion wrapper could
  // advance the edit generation for the OTHER instance's edits —
  // the store's synchronous subscription now covers all four
  // fields for every caller (B-05). Only genuinely per-instance
  // UI state remains local:
  const [customOccasion, setCustomOccasion] = useState(false);
  const [presetHint, setPresetHint] = useState<string | null>(null);
  const presetHintTimerRef = useRef<number | null>(null);

  // The driving instance seeds the variant's intensity default
  // into the shared store, once per page session (the store's
  // initial values already carry the quick variant's 70, so in
  // production this is a no-op; the full variant still starts at
  // 50). Seeding is a system write — initialization, not an edit.
  useEffect(() => {
    if (!visualOptionsDriver) return;
    seedEditorIntensityDefaults(isQuick ? 70 : 50);
  }, [visualOptionsDriver, isQuick]);

  // Derived state
  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  // Require confirmed coordinates so name-only / (0,0) handoffs cannot reveal a wrong sky.
  const canReveal = hasConfirmedEditorLocation(location) && hasDate;

  // Cleanup presetHintTimer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (presetHintTimerRef.current) {
        window.clearTimeout(presetHintTimerRef.current);
      }
    };
  }, []);

  /**
   * Apply visual options based on render mode and intensity level.
   * Maps render mode + intensity to specific RenderOptions values.
   */
  const applyVisualOptions = useCallback(
    (mode: RenderModeId, level: number) => {
      const cfg = renderModes[mode];
      const normalized = Math.min(Math.max(level / 100, 0), 1);

      const starIntensity: RenderOptions["starIntensity"] =
        normalized < 0.3 ? "subtle" : normalized < 0.7 ? "normal" : "bold";
      const starGlow = cfg.glow + normalized * 0.2 > 0.3;
      const visualMode: RenderOptions["visualMode"] =
        mode === "blueprint" ? "astronomical" : mode === "cinematic" ? "illustrated" : "enhanced";
      const constellationLines: RenderOptions["constellationLines"] =
        mode === "blueprint" ? "thick" : "thin";
      const planetEmphasis: RenderOptions["planetEmphasis"] =
        cfg.contrast > 1.15 ? "highlighted" : "normal";

      const derivedOptions: Partial<RenderOptions> = {
        starIntensity,
        starGlow,
        visualMode,
        constellationLines,
        planetEmphasis,
      };
      // The derived options are a pure function of (mode,
      // intensity), and EVERY user change to those fields is
      // recorded synchronously at the intent fields themselves,
      // on every call path: the mode/intensity handlers set them
      // before calling this, presets set all three, and the
      // display→intensity sync below is itself a derivation. So
      // this write never solely carries user work and always
      // runs as a system write. That matters beyond the first
      // application: the automatic premium cap (fresh unpaid
      // quick mount, seeded 70 capped to 60) changes intensity
      // with no user gesture, and the derivation that follows it
      // must not advance the edit generation either — otherwise
      // the saved-map hydration baseline (anchored at restore)
      // is defeated by pure initialization (audit B-01; Codex
      // P1 on PR #549).
      runAsSystemWrite(() => setRenderOptions(derivedOptions));

      onVisualOptionsApplied?.();
    },
    [setRenderOptions, onVisualOptionsApplied]
  );

  // Sync intensity with intensityDisplay (with debounce and
  // premium cap). The deferred write is a mechanical derivation
  // of a value already recorded synchronously at its source —
  // setIntensityDisplay / setIntensity on every handler and
  // preset path — and on a fresh unpaid quick mount it is pure
  // initialization: the seeded display value (70) is capped to
  // 60 with no user gesture at all. It therefore runs as a
  // system write; counting it as an edit would defeat saved-map
  // hydration on exactly that mount sequence (Codex P1 on
  // PR #549).
  useEffect(() => {
    let next = intensityDisplay;
    if (!paid && next > 60) {
      next = 60;
    }
    if (next === intensity) return;
    const t = setTimeout(() => {
      runAsSystemWrite(() => setIntensity(next));
    }, 200);
    return () => clearTimeout(t);
  }, [intensityDisplay, paid, intensity]);

  // Apply visual options when render mode or intensity changes.
  // Only the driving instance runs this: a non-driving instance
  // mounting later must not re-derive the shared renderOptions
  // from the shared mode/intensity on a timer (audit B-04) — its
  // handlers apply immediately when the user acts.
  useEffect(() => {
    if (!visualOptionsDriver) return;
    const t = setTimeout(() => {
      applyVisualOptions(renderMode, intensity);
    }, 150);
    return () => clearTimeout(t);
  }, [applyVisualOptions, intensity, renderMode, visualOptionsDriver]);

  /**
   * Apply an occasion preset (wedding, birthday, etc).
   * Optionally scrolls to a target element after applying.
   */
  const applyPreset = useCallback(
    (id: string, scrollTarget?: HTMLElement | null) => {
      const preset = occasionPresets.find((item) => item.id === id);
      if (!preset) return;

      // Only autofill when the user hasn't genuinely provided a sky yet.
      // The decision is provenance-based (see shouldAutofillPresetSky):
      // a confirmed location or a deliberately picked date is preserved,
      // and the untouched placeholder sky always autofills (D16). The
      // restore-derived customOccasion flag must NOT gate this — it is
      // false for exactly the restored drafts whose picked dates most
      // need preserving (Codex P2 on PR #310); the draft persists the
      // untouched flag so the store value read here is exact after a
      // reload as well.
      const shouldAutofill = shouldAutofillPresetSky({
        hasConfirmedLocation: hasConfirmedEditorLocation(location),
        dateTimeIsUntouchedDefault: useStore.getState().dateTimeIsUntouchedDefault,
        hasDate,
      });
      setSelectedOccasion(id);
      // If we are not autofilling, keep the "custom" state so the UI preserves
      // the user's manual inputs (and doesn't clear the location text field).
      setCustomOccasion(shouldAutofill ? false : true);
      track("occasion_selected", { preset: id, autofill: shouldAutofill });

      // Always apply style, shape, textBoxes, and render options from preset.
      // When custom sky inputs are preserved, sync eligible sample subtitle/
      // dedication to that sky immediately (same rules as picker sync).
      // Touch flags are reset by EditorExperience / MobileCreate wrappers (PR #293).
      const preserveCustomSky = !shouldAutofill;
      const dateParts = formatDateTimeForLocation(dateTime, location.timezone || "UTC");
      // Preset typography is authored content (#408): mark the clones
      // explicit BEFORE sample-text resolution so the resolved boxes that
      // get committed keep that provenance, and style defaults applied
      // later can never recolour them.
      const explicitPresetTextBoxes = preset.textBoxes.map(cloneTextBoxWithExplicitBinding);
      const resolvedText = resolvePresetTextBoxesOnApply({
        presetTextBoxes: explicitPresetTextBoxes,
        preserveCustomSky,
        locationDisplayName: location.name,
        dateValue: dateParts?.date || undefined,
      });
      setTextBoxes(resolvedText.textBoxes);
      useStore.getState().clearSampleDesignLastAutoSynced();
      if (resolvedText.changed) {
        useStore.getState().setSampleDesignLastAutoSynced(resolvedText.lastAutoSynced);
      }
      setStyle(preset.style);
      const styleDefaults = applyStyleDefaults(preset.style, explicitPresetTextBoxes);
      if (Object.keys(styleDefaults.renderOptions).length) {
        setRenderOptions(styleDefaults.renderOptions);
      }
      setShape(preset.shape);
      setRenderMode(preset.renderMode);
      setIntensity(preset.intensity);
      setIntensityDisplay(preset.intensity);
      applyVisualOptions(preset.renderMode, preset.intensity);

      if (shouldAutofill) {
        // Also set date/location if user hasn't entered them yet
        setDateTime(preset.dateTimeISO);
        setLocation(preset.location as Parameters<typeof setLocation>[0]);
        setPresetHint("Preset applied — edit date or location anytime.");
      } else {
        setPresetHint("Preset applied — date and location preserved.");
      }
      setRevealed(true);

      // Scroll to target if provided
      if (scrollTarget) {
        setTimeout(() => {
          scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }

      // Clear preset hint after delay
      if (presetHintTimerRef.current) {
        window.clearTimeout(presetHintTimerRef.current);
      }
      presetHintTimerRef.current = window.setTimeout(() => {
        setPresetHint(null);
        presetHintTimerRef.current = null;
      }, 2400);
    },
    [
      applyVisualOptions,
      customOccasion,
      dateTime,
      hasDate,
      location,
      locationName,
      setDateTime,
      setLocation,
      setRenderOptions,
      setRevealed,
      setSelectedOccasion,
      setShape,
      setStyle,
      setTextBoxes,
    ]
  );

  /**
   * Apply a pro preset with full render options override.
   */
  const applyProPreset = useCallback(
    (id: string) => {
      const preset = proPresets.find((entry) => entry.id === id);
      if (!preset) return;

      setSelectedOccasion(id);
      setCustomOccasion(false);
      setStyle(preset.style);
      // Existing presets retain authored typography (#408). Evergreen
      // intentionally follows automatic style/tier typography (#514).
      const explicitPresetTextBoxes = preset.textBoxes.map(
        preset.style === "evergreenAtlas"
          ? cloneTextBoxWithNormalizedBinding
          : cloneTextBoxWithExplicitBinding,
      );
      const styleDefaults = applyStyleDefaults(preset.style, explicitPresetTextBoxes);
      if (Object.keys(styleDefaults.renderOptions).length) {
        setRenderOptions(styleDefaults.renderOptions);
      }
      setShape(preset.shape);
      setAspectRatio(preset.aspectRatio);
      setTextBoxes(explicitPresetTextBoxes);
      useStore.getState().clearSampleDesignLastAutoSynced();
      setRenderMode(preset.renderMode);
      setIntensity(preset.intensity);
      setIntensityDisplay(preset.intensity);
      // Apply base visual options first, then merge preset-specific overrides
      applyVisualOptions(preset.renderMode, preset.intensity);
      setRenderOptions(preset.renderOptions);
      track("pro_preset_selected", { preset: id });
    },
    [
      applyVisualOptions,
      setAspectRatio,
      setRenderOptions,
      setSelectedOccasion,
      setShape,
      setStyle,
      setTextBoxes,
    ]
  );

  return {
    // Store state
    dateTime,
    location,
    textBoxes,
    selectedStyle,
    aspectRatio,
    shape,
    renderOptions,
    previewFidelity,
    paid,
    revealed,
    selectedOccasion,
    renderMode,
    intensity,
    intensityDisplay,

    // Store setters
    setDateTime,
    setLocation,
    setTextBoxes,
    updateTextBox,
    removeTextBox,
    addTextBox,
    setStyle,
    setAspectRatio,
    setShape,
    setRenderOptions,
    setPreviewFidelity,
    setPaid,
    setRevealed,
    setSelectedOccasion,
    setRenderMode,
    setIntensity,
    setIntensityDisplay,

    // Local state
    customOccasion,
    setCustomOccasion,
    presetHint,
    setPresetHint,

    // Derived state
    locationName,
    hasDate,
    canReveal,

    // Actions
    applyVisualOptions,
    applyPreset,
    applyProPreset,
  };
}
