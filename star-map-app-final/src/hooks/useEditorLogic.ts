"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, type RenderOptions } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { occasionPresets } from "@/lib/occasionPresets";
import { proPresets } from "@/lib/proPresets";
import { renderModes, type RenderModeId } from "@/lib/renderModes";
import { track } from "@/lib/analytics";

export interface UseEditorLogicOptions {
  /** Editor variant affects default intensity value */
  variant?: "quick" | "full";
  /** Callback when visual options are applied (for loading states) */
  onVisualOptionsApplied?: () => void;
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

  // Local editor state
  renderMode: RenderModeId;
  setRenderMode: (mode: RenderModeId) => void;
  intensity: number;
  setIntensity: (value: number) => void;
  intensityDisplay: number;
  setIntensityDisplay: (value: number) => void;
  selectedOccasion: string | null;
  setSelectedOccasion: (id: string | null) => void;
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
  const { variant = "full", onVisualOptionsApplied } = options;
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
    }))
  );

  // Local editor state
  const [renderMode, setRenderMode] = useState<RenderModeId>("cinematic");
  const [intensity, setIntensity] = useState(isQuick ? 70 : 50);
  const [intensityDisplay, setIntensityDisplay] = useState(isQuick ? 70 : 50);
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [customOccasion, setCustomOccasion] = useState(false);
  const [presetHint, setPresetHint] = useState<string | null>(null);
  const presetHintTimerRef = useRef<number | null>(null);

  // Derived state
  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  const canReveal = Boolean(locationName) && hasDate;

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

      setRenderOptions({
        starIntensity,
        starGlow,
        visualMode,
        constellationLines,
        planetEmphasis,
      });

      onVisualOptionsApplied?.();
    },
    [setRenderOptions, onVisualOptionsApplied]
  );

  // Sync intensity with intensityDisplay (with debounce and premium cap)
  useEffect(() => {
    let next = intensityDisplay;
    if (!paid && next > 60) {
      next = 60;
    }
    if (next === intensity) return;
    const t = setTimeout(() => setIntensity(next), 200);
    return () => clearTimeout(t);
  }, [intensityDisplay, paid, intensity]);

  // Apply visual options when render mode or intensity changes
  useEffect(() => {
    const t = setTimeout(() => {
      applyVisualOptions(renderMode, intensity);
    }, 150);
    return () => clearTimeout(t);
  }, [applyVisualOptions, intensity, renderMode]);

  /**
   * Apply an occasion preset (wedding, birthday, etc).
   * Optionally scrolls to a target element after applying.
   */
  const applyPreset = useCallback(
    (id: string, scrollTarget?: HTMLElement | null) => {
      const preset = occasionPresets.find((item) => item.id === id);
      if (!preset) return;

      const shouldAutofill = !locationName || !hasDate;
      setSelectedOccasion(id);
      setCustomOccasion(false);
      track("occasion_selected", { preset: id, autofill: shouldAutofill });

      // Always apply style, shape, textBoxes, and render options from preset
      setTextBoxes(preset.textBoxes);
      setStyle(preset.style);
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
      hasDate,
      locationName,
      setDateTime,
      setLocation,
      setRevealed,
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
      setShape(preset.shape);
      setAspectRatio(preset.aspectRatio);
      setTextBoxes(preset.textBoxes);
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

    // Local state
    renderMode,
    setRenderMode,
    intensity,
    setIntensity,
    intensityDisplay,
    setIntensityDisplay,
    selectedOccasion,
    setSelectedOccasion,
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
