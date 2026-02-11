"use client";
import dynamic from "next/dynamic";
import { useState } from "react";

const HeroEditorIsland = dynamic(() => import("./HeroEditorIsland"), { ssr: false });

type HeroEditorFallbackProps = {
  onActivate: (payload: { dateValue: string; locationValue: string }) => void;
};

function HeroEditorFallback({ onActivate }: HeroEditorFallbackProps) {
  const [dateValue, setDateValue] = useState("");
  const [locationValue, setLocationValue] = useState("");

  const handleActivate = () => {
    onActivate({ dateValue, locationValue });
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="glass-panel min-w-0 rounded-2xl px-5 py-6 sm:px-6 sm:py-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/80">
            Create your map
          </p>
          <span className="text-xs text-white/60">Preview opens after click</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="sr-only">When was it?</label>
            <input
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40"
            />
          </div>
          <div className="min-w-0">
            <label className="sr-only">Where was it?</label>
            <input
              type="text"
              placeholder="City or address"
              value={locationValue}
              onChange={(event) => setLocationValue(event.target.value)}
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white placeholder:text-white/40"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleActivate}
          className="mt-5 w-full rounded-full bg-amber-400 px-4 py-3 text-sm font-semibold text-[#0b1433] shadow-sm transition hover:-translate-y-[1px] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          Open the editor
        </button>
      </div>
    </div>
  );
}

export default function HeroEditorDeferred() {
  const [ready, setReady] = useState(false);
  const [prefill, setPrefill] = useState<{ dateValue: string; locationValue: string } | null>(null);
  const handleActivate = (payload: { dateValue: string; locationValue: string }) => {
    setPrefill(payload);
    setReady(true);
  };

  if (!ready) {
    return <HeroEditorFallback onActivate={handleActivate} />;
  }

  return <HeroEditorIsland initialOpen prefill={prefill ?? undefined} />;
}
