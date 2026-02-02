"use client";

import { constellationPresets, visualModes } from "@/lib/config";
import type { RenderOptions } from "@/lib/store";

type AdvancedPanelProps = {
  renderOptions: RenderOptions;
  setRenderOptions: (next: Partial<RenderOptions>) => void;
  previewFidelity: "standard" | "high";
  setPreviewFidelity: (next: "standard" | "high") => void;
  paid: boolean;
  onPremiumPreview: (feature: "stars" | "planets", level: string) => void;
};

export function AdvancedPanel({
  renderOptions,
  setRenderOptions,
  previewFidelity,
  setPreviewFidelity,
  paid,
  onPremiumPreview,
}: AdvancedPanelProps) {
  return (
    <div className="mt-2 space-y-3">
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
                  ? "border-amber-300 bg-amber-100 !text-midnight"
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
              onChange={(e) => setRenderOptions({ constellationLineScale: Number(e.target.value) })}
              aria-label="Constellation line scale"
              aria-valuetext={`Line scale: ${renderOptions.constellationLineScale || 1}`}
              className="w-full accent-amber-400"
            />
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setRenderOptions({ constellationLabels: !renderOptions.constellationLabels })}
        className={`w-full rounded-md border px-3 py-2 text-xs font-semibold transition ${
          renderOptions.constellationLabels
            ? "border-amber-300 bg-amber-100 !text-midnight"
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
                  ? "border-amber-300 bg-amber-100 !text-midnight"
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
                  ? "border-amber-300 bg-amber-100 !text-midnight"
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
                  onPremiumPreview("stars", preset.id);
                }
              }}
              className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                renderOptions.premiumStars === preset.id
                  ? "border-amber-300 bg-amber-100 !text-midnight"
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
                  onPremiumPreview("planets", preset.id);
                }
              }}
              className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                renderOptions.premiumPlanets === preset.id
                  ? "border-amber-300 bg-amber-100 !text-midnight"
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
  );
}
