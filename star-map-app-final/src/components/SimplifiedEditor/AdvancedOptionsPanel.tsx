"use client";

import { useState } from "react";
import type { RenderOptions, TextBox } from "@/lib/store";
import { visualModes, constellationPresets, fontOptions } from "@/lib/config";
import FontSelector from "@/components/FontSelector";

interface AdvancedOptionsPanelProps {
  renderOptions: RenderOptions;
  setRenderOptions: (next: Partial<RenderOptions>) => void;
  textBoxes: TextBox[];
  setTextBoxes: (boxes: TextBox[]) => void;
  paid: boolean;
  onPremiumClick?: () => void;
}

// Reusable collapsible section
function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-white/10 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-2.5 text-xs font-medium text-amber-100/80 transition hover:text-amber-100"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-1.5">
          {title}
          {badge && (
            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] text-amber-300">
              {badge}
            </span>
          )}
        </span>
        <span className="text-white/40">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && <div className="pb-3 pt-1">{children}</div>}
    </div>
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
    <div className={`grid gap-1.5 grid-cols-${columns}`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {options.map((opt) => {
        const isLocked = premiumIds?.includes(opt.id) && !paid;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
              value === opt.id
                ? "border-amber-300 bg-amber-100 !text-[#0b1433]"
                : "border-white/15 bg-white/10 text-white hover:border-white/30"
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
      className={`flex items-center justify-between rounded-md border px-3 py-2 text-[10px] font-semibold transition ${
        value
          ? "border-amber-300 bg-amber-100 !text-[#0b1433]"
          : "border-white/15 bg-white/10 text-white hover:border-white/30"
      }`}
    >
      <span>{label}</span>
      <span>{value ? "On" : "Off"}</span>
    </button>
  );
}

export function AdvancedOptionsPanel({
  renderOptions,
  setRenderOptions,
  textBoxes,
  setTextBoxes,
  paid,
  onPremiumClick,
}: AdvancedOptionsPanelProps) {
  const handleFontChange = (boxId: string, fontFamily: TextBox["fontFamily"]) => {
    setTextBoxes(
      textBoxes.map((tb) => (tb.id === boxId ? { ...tb, fontFamily } : tb))
    );
  };

  const handleColorChange = (boxId: string, color: string) => {
    setTextBoxes(
      textBoxes.map((tb) => (tb.id === boxId ? { ...tb, color } : tb))
    );
  };

  return (
    <div className="mt-4 border-t border-white/10 pt-2">
      {/* Sky Details - Default Open */}
      <CollapsibleSection title="Sky Details" defaultOpen>
        <div className="space-y-3">
          {/* Visual Mode */}
          <div>
            <label className="mb-1.5 block text-[10px] text-white/50">Visual Mode</label>
            <ButtonGroup
              options={visualModes.map((m) => ({ id: m.id, label: m.label }))}
              value={renderOptions.visualMode}
              onChange={(id) => setRenderOptions({ visualMode: id })}
            />
          </div>

          {/* Moon Controls */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Toggle
                label="Moon"
                value={renderOptions.showMoon}
                onChange={(val) => setRenderOptions({ showMoon: val })}
              />
            </div>
            {renderOptions.showMoon && (
              <div className="flex-1">
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
      <CollapsibleSection title="Constellations">
        <div className="space-y-3">
          {/* Lines */}
          <div>
            <label className="mb-1.5 block text-[10px] text-white/50">Lines</label>
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
                <label className="mb-1.5 block text-[10px] text-white/50">Line Color</label>
                <input
                  type="color"
                  value={renderOptions.constellationColor || "#ffffff"}
                  onChange={(e) => setRenderOptions({ constellationColor: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded-md border border-white/15 bg-white/10"
                />
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Premium Effects */}
      <CollapsibleSection title="Premium Effects" badge="PRO">
        <div className="space-y-3">
          {/* Premium Stars */}
          <div>
            <label className="mb-1.5 block text-[10px] text-white/50">Premium Stars</label>
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
            <label className="mb-1.5 block text-[10px] text-white/50">Premium Planets</label>
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
            <p className="text-[9px] text-white/40">
              Premium features unlock with HD download
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Text Styling */}
      {textBoxes.length > 0 && (
        <CollapsibleSection title="Text Styling">
          <div className="space-y-4">
            {textBoxes.map((box) => (
              <div key={box.id} className="space-y-2">
                <label className="block text-[10px] font-medium capitalize text-white/70">
                  {box.label || box.id}
                </label>

                {/* Font */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/50 w-12">Font</span>
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
                  <span className="text-[10px] text-white/50 w-12">Color</span>
                  <input
                    type="color"
                    value={box.color}
                    onChange={(e) => handleColorChange(box.id, e.target.value)}
                    className="h-7 w-20 cursor-pointer rounded-md border border-white/15 bg-white/10"
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
