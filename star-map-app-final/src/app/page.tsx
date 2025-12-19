"use client";

import PreviewCanvas from "@/components/PreviewCanvas";
import { StyleId, TextBox, useStore } from "@/lib/store";
import { useMemo } from "react";
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
    location,
    textBoxes,
    selectedStyle,
    paid,
    setDateTime,
    setLocation,
    updateTextBox,
    setStyle,
    setPaid,
  } = useStore(
    useShallow((state) => ({
      dateTime: state.dateTime,
      location: state.location,
      textBoxes: state.textBoxes,
      selectedStyle: state.selectedStyle,
      paid: state.paid,
      setDateTime: state.setDateTime,
      setLocation: state.setLocation,
      updateTextBox: state.updateTextBox,
      setStyle: state.setStyle,
      setPaid: state.setPaid,
    })),
  );

  const dateTimeInputValue = useMemo(() => {
    const date = new Date(dateTime);
    return date.toISOString().slice(0, 16);
  }, [dateTime]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 lg:py-14">
      <header className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">Vintage Constellation Maps</p>
          <h1 className="mt-2 text-3xl font-bold text-midnight md:text-4xl">
            Craft a personalized night sky keepsake
          </h1>
          <p className="mt-1 text-sm text-neutral-700 md:text-base">
            Select your moment, style, and dedication. Real-time preview updates as you fine-tune.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gold shadow-sm backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
          Live Preview
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-black/5 bg-white/80 p-5 shadow-xl shadow-black/5 backdrop-blur">
          <h2 className="text-lg font-semibold text-midnight">Inputs</h2>
          <p className="mb-4 text-sm text-neutral-600">
            Set the celestial moment, place, and the words that anchor your print.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-neutral-800">Date &amp; Time</label>
              <input
                type="datetime-local"
                value={dateTimeInputValue}
                onChange={(e) => setDateTime(new Date(e.target.value).toISOString())}
                className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-neutral-800">Location</label>
              <input
                type="text"
                value={location.name}
                placeholder="Search or paste a place"
                onChange={(e) => setLocation({ name: e.target.value })}
                className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Geocoding + time zone wiring will auto-fill soon.
              </p>
            </div>

            <div className="divide-y divide-black/5 rounded-lg border border-black/5 bg-neutral-50/70">
              {textBoxes.map((box) => (
                <div key={box.id} className="space-y-2 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-800">{box.label}</span>
                    <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                      {fontLabels[box.fontFamily]}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={box.text}
                    onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`${box.label} color`}
                      value={box.color}
                      onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                      className="h-9 w-12 cursor-pointer rounded-md border border-black/10 bg-white"
                    />
                    <input
                      type="number"
                      min={10}
                      max={48}
                      value={box.size}
                      onChange={(e) =>
                        updateTextBox(box.id, { size: Number.parseInt(e.target.value, 10) || box.size })
                      }
                      className="w-20 rounded-md border border-black/10 bg-white px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
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
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-800">Style</label>
                <span className="text-xs uppercase tracking-wide text-neutral-500">4 of 10 presets</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
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
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white/70 p-4 shadow-2xl shadow-black/10 backdrop-blur lg:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Preview</p>
              <h3 className="text-xl font-semibold text-midnight">Vintage constellation map</h3>
              <p className="text-xs text-neutral-600">
                Updates instantly as you adjust inputs. Zoom/pan coming next.
              </p>
            </div>
            <div className="rounded-full border border-gold/50 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold shadow-sm">
              {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
            </div>
          </div>
          <PreviewCanvas />
        </section>
      </div>
    </main>
  );
}
