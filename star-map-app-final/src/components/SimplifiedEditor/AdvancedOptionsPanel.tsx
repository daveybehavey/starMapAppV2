"use client";

import { useCallback, useId, useState } from "react";
import type { RenderOptions, StyleId, TextBox } from "@/lib/store";
import { visualModes, constellationPresets, fontOptions } from "@/lib/config";
import { getRenderPresetOptions, renderPresets, resolveRenderPreset } from "@/lib/renderPresets";
import FontSelector from "@/components/FontSelector";

interface AdvancedOptionsPanelProps {
  selectedStyle: StyleId;
  renderOptions: RenderOptions;
  setRenderOptions: (next: Partial<RenderOptions>) => void;
  textBoxes: TextBox[];
  setTextBoxes: (boxes: TextBox[]) => void;
  paid: boolean;
  onPremiumClick?: () => void;
}

// Reusable collapsible section
function CollapsibleSection({
  id,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-controls={id}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-amber-100/85">
          {title}
          {badge && (
            <span className="rounded-full border border-amber-300/35 bg-amber-400/15 px-2 py-0.5 text-[9px] tracking-wide text-amber-200">
              {badge}
            </span>
          )}
        </span>
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[11px] text-white/60 transition ${isOpen ? "bg-white/10" : ""}`}>
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen && (
        <div id={id} className="border-t border-white/10 px-3 pb-3 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}

// Button group for selecting options
function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
  paid,
  premiumIds,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  columns?: number;
  paid?: boolean;
  premiumIds?: T[];
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {options.map((opt) => {
        const isLocked = premiumIds?.includes(opt.id) && !paid;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium leading-none transition ${
              value === opt.id
                ? "border-amber-300 bg-amber-100 text-[#0b1433] shadow-[0_0_0_1px_rgba(251,191,36,0.15)]"
                : "border-white/15 bg-white/[0.08] text-white/85 hover:border-white/30 hover:bg-white/[0.12]"
            }`}
          >
            {isLocked ? "🔒 " : ""}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Toggle button
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
        value
          ? "border-amber-300 bg-amber-100 text-[#0b1433]"
          : "border-white/15 bg-white/[0.08] text-white/85 hover:border-white/30 hover:bg-white/[0.12]"
      }`}
    >
      <span>{label}</span>
      <span className={`inline-flex h-5 w-9 items-center rounded-full border transition ${value ? "border-[#0b1433]/20 bg-[#0b1433]/15" : "border-white/20 bg-white/10"}`}>
        <span className={`h-3.5 w-3.5 rounded-full transition-transform ${value ? "translate-x-4 bg-[#0b1433]" : "translate-x-1 bg-white/70"}`} />
      </span>
    </button>
  );
}

export function AdvancedOptionsPanel({
  selectedStyle,
  renderOptions,
  setRenderOptions,
  textBoxes,
  setTextBoxes,
  paid,
  onPremiumClick,
}: AdvancedOptionsPanelProps) {
  const activePreset = resolveRenderPreset(renderOptions, selectedStyle);
  const handleFontChange = useCallback((boxId: string, fontFamily: TextBox["fontFamily"]) => {
    setTextBoxes(
      textBoxes.map((tb) => (tb.id === boxId ? { ...tb, fontFamily } : tb))
    );
  }, [setTextBoxes, textBoxes]);

  const handleColorChange = useCallback((boxId: string, color: string) => {
    setTextBoxes(
      textBoxes.map((tb) => (tb.id === boxId ? { ...tb, color } : tb))
    );
  }, [setTextBoxes, textBoxes]);

  const baseId = useId();

  return (
    <div className="mt-4 space-y-2">
      {/* Sky Details - Default Open */}
      <CollapsibleSection id={`${baseId}-sky`} title="Sky Details" defaultOpen>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[11px] font-medium text-white/60">Quick Look</label>
            <div className="grid grid-cols-2 gap-2">
              {renderPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setRenderOptions(getRenderPresetOptions(preset.id, selectedStyle))}
                  className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium leading-none transition ${
                    activePreset === preset.id
                      ? "border-amber-300 bg-amber-100 text-[#0b1433] shadow-[0_0_0_1px_rgba(251,191,36,0.15)]"
                      : "border-white/15 bg-white/[0.08] text-white/85 hover:border-white/30 hover:bg-white/[0.12]"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visual Mode */}
          <div>
            <label className="mb-2 block text-[11px] font-medium text-white/60">Visual Mode</label>
            <ButtonGroup
              options={visualModes.map((m) => ({ id: m.id, label: m.label }))}
              value={renderOptions.visualMode}
              onChange={(id) => setRenderOptions({ visualMode: id })}
            />
          </div>

          {/* Moon Controls */}
          <div className="space-y-2">
            <Toggle
              label="Moon"
              value={renderOptions.showMoon}
              onChange={(val) => setRenderOptions({ showMoon: val })}
            />
            {renderOptions.showMoon && (
              <div className="pl-1">
                <label className="mb-2 block text-[11px] font-medium text-white/60">Moon Size</label>
                <ButtonGroup
                  options={[
                    { id: "normal" as const, label: "Normal" },
                    { id: "large" as const, label: "Large" },
                  ]}
                  value={renderOptions.moonSize}
                  onChange={(id) => setRenderOptions({ moonSize: id })}
                  columns={2}
                />
              </div>
            )}
          </div>

          {/* Planets */}
          <Toggle
            label="Planets"
            value={renderOptions.showPlanets}
            onChange={(val) => setRenderOptions({ showPlanets: val })}
          />
        </div>
      </CollapsibleSection>

      {/* Constellations */}
      <CollapsibleSection id={`${baseId}-constellations`} title="Constellations">
        <div className="space-y-4">
          {/* Lines */}
          <div>
            <label className="mb-2 block text-[11px] font-medium text-white/60">Lines</label>
            <ButtonGroup
              options={constellationPresets.map((p) => ({ id: p.id, label: p.label }))}
              value={renderOptions.constellationLines}
              onChange={(id) => setRenderOptions({ constellationLines: id })}
            />
          </div>

          {/* Labels - only show if lines are on */}
          {renderOptions.constellationLines !== "off" && (
            <>
              <Toggle
                label="Labels"
                value={renderOptions.constellationLabels}
                onChange={(val) => setRenderOptions({ constellationLabels: val })}
              />

              {/* Line Color */}
              <div>
                <label className="mb-2 block text-[11px] font-medium text-white/60">Line Color</label>
                <input
                  type="color"
                  value={renderOptions.constellationColor || "#ffffff"}
                  onChange={(e) => setRenderOptions({ constellationColor: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-white/15 bg-white/[0.08] p-1"
                />
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Premium Effects */}
      <CollapsibleSection id={`${baseId}-premium`} title="Premium Effects" badge="PRO">
        <div className="space-y-4">
          {/* Premium Stars */}
          <div>
            <label className="mb-2 block text-[11px] font-medium text-white/60">Premium Stars</label>
            <ButtonGroup
              options={[
                { id: "off" as const, label: "Off" },
                { id: "subtle" as const, label: "Subtle" },
                { id: "realistic" as const, label: "Realistic" },
              ]}
              value={renderOptions.premiumStars}
              onChange={(id) => {
                setRenderOptions({ premiumStars: id });
                if (!paid && id !== "off") {
                  onPremiumClick?.();
                }
              }}
              paid={paid}
              premiumIds={["subtle", "realistic"]}
            />
          </div>

          {/* Premium Planets */}
          <div>
            <label className="mb-2 block text-[11px] font-medium text-white/60">Premium Planets</label>
            <ButtonGroup
              options={[
                { id: "off" as const, label: "Off" },
                { id: "realistic" as const, label: "Realistic" },
              ]}
              value={renderOptions.premiumPlanets}
              onChange={(id) => {
                setRenderOptions({ premiumPlanets: id });
                if (!paid && id !== "off") {
                  onPremiumClick?.();
                }
              }}
              columns={2}
              paid={paid}
              premiumIds={["realistic"]}
            />
          </div>

          {!paid && (
            <p className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-2.5 py-2 text-[10px] text-amber-100/75">
              Premium features unlock with HD download
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Text Styling */}
      {textBoxes.length > 0 && (
        <CollapsibleSection id={`${baseId}-text`} title="Text Styling">
          <div className="space-y-3">
            {textBoxes.map((box) => (
              <div key={box.id} className="space-y-2.5 rounded-lg border border-white/10 bg-white/[0.05] p-3">
                <label className="block text-xs font-semibold capitalize text-white/80">
                  {box.label || box.id}
                </label>

                {/* Font */}
                <div className="flex items-center gap-2">
                  <span className="w-14 text-[11px] text-white/55">Font</span>
                  <FontSelector
                    value={box.fontFamily}
                    onChange={(font) => handleFontChange(box.id, font)}
                    fontOptions={fontOptions}
                    paid={paid}
                    onPremiumClick={onPremiumClick || (() => {})}
                  />
                </div>

                {/* Color */}
                <div className="flex items-center gap-2">
                  <span className="w-14 text-[11px] text-white/55">Color</span>
                  <input
                    type="color"
                    value={box.color}
                    onChange={(e) => handleColorChange(box.id, e.target.value)}
                    className="h-8 w-24 cursor-pointer rounded-lg border border-white/15 bg-white/[0.08] p-1"
                  />
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

export default AdvancedOptionsPanel;
