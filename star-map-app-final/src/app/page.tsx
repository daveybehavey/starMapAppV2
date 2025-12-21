"use client";

import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import { StyleId, TextBox, useStore } from "@/lib/store";
import { useCallback, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

const styles: { id: StyleId; name: string; note: string }[] = [
  { id: "navyGold", name: "Navy & Gold", note: "Luxe midnight with gilded accents" },
  { id: "vintageEngraving", name: "Vintage Engraving", note: "Linework etched on deep charcoal" },
  { id: "parchmentScroll", name: "Parchment Scroll", note: "Warm cream with antique border" },
  { id: "midnightMinimal", name: "Midnight Minimal", note: "Clean noir with subtle glow" },
];

const fontLabels: Record<string, string> = {
  playfair: "Playfair Display",
  cinzel: "Cinzel",
  script: "Great Vibes",
};

export default function Home() {
  const {
    dateTime,
    textBoxes,
    selectedStyle,
    paid,
    revealed,
    location,
    setDateTime,
    updateTextBox,
    removeTextBox,
    addTextBox,
    setStyle,
    setPaid,
    setRevealed,
  } = useStore(
    useShallow((state) => ({
      dateTime: state.dateTime,
      textBoxes: state.textBoxes,
      selectedStyle: state.selectedStyle,
      paid: state.paid,
      revealed: state.revealed,
      location: state.location,
      setDateTime: state.setDateTime,
      updateTextBox: state.updateTextBox,
      removeTextBox: state.removeTextBox,
      addTextBox: state.addTextBox,
      setStyle: state.setStyle,
      setPaid: state.setPaid,
      setRevealed: state.setRevealed,
    })),
  );

  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(textBoxes.map((box) => [box.id, true])),
  );
  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  const canReveal = Boolean(locationName);
  const previewRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const handleEditScroll = useCallback(() => {
    inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const toggleCard = (id: string) =>
    setCollapsedCards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));

  const handleReveal = useCallback(() => {
    if (!canReveal || !hasDate) {
      inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setRevealed(true);
    requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [canReveal, hasDate, setRevealed]);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-6 pt-6 sm:pt-8 lg:py-12">
      <header className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">Vintage Constellation Maps</p>
          <h1 className="mt-2 text-3xl font-bold text-midnight sm:text-[34px] md:text-4xl">
            Craft a personalized night sky keepsake
          </h1>
          <p className="mt-1 text-sm text-neutral-700 md:text-base">
            Select your moment, style, and dedication. Reveal the sky when you’re ready.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-gold/40 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gold shadow-sm backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
          Live Preview
        </div>
      </header>

      <div className="flex flex-col gap-5 lg:gap-6">
        <section
          ref={previewRef}
          className="flex flex-col gap-3 rounded-3xl border border-black/5 bg-white/70 p-3 shadow-2xl shadow-black/10 backdrop-blur transition-all duration-500 sm:p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Preview</p>
              <h3 className="text-xl font-semibold text-midnight sm:text-2xl">Vintage constellation map</h3>
              <p className="text-xs text-neutral-600 sm:text-sm">
                {revealed
                  ? "Your sky is revealed. Tap edit to refine."
                  : "Hidden until you reveal. Perfect your inputs first."}
              </p>
            </div>
            <div className="rounded-full border border-gold/50 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold shadow-sm">
              {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
            </div>
          </div>
          <div className="rounded-2xl border border-black/5 bg-[#0b1a30] p-2 shadow-inner shadow-black/10">
            <div
              className={`relative min-h-[70vh] overflow-hidden rounded-xl sm:min-h-[75vh] lg:min-h-[80vh] ${
                revealed ? "" : "bg-[#0b1a30]"
              }`}
            >
              {!revealed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#0b1a30] via-[#0b1a30] to-[#091426] text-center text-sm text-amber-50">
                  <div className="pointer-events-none absolute inset-0 opacity-50">
                    <div className="absolute inset-10 rounded-full bg-gradient-to-br from-amber-500/10 via-amber-200/5 to-transparent blur-3xl" />
                    <div className="absolute left-8 top-6 h-1 w-16 rounded-full bg-amber-200/60 blur-[1px]" />
                    <div className="absolute right-12 bottom-8 h-1 w-10 rounded-full bg-amber-100/40 blur-[1px]" />
                  </div>
                  <div className="relative z-10 px-6">
                    <p className="text-base font-semibold text-amber-100">Your sky is wrapped and waiting.</p>
                    <p className="text-xs text-amber-200/80">Enter a place, then tap reveal to unveil the night.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReveal}
                    className={`relative z-10 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30] ${
                      canReveal && hasDate
                        ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                        : "cursor-pointer bg-neutral-400/60 text-neutral-700 shadow-none"
                    }`}
                    aria-disabled={!canReveal || !hasDate}
                  >
                    ✨ Find your special moment
                  </button>
                  {(!canReveal || !hasDate) && (
                    <p className="relative z-10 text-xs text-amber-200/80">
                      Add a location and date to unlock your reveal.
                    </p>
                  )}
                </div>
              )}
              {revealed && (
                <>
                  <PreviewCanvas />
                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5" />
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg text-neutral-800 shadow-md backdrop-blur transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    aria-label="Open fullscreen"
                  >
                    ⤢
                  </button>
                  <button
                    type="button"
                    onClick={handleEditScroll}
                    className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                  >
                    ← Edit
                  </button>
                </>
              )}
            </div>
          </div>
          {revealed && (
            <div className="flex items-center justify-end">
              <span className="text-xs text-neutral-500">Tap edit to adjust details</span>
            </div>
          )}
        </section>

        <section
          ref={inputsRef}
          className="rounded-3xl border border-black/5 bg-white/90 p-4 shadow-xl shadow-black/10 backdrop-blur sm:p-5"
        >
          <h2 className="text-lg font-semibold text-midnight">Inputs</h2>
          <p className="mb-4 text-sm text-neutral-600">
            Set the celestial moment, place, and the words that anchor your print.
          </p>

          <div className="space-y-4">
            <DateTimeControls dateTime={dateTime} onChange={setDateTime} />

            <LocationSearch />

            <div className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-neutral-50/70">
              {textBoxes.map((box) => (
                <div key={box.id} className="space-y-2 p-3 sm:p-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCard(box.id)}
                        className="h-7 w-7 rounded-full border border-black/10 bg-white text-sm font-semibold text-neutral-600 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
                        aria-pressed={!!collapsedCards[box.id]}
                        aria-label={`Toggle ${box.label}`}
                      >
                        {collapsedCards[box.id] ? "▾" : "▴"}
                      </button>
                      <span className="font-medium text-neutral-800">{box.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                        {fontLabels[box.fontFamily]}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTextBox(box.id)}
                        className="h-7 w-7 rounded-full border border-rose-200 bg-rose-50 text-base font-semibold leading-none text-rose-600 transition hover:-translate-y-[1px] hover:shadow"
                        aria-label={`Remove ${box.label}`}
                      >
                        –
                      </button>
                    </div>
                  </div>
                  {!collapsedCards[box.id] && (
                    <>
                      <input
                        type="text"
                        value={box.text}
                        onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                        className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${box.label} color`}
                          value={box.color}
                          onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                          className="h-10 w-14 cursor-pointer rounded-md border border-black/10 bg-white"
                        />
                        <input
                          type="number"
                          min={10}
                          max={48}
                          value={box.size}
                          onChange={(e) =>
                            updateTextBox(box.id, { size: Number.parseInt(e.target.value, 10) || box.size })
                          }
                          className="w-24 rounded-md border border-black/10 bg-white px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                        />
                        <select
                          value={box.align}
                          onChange={(e) => updateTextBox(box.id, { align: e.target.value as TextBox["align"] })}
                          className="flex-1 rounded-md border border-black/10 bg-white px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addTextBox}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 bg-white/80 px-3 py-3 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
            >
              <span className="text-lg">＋</span>
              Add text line
            </button>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-800">Style</label>
                <span className="text-xs uppercase tracking-wide text-neutral-500">4 of 10 presets</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {styles.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setStyle(style.id)}
                    className={`rounded-xl border px-3 py-3 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${
                      selectedStyle === style.id
                        ? "border-gold bg-amber-50/70 text-midnight"
                        : "border-black/10 bg-white/80 text-neutral-800"
                    }`}
                  >
                    <div className="text-sm font-semibold">{style.name}</div>
                    <div className="mt-1 text-xs text-neutral-600">{style.note}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-black/5 bg-gradient-to-r from-white to-amber-50/60 px-4 py-3 shadow-inner shadow-black/5">
              <div>
                <p className="text-sm font-semibold text-midnight">Export mode</p>
                <p className="text-xs text-neutral-600">
                  Free = watermark preview. Paid unlocks clean hi-res.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaid(!paid)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  paid
                    ? "border-emerald-500/60 bg-emerald-50 text-emerald-700"
                    : "border-neutral-300 bg-white text-neutral-700"
                }`}
              >
                <span
                  className={`flex h-2.5 w-2.5 items-center justify-center rounded-full ${
                    paid ? "bg-emerald-500" : "bg-neutral-400"
                  }`}
                />
                {paid ? "Paid" : "Free"}
              </button>
            </div>

            {!revealed && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleReveal}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-white ${
                    canReveal && hasDate
                      ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                      : "cursor-pointer bg-neutral-200 text-neutral-600 shadow-none"
                  }`}
                  aria-disabled={!canReveal || !hasDate}
                >
                  ✨ Find your special moment
                </button>
                {(!canReveal || !hasDate) && (
                  <p className="text-xs text-neutral-500">
                    Please enter a location and date to reveal your sky.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-gradient-to-b from-[#0b1a30] via-[#050b18] to-[#0b1a30] p-4 sm:p-6">
          <div className="relative mx-auto flex h-full max-w-6xl flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setIsFullscreen(false);
                requestAnimationFrame(() => {
                  previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
              className="self-start rounded-full border border-white/20 bg-white/90 px-4 py-2 text-sm font-semibold text-neutral-800 shadow transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30]"
              aria-label="Exit fullscreen"
            >
              ⤡ Exit fullscreen
            </button>
            <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl">
              <PreviewCanvas />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
