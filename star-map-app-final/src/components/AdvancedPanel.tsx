"use client";

import { constellationPresets, visualModes } from "@/lib/config";
import { getRenderPresetOptions, renderPresets, resolveRenderPreset } from "@/lib/renderPresets";
import type { RenderOptions, StyleId } from "@/lib/store";

type AdvancedPanelProps = {
  selectedStyle: StyleId;
  renderOptions: RenderOptions;
  setRenderOptions: (next: Partial<RenderOptions>) => void;
  previewFidelity: "standard" | "high";
  setPreviewFidelity: (next: "standard" | "high") => void;
  paid: boolean;
  onPremiumPreview: (feature: "stars" | "planets", level: string) => void;
};

export function AdvancedPanel({
  selectedStyle,
  renderOptions,
  setRenderOptions,
  previewFidelity,
  setPreviewFidelity,
  paid,
  onPremiumPreview,
}: AdvancedPanelProps) {
  const activePreset = resolveRenderPreset(renderOptions, selectedStyle);

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-white/10 bg-[#0a1024]/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-100 uppercase">
            Advanced controls
          </p>
          <p className="text-[11px] text-neutral-200">
            Precision tune the look without leaving preview mode.
          </p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80">
          Live
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-neutral-100">Quick Look</label>
          <div className="grid grid-cols-2 gap-2">
            {renderPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setRenderOptions(getRenderPresetOptions(preset.id, selectedStyle))}
                className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                  activePreset === preset.id
                    ? "!text-midnight border-amber-300 bg-amber-100"
                    : "border-white/15 bg-white/10 text-white"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-neutral-100">Visual Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {visualModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setRenderOptions({ visualMode: mode.id })}
                className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                  renderOptions.visualMode === mode.id
                    ? "!text-midnight border-amber-300 bg-amber-100"
                    : "border-white/15 bg-white/10 text-white"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-neutral-100">Preview Fidelity</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "standard", label: "Standard" },
            { id: "high", label: "High" },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setPreviewFidelity(preset.id as "standard" | "high")}
              className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                previewFidelity === preset.id
                  ? "!text-midnight border-amber-300 bg-amber-100"
                  : "border-white/15 bg-white/10 text-white"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-white/10 bg-white/5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-semibold text-neutral-100">Constellations</label>
          <button
            type="button"
            onClick={() => setRenderOptions({ constellationLabels: !renderOptions.constellationLabels })}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
              renderOptions.constellationLabels
                ? "!text-midnight border-amber-300 bg-amber-100"
                : "border-white/15 bg-white/10 text-white"
            }`}
          >
            {renderOptions.constellationLabels ? "Labels On" : "Labels Off"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {constellationPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setRenderOptions({ constellationLines: preset.id })}
              className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                renderOptions.constellationLines === preset.id
                  ? "!text-midnight border-amber-300 bg-amber-100"
                  : "border-white/15 bg-white/10 text-white"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {renderOptions.constellationLines !== "off" && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-200">Line Color</label>
              <input
                type="color"
                value={renderOptions.constellationColor || "#ffffff"}
                onChange={(e) => setRenderOptions({ constellationColor: e.target.value })}
                className="h-8 w-full cursor-pointer rounded-md border border-white/15 bg-white/10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-200">
                Line Scale: {renderOptions.constellationLineScale || 1}
              </label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={renderOptions.constellationLineScale || 1}
                onChange={(e) => setRenderOptions({ constellationLineScale: Number(e.target.value) })}
                aria-label="Constellation line scale"
                aria-valuetext={`Line scale: ${renderOptions.constellationLineScale || 1}`}
                className="w-full accent-amber-400"
              />
            </div>
          </div>
        )}
      </div>

      <details className="rounded-md border border-white/10 bg-white/5 p-2.5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold text-neutral-100">
          Premium effects
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
            Optional
          </span>
        </summary>
        <div className="mt-2 space-y-2">
          <div className="space-y-1">
            <label className="text-[11px] text-neutral-200">Premium Stars</label>
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
                      onPremiumPreview("stars", preset.id);
                    }
                  }}
                  className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                    renderOptions.premiumStars === preset.id
                      ? "!text-midnight border-amber-300 bg-amber-100"
                      : "border-white/15 bg-white/10 text-white"
                  }`}
                >
                  {!paid && preset.id !== "off" ? "🔒 " : ""}
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-neutral-200">Premium Planets</label>
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
                      onPremiumPreview("planets", preset.id);
                    }
                  }}
                  className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                    renderOptions.premiumPlanets === preset.id
                      ? "!text-midnight border-amber-300 bg-amber-100"
                      : "border-white/15 bg-white/10 text-white"
                  }`}
                >
                  {!paid && preset.id !== "off" ? "🔒 " : ""}
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
