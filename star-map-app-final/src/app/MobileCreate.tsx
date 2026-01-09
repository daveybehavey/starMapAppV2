"use client";

import { useCallback, useState } from "react";
import { useStore } from "@/lib/store";
import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import { EditorDrawer } from "@/components/EditorDrawer";
import { occasionPresets } from "@/lib/occasionPresets";
import { type RenderModeId } from "@/lib/renderModes";
import type { StyleId, RenderOptions } from "@/lib/store";
import type { Shape } from "@/lib/types";
import { track } from "@/lib/analytics";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

const styles: { id: StyleId; name: string; note: string }[] = [
  { id: "navyGold", name: "Navy & Gold", note: "Luxe midnight with gilded accents" },
  { id: "vintageEngraving", name: "Vintage Engraving", note: "Linework etched on deep charcoal" },
  { id: "parchmentScroll", name: "Parchment Scroll", note: "Warm cream with antique border" },
  { id: "midnightMinimal", name: "Midnight Minimal", note: "Clean noir with subtle glow" },
];

interface MobileCreateProps {
  onExport: (mode: "preview" | "hd") => void;
  onShareImage: () => void;
  onShare: () => void;
  paywallOpen: boolean;
  canvasReady: boolean;
}

export function MobileCreate({
  onExport,
  onShareImage,
  onShare,
  paywallOpen,
  canvasReady,
}: MobileCreateProps) {
  const {
    dateTime,
    setDateTime,
    location,
    textBoxes,
    updateTextBox,
    selectedStyle,
    setStyle,
    renderOptions,
    setRenderOptions,
    revealed,
    setRevealed,
    paid,
  } = useStore(
    useShallow((state) => ({
      dateTime: state.dateTime,
      setDateTime: state.setDateTime,
      location: state.location,
      textBoxes: state.textBoxes,
      updateTextBox: state.updateTextBox,
      selectedStyle: state.selectedStyle,
      setStyle: state.setStyle,
      renderOptions: state.renderOptions,
      setRenderOptions: state.setRenderOptions,
      revealed: state.revealed,
      setRevealed: state.setRevealed,
      paid: state.paid,
    })),
  );

  const [renderMode, setRenderMode] = useState<RenderModeId>("classic");
  const [intensity, setIntensity] = useState(50);
  const [intensityDisplay, setIntensityDisplay] = useState(50);

  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  const canReveal = Boolean(locationName) && hasDate;

  // Apply visual options based on render mode and intensity
  // MATCHES DESKTOP SEMANTICS - mirrors existing desktop mappings from page.tsx
  const applyVisualOptions = useCallback(
    (mode: RenderModeId, level: number) => {
      const baseOptions: Partial<RenderOptions> = {
        visualMode: "enhanced", // matches desktop default
        constellationLines: "thin",
        constellationLabels: "off",
        constellationColor: "#ffffff",
        constellationLineWeight: 0.3,
      };

      if (mode === "cinematic") {
        // Cinematic mode uses existing "illustrated" visual mode from desktop
        setRenderOptions({
          ...baseOptions,
          visualMode: "illustrated",
          constellationLines: level > 60 ? "thick" : "thin",
          constellationLabels: level > 70 ? "western" : "off",
        });
      } else {
        // Classic mode uses existing "astronomical" visual mode from desktop
        setRenderOptions({
          ...baseOptions,
          visualMode: "astronomical",
          constellationLines: level > 50 ? "thin" : "off",
        });
      }
    },
    [setRenderOptions],
  );

  // Handle preset application
  const applyPreset = useCallback(
    (id: string) => {
      const preset = occasionPresets.find((p) => p.id === id);
      if (!preset) return;

      // Batch all Zustand store updates
      useStore.setState({
        dateTime: preset.dateTimeISO,
        location: {
          name: preset.location?.name ?? "",
          latitude: preset.location?.latitude ?? 0,
          longitude: preset.location?.longitude ?? 0,
          timezone: preset.location?.timezone ?? "UTC",
        },
        textBoxes: preset.textBoxes,
        selectedStyle: preset.style as StyleId,
        shape: preset.shape as Shape,
        revealed: false, // Don't auto-reveal on mobile - preserve anticipation
        paid: false,
      });

      // Local state updates
      setRenderMode(preset.renderMode);
      const level = Math.round(preset.intensity * 100);
      setIntensity(level);
      setIntensityDisplay(level);
      applyVisualOptions(preset.renderMode, level);

      track("occasion_preset_selected", { preset: id });
    },
    [applyVisualOptions],
  );

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
      if (mode === "cinematic" && !paid) {
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

  // Handle reveal
  const handleReveal = useCallback(() => {
    if (!canReveal) return;
    setRevealed(true);
    track("preview_revealed", { source: "mobile" });

    // Auto-scroll to preview
    setTimeout(() => {
      document.getElementById("mobile-preview")?.scrollIntoView({
        behavior: "smooth",
      });
    }, 100);
  }, [canReveal, setRevealed]);

  return (
    <div className="space-y-4">
      {/* Section 1: Header */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">
          Create your star map
        </p>
        <h2 className="text-3xl font-semibold text-white sm:text-4xl">
          Design your sky in seconds
        </h2>
        <p className="text-base text-neutral-200">
          Start from a preset, fine-tune the details, and see a finished map before you unlock.
        </p>
      </div>

      {/* Section 2: Occasion Presets (Always Visible) */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm shadow-black/30">
        <h3 className="text-xs font-semibold text-white mb-2">Choose an Occasion</h3>
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
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all active:scale-95 ${
                  occasionStyles[preset.id as keyof typeof occasionStyles]
                }`}
              >
                {occasionEmojis[preset.id as keyof typeof occasionEmojis]} {preset.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 3: Render Mode + Intensity (Always Visible) */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm shadow-black/30">
        <h3 className="text-xs font-semibold text-white mb-2">Render Style</h3>
        <div className="flex gap-2 mb-3">
          {[
            { id: "classic", label: "Classic", premium: false },
            { id: "cinematic", label: "Enhanced", premium: true },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleRenderModeChange(mode.id as RenderModeId)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition active:scale-95 ${
                renderMode === mode.id
                  ? "border-amber-400 bg-amber-200 text-midnight"
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
            className="w-full accent-amber-400"
          />
        </div>
      </section>

      {/* Section 4: Drawer with Secondary Controls */}
      <EditorDrawer defaultOpen={true}>
        <div className="space-y-3">
          {/* Date & Location */}
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h3 className="text-xs font-semibold text-white mb-2">Date & Location</h3>
            <div className="space-y-2">
              <DateTimeControls dateTime={dateTime} onChange={setDateTime} />
              <LocationSearch />
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
                    className={`flex flex-col justify-center rounded-lg border px-3 py-2 text-left shadow-sm transition active:scale-95 ${
                      styleClasses[style.id as keyof typeof styleClasses]
                    }`}
                  >
                    <div className="text-sm font-semibold">{style.name}</div>
                    <div className="text-xs opacity-80 mt-1">{style.note}</div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </EditorDrawer>

      {/* Section 5: Reveal Button (Conditional - Only show when ready AND not revealed) */}
      {!revealed && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleReveal}
            disabled={!canReveal}
            className={`w-full rounded-xl py-4 text-lg font-semibold transition shadow-lg ${
              canReveal
                ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 text-midnight hover:-translate-y-[1px] hover:shadow-xl active:scale-[0.98]"
                : "bg-neutral-400/60 text-neutral-700 cursor-not-allowed shadow-none"
            }`}
          >
            ✨ Find your special moment
          </button>
          {!canReveal && (
            <p className="text-xs text-center text-amber-200/80">
              {!hasDate ? "Enter a date" : !locationName ? "Enter a location" : "Add details to unlock reveal"}
            </p>
          )}
        </div>
      )}

      {/* Section 6: Preview (After Reveal ONLY) */}
      {revealed && (
        <section id="mobile-preview" className="space-y-3">
          {/* Accuracy note */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
            <p className="font-semibold text-white">
              Matches professional planetarium accuracy (Yale catalogs + skyfield).
            </p>
            <Link href="#accuracy" className="mt-2 inline-flex text-sm font-semibold text-amber-300 hover:underline">
              Learn how accuracy works →
            </Link>
          </div>

          {/* Preview Canvas */}
          <div className="rounded-xl border border-white/10 bg-[#0b0f24]/90 p-3 shadow-xl shadow-black/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white">Preview</h3>
              <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
              </div>
            </div>
            <div className="relative mx-auto overflow-hidden" style={{ width: "100%", maxWidth: "600px", aspectRatio: "1/1" }}>
              <PreviewCanvas />
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onExport("preview")}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
            >
              Free ⬇️
            </button>
            <button
              type="button"
              onClick={() => onExport("hd")}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-3 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg active:scale-95"
            >
              {!paid && "🔒 "}HD ⬇️
            </button>
          </div>

          {/* Share Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onShareImage}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
            >
              🔗 Share
            </button>
            <button
              type="button"
              onClick={onShare}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
            >
              💾 Save & Remix
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
