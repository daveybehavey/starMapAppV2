"use client";

import Image from "next/image";
import { proPresets } from "@/lib/proPresets";

type ProPresetsPanelProps = {
  selectedOccasion: string | null;
  onSelect: (id: string) => void;
};

export function ProPresetsPanel({ selectedOccasion, onSelect }: ProPresetsPanelProps) {
  return (
    <div className="hidden rounded-2xl border border-white/15 bg-white/5 p-3 shadow-sm shadow-black/30 backdrop-blur-sm lg:block">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-amber-100/90">Pro Presets</h3>
          <p className="text-xs text-neutral-200/80">Curated looks with balanced typography.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[10px] tracking-[0.2em] text-amber-100/80 uppercase">
          New
        </span>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-4">
        {proPresets.map((preset, index) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            className={`group overflow-hidden rounded-xl border bg-[#0b0f24]/80 text-left shadow-sm transition hover:-translate-y-[2px] hover:border-[#d7b56c]/40 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)] ${
              selectedOccasion === preset.id
                ? "border-amber-300/70 ring-1 ring-amber-300/30"
                : "border-white/10"
            }`}
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-[#0f1635]">
              <Image
                src={preset.thumbnail}
                alt={preset.label}
                fill
                priority={index < 2}
                unoptimized
                className="object-cover transition duration-300 group-hover:scale-[1.02]"
                sizes="(min-width: 1024px) 180px, 45vw"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
            </div>
            <div className="border-t border-white/10 px-3 py-2">
              <div className="text-sm font-semibold text-white">{preset.label}</div>
              <div className="text-xs text-neutral-300">{preset.note}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
