"use client";

import { useState, useEffect } from "react";
import PreviewCanvas from "@/components/PreviewCanvas";
import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import { useStore, type TextBox } from "@/lib/store";
import { renderModes } from "@/lib/renderModes";
import Link from "next/link";

const fontOptions: Array<{ id: TextBox["fontFamily"]; label: string; premium?: boolean }> = [
  { id: "playfair", label: "Playfair Display" },
  { id: "cinzel", label: "Cinzel" },
  { id: "script", label: "Great Vibes" },
  { id: "cormorant", label: "Cormorant Garamond" },
  { id: "montserrat", label: "Montserrat" },
  { id: "libreBaskerville", label: "Libre Baskerville", premium: true },
  { id: "ebGaramond", label: "EB Garamond", premium: true },
  { id: "crimsonText", label: "Crimson Text", premium: true },
  { id: "raleway", label: "Raleway", premium: true },
  { id: "lora", label: "Lora", premium: true },
];

type AccordionSection = "render" | "date" | "text" | "style" | "advanced";

export function RefineClient() {
  const [openSections, setOpenSections] = useState<Set<AccordionSection>>(
    new Set(["render", "date", "text", "style"])
  );

  const dateTime = useStore((s) => s.dateTime);
  const setDateTime = useStore((s) => s.setDateTime);
  const location = useStore((s) => s.location);
  const textBoxes = useStore((s) => s.textBoxes);
  const updateTextBox = useStore((s) => s.updateTextBox);
  const addTextBox = useStore((s) => s.addTextBox);
  const removeTextBox = useStore((s) => s.removeTextBox);
  const selectedStyle = useStore((s) => s.selectedStyle);
  const setStyle = useStore((s) => s.setStyle);
  const shape = useStore((s) => s.shape);
  const setShape = useStore((s) => s.setShape);
  const renderOptions = useStore((s) => s.renderOptions);
  const setRenderOptions = useStore((s) => s.setRenderOptions);
  const paid = useStore((s) => s.paid);
  const revealed = useStore((s) => s.revealed);
  const setRevealed = useStore((s) => s.setRevealed);

  // Local state for render mode and intensity (not in Zustand store)
  const [renderMode, setRenderMode] = useState<any>("classic");
  const [intensity, setIntensity] = useState(50);

  // Convert renderModes record to array for rendering
  const renderModesArray = [
    { id: "classic", label: "Classic", premium: false },
    { id: "cinematic", label: "Cinematic", premium: true },
    { id: "blueprint", label: "Blueprint", premium: false },
    { id: "luxe", label: "Luxe", premium: true },
  ];

  // Auto-reveal logic: if user lands in Refine without revealing, auto-reveal once
  useEffect(() => {
    if (dateTime && location && !revealed) {
      setRevealed(true);
    }
  }, [dateTime, location, revealed, setRevealed]);

  const toggleSection = (section: AccordionSection) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const styles = [
    { id: "navyGold", name: "Navy & Gold" },
    { id: "vintageEngraving", name: "Vintage Engraving" },
    { id: "parchmentScroll", name: "Parchment Scroll" },
    { id: "midnightMinimal", name: "Midnight Minimal" },
  ];

  const shapes = [
    { id: "rectangle", label: "Rectangle" },
    { id: "heart", label: "Heart" },
    { id: "circle", label: "Circle" },
    { id: "star", label: "Star" },
  ];

  return (
    <main className="min-h-screen bg-[#0b0f3b]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0b0f24]">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-amber-400 hover:underline">
              ← Back to Create
            </Link>
            <h1 className="text-2xl font-bold text-white mt-1">Refine Your Map</h1>
            <p className="text-sm text-neutral-400">Advanced controls for perfection</p>
          </div>
          <button className="rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2 text-sm font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px]">
            Export HD
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[400px,1fr]">
          {/* Left: Controls (Accordion) */}
          <div className="space-y-4">
            {/* Render Mode & Intensity Accordion */}
            <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button
                onClick={() => toggleSection("render")}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-lg font-semibold text-white">Render & Intensity</h2>
                  <p className="text-xs text-neutral-400">Visual style and brightness</p>
                </div>
                <span className="text-white text-xl">{openSections.has("render") ? "−" : "+"}</span>
              </button>
              {openSections.has("render") && (
                <div className="p-4 pt-0 space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-white mb-2 block">
                      Render Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {renderModesArray.map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setRenderMode(mode.id)}
                          disabled={mode.premium && !paid}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                            renderMode === mode.id
                              ? "border-amber-300 bg-amber-100 text-midnight"
                              : mode.premium && !paid
                              ? "border-white/10 bg-white/5 text-neutral-500 cursor-not-allowed"
                              : "border-white/15 bg-white/10 text-white"
                          }`}
                        >
                          {mode.label}
                          {mode.premium && !paid && " 🔒"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-white mb-2 block">
                      Intensity: {intensity}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={intensity}
                      onChange={(e) => setIntensity(Number(e.target.value))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, rgb(251, 191, 36) 0%, rgb(251, 191, 36) ${intensity}%, rgba(255,255,255,0.2) ${intensity}%, rgba(255,255,255,0.2) 100%)`
                      }}
                    />
                    {intensity > 60 && !paid && (
                      <p className="text-xs text-amber-400 mt-1">HD export required for {intensity}% intensity</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Date & Location Accordion */}
            <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button
                onClick={() => toggleSection("date")}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-lg font-semibold text-white">Date & Location</h2>
                  <p className="text-xs text-neutral-400">When and where</p>
                </div>
                <span className="text-white text-xl">{openSections.has("date") ? "−" : "+"}</span>
              </button>
              {openSections.has("date") && (
                <div className="p-4 pt-0 space-y-3">
                  <DateTimeControls dateTime={dateTime} onChange={setDateTime} />
                  <LocationSearch />
                </div>
              )}
            </section>

            {/* Text Customization Accordion */}
            <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button
                onClick={() => toggleSection("text")}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-lg font-semibold text-white">Text Customization</h2>
                  <p className="text-xs text-neutral-400">Fonts, colors, sizes</p>
                </div>
                <span className="text-white text-xl">{openSections.has("text") ? "−" : "+"}</span>
              </button>
              {openSections.has("text") && (
                <div className="p-4 pt-0 space-y-4">
                  {textBoxes.map((box) => (
                    <div key={box.id} className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{box.label}</span>
                        <button
                          onClick={() => removeTextBox(box.id)}
                          className="text-xs text-rose-400 hover:text-rose-300"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={box.text}
                        onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                        className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white"
                        placeholder={`Enter ${box.label.toLowerCase()}...`}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-neutral-400">Font</label>
                          <select
                            value={box.fontFamily}
                            onChange={(e) =>
                              updateTextBox(box.id, { fontFamily: e.target.value as any })
                            }
                            className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-sm text-white"
                          >
                            {fontOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.premium ? `🔒 ${opt.label}` : opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-neutral-400">Size</label>
                          <input
                            type="number"
                            min={10}
                            max={48}
                            value={box.size}
                            onChange={(e) =>
                              updateTextBox(box.id, { size: parseInt(e.target.value) })
                            }
                            className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-sm text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-neutral-400">Color</label>
                          <input
                            type="color"
                            value={box.color}
                            onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                            className="w-full h-9 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-neutral-400">Align</label>
                          <select
                            value={box.align}
                            onChange={(e) =>
                              updateTextBox(box.id, { align: e.target.value as any })
                            }
                            className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-sm text-white"
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            updateTextBox(box.id, { textShadow: !box.textShadow })
                          }
                          className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                            box.textShadow
                              ? "border-amber-300 bg-amber-100 text-midnight"
                              : "border-white/15 bg-white/10 text-white"
                          }`}
                        >
                          Shadow
                        </button>
                        <button
                          onClick={() =>
                            updateTextBox(box.id, { textGlow: !box.textGlow })
                          }
                          className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                            box.textGlow
                              ? "border-amber-300 bg-amber-100 text-midnight"
                              : "border-white/15 bg-white/10 text-white"
                          }`}
                        >
                          Glow
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addTextBox}
                    className="w-full rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
                  >
                    + Add Text Line
                  </button>
                </div>
              )}
            </section>

            {/* Style & Shape Accordion */}
            <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button
                onClick={() => toggleSection("style")}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-lg font-semibold text-white">Style & Shape</h2>
                  <p className="text-xs text-neutral-400">Visual presentation</p>
                </div>
                <span className="text-white text-xl">{openSections.has("style") ? "−" : "+"}</span>
              </button>
              {openSections.has("style") && (
                <div className="p-4 pt-0 space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-white mb-2 block">
                      Style
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {styles.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setStyle(style.id as any)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                            selectedStyle === style.id
                              ? "border-amber-300 bg-amber-100 text-midnight"
                              : "border-white/15 bg-white/10 text-white"
                          }`}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-white mb-2 block">Shape</label>
                    <div className="grid grid-cols-2 gap-2">
                      {shapes.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setShape(s.id as any)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                            shape === s.id
                              ? "border-amber-300 bg-amber-100 text-midnight"
                              : "border-white/15 bg-white/10 text-white"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {shape !== "rectangle" && (
                    <div>
                      <label className="text-sm font-semibold text-white mb-2 block">
                        Background Color
                      </label>
                      <input
                        type="color"
                        value={renderOptions.backgroundColor || "#0b1a30"}
                        onChange={(e) =>
                          setRenderOptions({ backgroundColor: e.target.value })
                        }
                        className="w-full h-12 rounded-md border border-white/15 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Advanced Options Accordion */}
            <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button
                onClick={() => toggleSection("advanced")}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition"
              >
                <div>
                  <h2 className="text-lg font-semibold text-white">Advanced</h2>
                  <p className="text-xs text-neutral-400">Constellations, visual modes</p>
                </div>
                <span className="text-white text-xl">{openSections.has("advanced") ? "−" : "+"}</span>
              </button>
              {openSections.has("advanced") && (
                <div className="p-4 pt-0 space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-white mb-2 block">
                      Constellation Lines
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {["off", "thin", "thick"].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setRenderOptions({ constellationLines: mode as any })}
                          className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                            renderOptions.constellationLines === mode
                              ? "border-amber-300 bg-amber-100 text-midnight"
                              : "border-white/15 bg-white/10 text-white capitalize"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {renderOptions.constellationLines !== "off" && (
                    <>
                      <div>
                        <label className="text-sm font-semibold text-white mb-2 block">
                          Constellation Line Color
                        </label>
                        <input
                          type="color"
                          value={renderOptions.constellationColor || "#ffffff"}
                          onChange={(e) =>
                            setRenderOptions({ constellationColor: e.target.value })
                          }
                          className="w-full h-10 rounded-md border border-white/15 cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-white mb-2 block">
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
                          className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="text-sm font-semibold text-white mb-2 block">
                      Constellation Labels
                    </label>
                    <button
                      onClick={() =>
                        setRenderOptions({
                          constellationLabels: !renderOptions.constellationLabels,
                        })
                      }
                      className={`w-full rounded-md border px-3 py-2 text-sm font-semibold transition ${
                        renderOptions.constellationLabels
                          ? "border-amber-300 bg-amber-100 text-midnight"
                          : "border-white/15 bg-white/10 text-white"
                      }`}
                    >
                      {renderOptions.constellationLabels ? "Labels On" : "Labels Off"}
                    </button>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-white mb-2 block">
                      Visual Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {["astronomical", "enhanced", "illustrated"].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setRenderOptions({ visualMode: mode as any })}
                          className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                            renderOptions.visualMode === mode
                              ? "border-amber-300 bg-amber-100 text-midnight"
                              : "border-white/15 bg-white/10 text-white capitalize"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Right: Preview (Always Visible) */}
          <div className="lg:sticky lg:top-6 h-fit">
            <div className="rounded-xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Live Preview</h3>
                <span className="text-xs text-emerald-400">● Real-time</span>
              </div>
              <div className="relative aspect-square overflow-hidden rounded-lg">
                <PreviewCanvas onRendered={() => {}} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
