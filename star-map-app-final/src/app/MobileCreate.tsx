"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, type TextBox, type RenderOptions } from "@/lib/store";
import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import { EditorDrawer } from "@/components/EditorDrawer";
import { occasionPresets } from "@/lib/occasionPresets";
import { renderModes, type RenderModeId } from "@/lib/renderModes";
import { aspectRatioToNumber } from "@/lib/renderSky";
import { styles, fontOptions, visualModes, shapes, constellationPresets } from "@/lib/config";
import { proPresets } from "@/lib/proPresets";
import { track } from "@/lib/analytics";
import { useShallow } from "zustand/react/shallow";

interface MobileCreateProps {
  onExport: (mode: "preview" | "hd") => void;
  onShareImage: () => void;
  onShare: () => void;
  onCanvasReady?: () => void;
  variant?: "quick" | "full";
  onCustomizeMore?: () => void;
}

export function MobileCreate({
  onExport,
  onShareImage,
  onShare,
  onCanvasReady,
  variant = "full",
  onCustomizeMore,
}: MobileCreateProps) {
  const {
    dateTime,
    setDateTime,
    location,
    setLocation,
    textBoxes,
    setTextBoxes,
    updateTextBox,
    removeTextBox,
    addTextBox,
    selectedStyle,
    setStyle,
    shape,
    setShape,
    aspectRatio,
    setAspectRatio,
    renderOptions,
    previewFidelity,
    setRenderOptions,
    setPreviewFidelity,
    revealed,
    setRevealed,
    paid,
  } = useStore(
    useShallow((state) => ({
      dateTime: state.dateTime,
      setDateTime: state.setDateTime,
      location: state.location,
      setLocation: state.setLocation,
      textBoxes: state.textBoxes,
      setTextBoxes: state.setTextBoxes,
      updateTextBox: state.updateTextBox,
      removeTextBox: state.removeTextBox,
      addTextBox: state.addTextBox,
      selectedStyle: state.selectedStyle,
      setStyle: state.setStyle,
      shape: state.shape,
      setShape: state.setShape,
      aspectRatio: state.aspectRatio,
      setAspectRatio: state.setAspectRatio,
      renderOptions: state.renderOptions,
      setRenderOptions: state.setRenderOptions,
      previewFidelity: state.previewFidelity,
      setPreviewFidelity: state.setPreviewFidelity,
      revealed: state.revealed,
      setRevealed: state.setRevealed,
      paid: state.paid,
    })),
  );

  const isQuick = variant === "quick";
  const [renderMode, setRenderMode] = useState<RenderModeId>("cinematic");
  const [intensity, setIntensity] = useState(isQuick ? 70 : 50);
  const [intensityDisplay, setIntensityDisplay] = useState(isQuick ? 70 : 50);
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [showAdvancedState, setShowAdvancedState] = useState(!isQuick);
  const showAdvanced = isQuick ? false : showAdvancedState;
  const presetRailRef = useRef<HTMLDivElement>(null);
  const dateLocationRef = useRef<HTMLDivElement>(null);
  const previewSectionRef = useRef<HTMLDivElement>(null);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [presetHint, setPresetHint] = useState<string | null>(null);
  const presetHintTimerRef = useRef<number | null>(null);
  const [customOccasion, setCustomOccasion] = useState(false);

  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  const canReveal = Boolean(locationName) && hasDate;
  const showGuidedForm = !revealed || !showAdvanced;
  const showEditor = revealed && showAdvanced;
  const visibleTextBoxes = showGuidedForm ? textBoxes.slice(0, 1) : textBoxes;

  // Apply visual options based on render mode and intensity
  // MATCHES DESKTOP SEMANTICS - mirrors existing desktop mappings from page.tsx
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
      const planetEmphasis: RenderOptions["planetEmphasis"] = cfg.contrast > 1.15 ? "highlighted" : "normal";

      setRenderOptions({
        starIntensity,
        starGlow,
        visualMode,
        constellationLines,
        planetEmphasis,
      });
    },
    [setRenderOptions],
  );

  const applyPreset = useCallback(
    (id: string) => {
      const preset = occasionPresets.find((p) => p.id === id);
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
      // Convert intensity from 0-1 to 0-100 scale
      const intensityPercent = Math.round(preset.intensity * 100);
      setIntensity(intensityPercent);
      setIntensityDisplay(intensityPercent);
      applyVisualOptions(preset.renderMode, intensityPercent);

      if (shouldAutofill) {
        // Also set date/location if user hasn't entered them yet
        setDateTime(preset.dateTimeISO);
        setLocation(preset.location as Parameters<typeof setLocation>[0]);
        setPresetHint("Preset applied — edit date or location anytime.");
      } else {
        setPresetHint("Preset applied — date and location preserved.");
      }
      setRevealed(true);
      setTimeout(() => {
        document.getElementById("mobile-preview")?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);

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
      setRenderMode,
      setShape,
      setStyle,
      setTextBoxes,
    ],
  );

  const applyProPreset = useCallback(
    (id: string) => {
      const preset = proPresets.find((entry) => entry.id === id);
      if (!preset) return;
      // Pro presets retain their intended renderMode and intensity for visual fidelity
      setSelectedOccasion(id);
      setCustomOccasion(false);
      setStyle(preset.style);
      setShape(preset.shape);
      setAspectRatio(preset.aspectRatio);
      setTextBoxes(preset.textBoxes);
      setRenderMode(preset.renderMode);
      setIntensity(preset.intensity);
      setIntensityDisplay(preset.intensity);
      // Apply base visual options first, then merge preset-specific overrides on top
      applyVisualOptions(preset.renderMode, preset.intensity);
      setRenderOptions(preset.renderOptions);
      track("pro_preset_selected", { preset: id });
    },
    [applyVisualOptions, setAspectRatio, setRenderMode, setRenderOptions, setShape, setStyle, setTextBoxes],
  );

  useEffect(() => {
    return () => {
      if (presetHintTimerRef.current) {
        window.clearTimeout(presetHintTimerRef.current);
        presetHintTimerRef.current = null;
      }
    };
  }, []);

  // Restore selectedOccasion from draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = localStorage.getItem("star-map-draft");
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as { selectedOccasion?: string | null };
        if (parsed.selectedOccasion) {
          setSelectedOccasion(parsed.selectedOccasion);
        } else if (parsed.selectedOccasion === null) {
          // User had custom date/location
          setCustomOccasion(true);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Sync selectedOccasion to draft when it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = localStorage.getItem("star-map-draft");
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as Record<string, unknown>;
        parsed.selectedOccasion = selectedOccasion;
        localStorage.setItem("star-map-draft", JSON.stringify(parsed));
      } catch {
        // Ignore parse errors
      }
    }
  }, [selectedOccasion]);

  // Handle intensity change
  const handleIntensityChange = useCallback(
    (value: number) => {
      if (!paid && value > 60) {
        setIntensityDisplay(60);
        track("paywall_intensity_blocked", { attemptedValue: value });
        return;
      }
      setIntensityDisplay(value);
      setIntensity(value);
      applyVisualOptions(renderMode, value);
    },
    [paid, renderMode, applyVisualOptions],
  );

  // Handle render mode change
  const handleRenderModeChange = useCallback(
    (mode: RenderModeId) => {
      if ((mode === "cinematic" || mode === "luxe") && !paid) {
        track("paywall_render_mode_blocked", { mode });
        return;
      }
      setRenderMode(mode);
      const targetLevel = mode === "cinematic" ? Math.max(intensityDisplay, 60) : intensityDisplay;
      setIntensity(targetLevel);
      setIntensityDisplay(targetLevel);
      applyVisualOptions(mode, targetLevel);
      track("render_mode_changed", { mode });
    },
    [paid, intensityDisplay, applyVisualOptions],
  );

  const handleStartPreset = useCallback(() => {
    presetRailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleStartScratch = useCallback(() => {
    setSelectedOccasion(null);
    setCustomOccasion(false);
    setRevealed(false);
    dateLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setRevealed]);

  const handleDateTimeChange = useCallback(
    (iso: string) => {
      setDateTime(iso);
      setCustomOccasion(true);
      if (selectedOccasion) {
        setSelectedOccasion(null);
      }
    },
    [selectedOccasion, setDateTime],
  );

  const handleLocationChange = useCallback(() => {
    setCustomOccasion(true);
    if (selectedOccasion) {
      setSelectedOccasion(null);
    }
  }, [selectedOccasion]);

  const applySampleMoment = useCallback(() => {
    const preset = occasionPresets.find((item) => item.id === "wedding") ?? occasionPresets[0];
    if (!preset) return;
    applyPreset(preset.id);
    setRevealed(true);
    track("sample_moment_applied", { preset: preset.id });
    dateLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [applyPreset, setRevealed]);

  const handleReveal = useCallback(() => {
    if (!canReveal) return;
    setRevealed(true);
    track("preview_revealed", { source: "mobile" });
    setTimeout(() => {
      document.getElementById("mobile-preview")?.scrollIntoView({
        behavior: "smooth",
      });
    }, 100);
  }, [canReveal, setRevealed]);

  useEffect(() => {
    if (!canReveal || revealed) {
      setShowStickyCTA(false);
      return;
    }
    const updateSticky = () => {
      const dateBottom = dateLocationRef.current?.getBoundingClientRect().bottom ?? 0;
      const previewRect = previewSectionRef.current?.getBoundingClientRect();
      const previewTop = previewRect?.top ?? Number.POSITIVE_INFINITY;
      const previewFullyVisible =
        previewRect !== undefined && previewRect.top >= 0 && previewRect.bottom <= window.innerHeight;
      const passedDateBlock = dateBottom < 0;
      const previewVisible = previewTop < window.innerHeight * 0.6;
      setShowStickyCTA(!previewFullyVisible && (passedDateBlock || previewVisible));
    };
    updateSticky();
    window.addEventListener("scroll", updateSticky, { passive: true });
    window.addEventListener("resize", updateSticky);
    return () => {
      window.removeEventListener("scroll", updateSticky);
      window.removeEventListener("resize", updateSticky);
    };
  }, [canReveal, revealed]);

  useEffect(() => {
    if (!isQuick) return;
    const lockedIntensity = 70;
    setRenderMode("cinematic");
    setIntensity(lockedIntensity);
    setIntensityDisplay(lockedIntensity);
    applyVisualOptions("cinematic", lockedIntensity);
  }, [applyVisualOptions, isQuick]);

  const handleCustomizeMore = useCallback(() => {
    if (isQuick) {
      onCustomizeMore?.();
      return;
    }
    setShowAdvancedState(true);
  }, [isQuick, onCustomizeMore]);

  return (
    <div className="space-y-4">
      {/* Section 1: Header */}
      {showGuidedForm && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d7b56c]">
            Create your star map
          </p>
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">
            Design your sky in seconds
          </h2>
          <p className="text-base text-neutral-200">
            Start from a preset, fine-tune the details, and see a finished map before you unlock.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleStartPreset}
              className="rounded-full border border-amber-200/40 bg-amber-100/10 px-4 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:border-amber-200/70 hover:bg-amber-100/20"
            >
              Start with a preset
            </button>
            <button
              type="button"
              onClick={handleStartScratch}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:border-white/30 hover:bg-white/10"
            >
              Start from scratch
            </button>
          </div>
          <button
            type="button"
            onClick={applySampleMoment}
            className="w-fit text-xs font-semibold text-amber-200/80 underline decoration-amber-200/40 underline-offset-4 transition hover:text-amber-100"
          >
            Try a sample moment
          </button>
          <p className="text-xs text-neutral-300">
            Preset optional · Add date + location · Add a line of text → Preview
          </p>
        </div>
      )}

      {/* Section 2: Occasion Presets (Always Visible) */}
      {(showGuidedForm || showEditor) && (
        <section
          ref={presetRailRef}
          className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm shadow-black/30"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white">Choose an Occasion</h3>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                Presets optional
              </span>
              {customOccasion && (
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                  Custom
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {occasionPresets.map((preset) => {
              const occasionStyles = {
                wedding: "border-pink-300/40 bg-gradient-to-br from-pink-100/15 to-rose-100/15 text-pink-100 hover:border-pink-300/60 hover:bg-pink-100/20",
                anniversary: "border-amber-300/40 bg-gradient-to-br from-amber-100/15 to-orange-100/15 text-amber-100 hover:border-amber-300/60 hover:bg-amber-100/20",
                birthday: "border-cyan-300/40 bg-gradient-to-br from-cyan-100/15 to-blue-100/15 text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-100/20",
                birth: "border-green-300/40 bg-gradient-to-br from-green-100/15 to-emerald-100/15 text-green-100 hover:border-green-300/60 hover:bg-green-100/20",
                memorial: "border-purple-300/40 bg-gradient-to-br from-purple-100/15 to-violet-100/15 text-purple-100 hover:border-purple-300/60 hover:bg-purple-100/20",
                graduation: "border-yellow-300/40 bg-gradient-to-br from-yellow-100/15 to-amber-100/15 text-yellow-100 hover:border-yellow-300/60 hover:bg-yellow-100/20",
              };

              const occasionEmojis = {
                wedding: "💍",
                anniversary: "❤️",
                birthday: "🎉",
                birth: "👶",
                memorial: "🕊️",
                graduation: "🎓",
              };

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:scale-95 ${
                    occasionStyles[preset.id as keyof typeof occasionStyles]
                  } ${selectedOccasion === preset.id ? "ring-2 ring-amber-300/70 btn-selection-pulse btn-selected-glow" : ""}`}
                >
                  {occasionEmojis[preset.id as keyof typeof occasionEmojis]} {preset.label}
                </button>
              );
            })}
          </div>
          {presetHint && <p className="mt-2 text-xs text-amber-100/80">{presetHint}</p>}
        </section>
      )}

      {/* Date & Location - FIRST (required input) */}
      {!revealed && showGuidedForm && (
        <section
          ref={dateLocationRef}
          className="rounded-xl border border-white/10 bg-white/5 p-3"
        >
          <h3 className="text-xs font-semibold text-white mb-2">Date & Location</h3>
          <div className="space-y-2">
            <LocationSearch onLocationChange={handleLocationChange} />
            <DateTimeControls dateTime={dateTime} onChange={handleDateTimeChange} />
          </div>
        </section>
      )}

      {/* Pro Presets - SECOND (optional styling) */}
      {(showGuidedForm || showEditor) && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm shadow-black/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-white">Pro Presets</h3>
              <p className="text-[10px] text-neutral-300">Curated looks with balanced typography.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-200">
              New
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {proPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyProPreset(preset.id)}
                className={`group overflow-hidden rounded-lg border bg-[#0b0f24]/80 text-left shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-lg active:scale-[0.98] ${
                  selectedOccasion === preset.id ? "border-amber-300/70 ring-1 ring-amber-300/30 btn-selection-pulse btn-selected-glow" : "border-white/10"
                }`}
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <img
                    src={preset.thumbnail}
                    alt={preset.label}
                    loading="lazy"
                    width={120}
                    height={150}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="border-t border-white/10 px-2 py-2">
                  <div className="text-xs font-semibold text-white">{preset.label}</div>
                  <div className="text-[10px] text-neutral-300">{preset.note}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Section 3: Render Mode + Intensity (Always Visible) */}
      {showEditor && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm shadow-black/30">
          <h3 className="text-xs font-semibold text-white mb-2">Render Style</h3>
          <div className="flex gap-2 mb-3">
            {[
              { id: "classic", label: "Classic", premium: false },
              { id: "cinematic", label: "Enhanced", premium: true },
              { id: "blueprint", label: "Blueprint", premium: false },
              { id: "luxe", label: "Luxe", premium: true },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleRenderModeChange(mode.id as RenderModeId)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow active:scale-95 ${
                  renderMode === mode.id
                    ? "border-amber-400 bg-amber-200 text-midnight btn-selection-pulse btn-selected-glow"
                    : "border-white/20 bg-white/10 text-white"
                }`}
              >
                {mode.premium && !paid && "🔒"} {mode.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white">Intensity</label>
              <span className="text-xs text-neutral-300">{intensityDisplay}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={intensityDisplay}
              onChange={(e) => handleIntensityChange(Number(e.target.value))}
              aria-label="Star intensity"
              aria-valuetext={`Intensity: ${intensityDisplay}%`}
              className="w-full accent-amber-400"
            />
          </div>
        </section>
      )}

      {/* Your Message + Generate Button */}
      {!revealed && showGuidedForm && (
        <div className="space-y-3">
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-amber-300">✎</span>
              <h3 className="text-xs font-semibold text-white">Your Message</h3>
            </div>
            <div className="space-y-3">
              {visibleTextBoxes.map((box) => (
                <div key={box.id} className="space-y-2">
                  <label className="text-sm font-medium text-white">{box.label}</label>
                  <input
                    type="text"
                    value={box.text}
                    onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                    className="h-10 w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                    placeholder={`Enter ${box.label.toLowerCase()}...`}
                  />
                </div>
              ))}
            </div>
          </section>
          <button
            type="button"
            onClick={handleReveal}
            disabled={!canReveal}
            aria-label="Generate preview"
            className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30] ${
              canReveal
                ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                : "cursor-not-allowed bg-neutral-400/60 text-neutral-700 shadow-none"
            }`}
          >
            Generate preview
          </button>
          <div className="text-xs text-neutral-400">
            <p>Add date + location to unlock your preview. Presets optional.</p>
            <p className="text-[11px] text-neutral-500">Free preview, HD optional.</p>
          </div>
        </div>
      )}

      {/* Section 4: Drawer with Secondary Controls */}
      {showEditor && (
        <EditorDrawer defaultOpen={true}>
          <div className="space-y-3">
            {/* Date & Location */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Date & Location</h3>
              <div className="space-y-2">
                <LocationSearch onLocationChange={handleLocationChange} />
                <DateTimeControls dateTime={dateTime} onChange={handleDateTimeChange} />
              </div>
            </section>

            {/* Your Message */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-amber-300">✎</span>
                <h3 className="text-xs font-semibold text-white">Your Message</h3>
              </div>
              <div className="space-y-3">
                {textBoxes.map((box) => (
                  <div key={box.id} className="space-y-2">
                    <label className="text-sm font-medium text-white">{box.label}</label>
                    <input
                      type="text"
                      value={box.text}
                      onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                      className="h-10 w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                      placeholder={`Enter ${box.label.toLowerCase()}...`}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Text Styling */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Text Styling</h3>
              <div className="space-y-3">
                {textBoxes.map((box) => (
                  <div key={box.id} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">{box.label}</span>
                      <button
                        type="button"
                        onClick={() => removeTextBox(box.id)}
                        className="text-[10px] text-rose-300 hover:text-rose-200"
                        aria-label={`Remove ${box.label} text box`}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label htmlFor={`font-select-${box.id}`} className="text-[10px] text-neutral-300">Font</label>
                        <select
                          id={`font-select-${box.id}`}
                          value={box.fontFamily}
                          onChange={(e) => {
                            const next = e.target.value as TextBox["fontFamily"];
                            const fontMeta = fontOptions.find((opt) => opt.id === next);
                            if (fontMeta?.premium && !paid) {
                              track("paywall_font_blocked", { font: next });
                              return;
                            }
                            updateTextBox(box.id, { fontFamily: next });
                          }}
                          className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                        >
                          {fontOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.premium ? `🔒 ${opt.label}` : opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`size-input-${box.id}`} className="text-[10px] text-neutral-300">Size</label>
                        <input
                          id={`size-input-${box.id}`}
                          type="number"
                          min={10}
                          max={64}
                          value={box.size}
                          onChange={(e) => updateTextBox(box.id, { size: Number(e.target.value) })}
                          className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label htmlFor={`color-input-${box.id}`} className="text-[10px] text-neutral-300">Color</label>
                        <input
                          id={`color-input-${box.id}`}
                          type="color"
                          value={box.color}
                          onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                          className="w-full h-8 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`align-select-${box.id}`} className="text-[10px] text-neutral-300">Align</label>
                        <select
                          id={`align-select-${box.id}`}
                          value={box.align}
                          onChange={(e) => updateTextBox(box.id, { align: e.target.value as TextBox["align"] })}
                          className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateTextBox(box.id, { textShadow: !box.textShadow })}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-[10px] font-semibold transition ${
                          box.textShadow
                            ? "border-amber-300 bg-amber-100 text-midnight"
                            : "border-white/15 bg-white/10 text-white"
                        }`}
                        aria-label={`Toggle shadow for ${box.label}`}
                        aria-pressed={box.textShadow}
                      >
                        Shadow
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTextBox(box.id, { textGlow: !box.textGlow })}
                        className={`flex-1 rounded-md border px-3 py-1.5 text-[10px] font-semibold transition ${
                          box.textGlow
                            ? "border-amber-300 bg-amber-100 text-midnight"
                            : "border-white/15 bg-white/10 text-white"
                        }`}
                        aria-label={`Toggle glow for ${box.label}`}
                        aria-pressed={box.textGlow}
                      >
                        Glow
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addTextBox}
                  className="w-full rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
                >
                  + Add Text Line
                </button>
              </div>
            </section>

            {/* Style */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Style</h3>
              <div className="grid grid-cols-2 gap-2">
                {styles.map((style) => {
                  const styleClasses = {
                    navyGold:
                      selectedStyle === style.id
                        ? "border-amber-400 bg-gradient-to-br from-[#0d1b2a] to-[#1b2838] text-amber-300"
                        : "border-amber-500/30 bg-gradient-to-br from-[#0d1b2a]/80 to-[#1b2838]/80 text-amber-200/80",
                    vintageEngraving:
                      selectedStyle === style.id
                        ? "border-amber-300 bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] text-amber-100"
                        : "border-neutral-400/30 bg-gradient-to-br from-[#2d2d2d]/80 to-[#1a1a1a]/80 text-neutral-200/80",
                    parchmentScroll:
                      selectedStyle === style.id
                        ? "border-amber-400 bg-gradient-to-br from-[#f5f0e6] to-[#e8dcc8] text-amber-900"
                        : "border-amber-500/30 bg-gradient-to-br from-[#f5f0e6]/90 to-[#e8dcc8]/90 text-amber-800/80",
                    midnightMinimal:
                      selectedStyle === style.id
                        ? "border-blue-400 bg-gradient-to-br from-[#0a0a0a] to-[#1a1a2e] text-blue-300"
                        : "border-blue-500/30 bg-gradient-to-br from-[#0a0a0a]/80 to-[#1a1a2e]/80 text-blue-200/80",
                  };

                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setStyle(style.id)}
                      className={`flex flex-col justify-center rounded-lg border px-3 py-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:scale-[0.98] ${
                        styleClasses[style.id as keyof typeof styleClasses]
                      } ${selectedStyle === style.id ? "btn-selection-pulse" : ""}`}
                    >
                      <div className="text-sm font-semibold">{style.name}</div>
                      <div className="text-xs opacity-80 mt-1">{style.note}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Shape */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Shape</h3>
              <div className="grid grid-cols-4 gap-2">
                {shapes.map((shapeOption) => (
                  <button
                    key={shapeOption.id}
                    type="button"
                    onClick={() => setShape(shapeOption.id)}
                    className={`flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-xs font-semibold transition active:scale-95 ${
                      shape === shapeOption.id
                        ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300"
                        : "border-white/15 bg-white/5 text-white"
                    }`}
                  >
                    {shapeOption.label}
                  </button>
                ))}
              </div>
              {shape !== "rectangle" && (
                <div className="mt-2 space-y-1">
                  <label className="text-[10px] text-neutral-300">Background Color</label>
                  <input
                    type="color"
                    value={renderOptions.backgroundColor || "#0b1a30"}
                    onChange={(e) => setRenderOptions({ backgroundColor: e.target.value })}
                    className="w-full h-8 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                  />
                </div>
              )}
            </section>

            {/* Frame */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Frame</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "square" as const, label: "Square" },
                  { id: "4:5" as const, label: "Poster" },
                  { id: "2:3" as const, label: "Wide" },
                ].map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`flex items-center justify-center rounded-lg border px-2 py-2 text-xs font-semibold transition active:scale-95 ${
                      aspectRatio === ratio.id
                        ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300"
                        : "border-white/15 bg-white/5 text-white"
                    }`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRenderOptions({ frameEnabled: !renderOptions.frameEnabled })}
                className={`mt-2 w-full rounded-md border px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                  renderOptions.frameEnabled
                    ? "border-amber-300 bg-amber-100 text-midnight"
                    : "border-white/15 bg-white/10 text-white"
                }`}
              >
                {renderOptions.frameEnabled ? "Frame Border On" : "Frame Border Off"}
              </button>
            </section>

            {/* Advanced */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Advanced</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-300">Constellation Lines</label>
                  <div className="grid grid-cols-3 gap-2">
                    {constellationPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setRenderOptions({ constellationLines: preset.id })}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                          renderOptions.constellationLines === preset.id
                            ? "border-amber-300 bg-amber-100 text-midnight"
                            : "border-white/15 bg-white/10 text-white"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                {renderOptions.constellationLines !== "off" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-300">Line Color</label>
                      <input
                        type="color"
                        value={renderOptions.constellationColor || "#ffffff"}
                        onChange={(e) => setRenderOptions({ constellationColor: e.target.value })}
                        className="w-full h-8 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-300">
                        Line Scale: {renderOptions.constellationLineScale || 1}
                      </label>
                      <input
                        type="range"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={renderOptions.constellationLineScale || 1}
                        onChange={(e) =>
                          setRenderOptions({ constellationLineScale: Number(e.target.value) })
                        }
                        aria-label="Constellation line scale"
                        aria-valuetext={`Line scale: ${renderOptions.constellationLineScale || 1}`}
                        className="w-full accent-amber-400"
                      />
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setRenderOptions({ constellationLabels: !renderOptions.constellationLabels })
                  }
                  className={`w-full rounded-md border px-3 py-2 text-xs font-semibold transition ${
                    renderOptions.constellationLabels
                      ? "border-amber-300 bg-amber-100 text-midnight"
                      : "border-white/15 bg-white/10 text-white"
                  }`}
                >
                  {renderOptions.constellationLabels ? "Labels On" : "Labels Off"}
                </button>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-300">Visual Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {visualModes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setRenderOptions({ visualMode: mode.id })}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                          renderOptions.visualMode === mode.id
                            ? "border-amber-300 bg-amber-100 text-midnight"
                            : "border-white/15 bg-white/10 text-white"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-300">Preview Fidelity</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "standard", label: "Standard" },
                      { id: "high", label: "High" },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setPreviewFidelity(preset.id as "standard" | "high")}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                          previewFidelity === preset.id
                            ? "border-amber-300 bg-amber-100 text-midnight"
                            : "border-white/15 bg-white/10 text-white"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-300">Premium Stars</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "off", label: "Off" },
                      { id: "subtle", label: "Subtle" },
                      { id: "realistic", label: "Realistic" },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setRenderOptions({ premiumStars: preset.id as RenderOptions["premiumStars"] });
                          if (!paid && preset.id !== "off") {
                            track("premium_preview_enabled", { feature: "stars", level: preset.id });
                          }
                        }}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                          renderOptions.premiumStars === preset.id
                            ? "border-amber-300 bg-amber-100 text-midnight"
                            : "border-white/15 bg-white/10 text-white"
                        }`}
                      >
                        {!paid && preset.id !== "off" ? "🔒 " : ""}{preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-300">Premium Planets</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "off", label: "Off" },
                      { id: "realistic", label: "Realistic" },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setRenderOptions({ premiumPlanets: preset.id as RenderOptions["premiumPlanets"] });
                          if (!paid && preset.id !== "off") {
                            track("premium_preview_enabled", { feature: "planets", level: preset.id });
                          }
                        }}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                          renderOptions.premiumPlanets === preset.id
                            ? "border-amber-300 bg-amber-100 text-midnight"
                            : "border-white/15 bg-white/10 text-white"
                        }`}
                      >
                        {!paid && preset.id !== "off" ? "🔒 " : ""}{preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </EditorDrawer>
      )}

      {/* Section 5: Preview */}
      <section ref={previewSectionRef} id="mobile-preview" className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-[#0b0f24]/90 p-3 shadow-xl shadow-black/30">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-white">Preview</h3>
            {revealed && (
              <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
              </div>
            )}
          </div>
          <div className="relative mx-auto overflow-hidden" style={{ width: "100%", maxWidth: "600px", aspectRatio: `${aspectRatioToNumber(aspectRatio)} / 1` }}>
            {!revealed && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="space-y-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-semibold text-neutral-200 shadow-sm backdrop-blur text-center">
                  <p>Add date + location to reveal your sky. Presets optional.</p>
                  <button
                    type="button"
                    onClick={handleReveal}
                    disabled={!canReveal}
                    aria-label="Generate preview"
                    className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-midnight shadow-lg transition ${
                      canReveal
                        ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                        : "cursor-not-allowed bg-neutral-400/60 text-neutral-700 shadow-none"
                    }`}
                  >
                    Generate preview
                  </button>
                  <p className="text-[10px] text-neutral-300">Free preview, HD optional.</p>
                </div>
              </div>
            )}
            {revealed && <PreviewCanvas onRendered={onCanvasReady} />}
          </div>
        </div>

      {revealed && (
        <>
          <div className="flex gap-2">
            <button
              type="button"
                onClick={() => onExport("preview")}
                aria-label="Free export"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
              >
                Free ⬇️
              </button>
              <button
                type="button"
                onClick={() => onExport("hd")}
                aria-label="HD export"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-3 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg active:scale-95"
              >
                {!paid && "🔒 "}HD ⬇️
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onShareImage}
                  aria-label="Share star map"
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
                >
                  🔗 Share
                </button>
                {showEditor && (
                  <button
                    type="button"
                    onClick={onShare}
                    aria-label="Save and remix star map"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
                  >
                    💾 Save & Remix
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleCustomizeMore}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:bg-amber-300 hover:shadow-lg active:scale-95"
              >
                Customize more
              </button>
            </div>
          </>
        )}
      </section>
      {canReveal && !revealed && showStickyCTA && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[90%] max-w-md -translate-x-1/2 rounded-2xl border border-amber-200/40 bg-[#0b0f24]/95 px-4 py-3 shadow-xl shadow-black/30 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Ready to reveal your sky?</p>
              <p className="text-[10px] text-neutral-300">Free preview, HD optional.</p>
            </div>
            <button
              type="button"
              onClick={handleReveal}
              data-testid="mobile-sticky-generate"
              className="rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-3 py-2 text-xs font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
            >
              Generate preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
