"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GalleryExample } from "@/lib/galleryExamples";

type GalleryExplorerProps = {
  examples: GalleryExample[];
};

type FilterValue = "all" | string;

function filterChipClasses(active: boolean) {
  return active
    ? "border-amber-300/70 bg-amber-300/20 text-amber-950 shadow-sm"
    : "border-black/10 bg-white/80 text-neutral-700 hover:border-amber-300/40 hover:bg-amber-50";
}

export default function GalleryExplorer({ examples }: GalleryExplorerProps) {
  const occasionOptions = useMemo(
    () => ["all", ...new Set(examples.map((item) => item.occasion))],
    [examples],
  );
  const styleOptions = useMemo(
    () => ["all", ...new Set(examples.map((item) => item.styleLabel))],
    [examples],
  );

  const [occasionFilter, setOccasionFilter] = useState<FilterValue>("all");
  const [styleFilter, setStyleFilter] = useState<FilterValue>("all");
  const [selectedId, setSelectedId] = useState<string>(examples[0]?.id ?? "");

  const filteredExamples = useMemo(() => {
    return examples.filter((item) => {
      const matchesOccasion = occasionFilter === "all" || item.occasion === occasionFilter;
      const matchesStyle = styleFilter === "all" || item.styleLabel === styleFilter;
      return matchesOccasion && matchesStyle;
    });
  }, [examples, occasionFilter, styleFilter]);

  useEffect(() => {
    if (!filteredExamples.length) return;
    const selectedStillVisible = filteredExamples.some((item) => item.id === selectedId);
    if (!selectedStillVisible) {
      setSelectedId(filteredExamples[0].id);
    }
  }, [filteredExamples, selectedId]);

  const selectedExample =
    filteredExamples.find((item) => item.id === selectedId) ??
    filteredExamples[0] ??
    examples[0] ??
    null;

  const shuffleExample = () => {
    if (!filteredExamples.length) return;
    const options = filteredExamples.filter((item) => item.id !== selectedId);
    const pool = options.length ? options : filteredExamples;
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (next) setSelectedId(next.id);
  };

  return (
    <section className="content-visibility-auto mt-8 overflow-hidden rounded-[2rem] border border-black/5 bg-white/90 shadow-xl shadow-black/10">
      <div className="grid gap-0 lg:grid-cols-[0.9fr,1.1fr]">
        <div className="space-y-5 border-b border-black/5 bg-[radial-gradient(circle_at_top,_rgba(245,200,111,0.28),_transparent_55%),linear-gradient(180deg,_rgba(255,250,240,0.95),_rgba(255,255,255,0.96))] p-6 lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">Inspiration explorer</p>
            <h2 className="text-2xl font-semibold text-midnight">Find a look worth copying</h2>
            <p className="text-sm text-neutral-700 sm:text-base">
              Filter by occasion or style, then jump into the editor once you have a direction that feels right.
            </p>
          </div>

          <div className="space-y-3 rounded-3xl border border-black/10 bg-white/80 p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Occasion</p>
                <span className="text-xs text-neutral-500">{filteredExamples.length} shown</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {occasionOptions.map((option) => {
                  const active = occasionFilter === option;
                  const label = option === "all" ? "All occasions" : option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setOccasionFilter(option)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filterChipClasses(active)}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Style</p>
              <div className="flex flex-wrap gap-2">
                {styleOptions.map((option) => {
                  const active = styleFilter === option;
                  const label = option === "all" ? "All styles" : option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setStyleFilter(option)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filterChipClasses(active)}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={shuffleExample}
              className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-amber-50"
            >
              Shuffle inspiration
            </button>
            <Link
              href={
                selectedExample
                  ? `/editor?mode=quick&source=${encodeURIComponent(`gallery-explorer-${selectedExample.id}`)}`
                  : "/editor?mode=quick&source=gallery-explorer"
              }
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2.5 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl"
            >
              Start from this direction
            </Link>
          </div>

          {selectedExample ? (
            <div className="rounded-3xl border border-black/10 bg-midnight px-4 py-4 text-white shadow-lg shadow-black/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                    {selectedExample.badge}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{selectedExample.title}</h3>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-100">
                  {selectedExample.occasion}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-200">{selectedExample.caption}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          {selectedExample ? (
            <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
              <div className="group overflow-hidden rounded-[1.75rem] border border-black/10 bg-[linear-gradient(180deg,_rgba(14,20,34,0.96),_rgba(31,44,70,0.94))] p-3 shadow-xl shadow-black/15">
                <div className="relative aspect-square overflow-hidden rounded-[1.35rem]">
                  <Image
                    src={selectedExample.src}
                    alt={selectedExample.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 55vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-between gap-4 rounded-[1.75rem] border border-black/10 bg-neutral-50 p-5">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    <span className="rounded-full border border-amber-300/60 bg-amber-100 px-3 py-1 text-amber-800">
                      {selectedExample.styleLabel}
                    </span>
                    <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-neutral-600">
                      {selectedExample.occasion}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-midnight">{selectedExample.shortLabel}</h3>
                  <p className="text-sm leading-relaxed text-neutral-700">
                    {selectedExample.caption}. Use this as a visual benchmark, then generate your own map with the same level of detail and finish.
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <Link
                    href={`/editor?mode=quick&source=${encodeURIComponent(`gallery-hero-${selectedExample.id}`)}`}
                    className="inline-flex w-full items-center justify-center rounded-full bg-midnight px-4 py-3 font-semibold text-white transition hover:-translate-y-[1px] hover:bg-midnight/90"
                  >
                    Start free preview
                  </Link>
                  <a
                    href={`#${selectedExample.anchor}`}
                    className="inline-flex w-full items-center justify-center rounded-full border border-black/10 bg-white px-4 py-3 font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-neutral-100"
                  >
                    Jump to this card
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredExamples.map((item) => {
              const active = item.id === selectedExample?.id;
              return (
                <button
                  key={item.id}
                  id={item.anchor}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`group overflow-hidden rounded-2xl border text-left transition ${
                    active
                      ? "border-amber-300/70 bg-amber-50 shadow-lg shadow-amber-100/70"
                      : "border-black/10 bg-white shadow-lg shadow-black/8 hover:-translate-y-[1px] hover:shadow-xl"
                  }`}
                >
                  <div className="relative aspect-square overflow-hidden">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className="object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="space-y-2 border-t border-black/5 px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        {item.badge}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                        {item.occasion}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-midnight">{item.title}</p>
                    <p className="text-xs text-neutral-600">{item.caption}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
