"use client";

import PreviewCanvas from "@/components/PreviewCanvas";
import { useEffect, useState, useMemo } from "react";
import { type TextBox, type StyleId, type RenderOptions } from "@/lib/store";
import { type MapRecipe } from "@/lib/renderSky";
import type { AspectRatio, Shape } from "@/lib/types";
import Link from "next/link";
import { formatPrice, getPricingTiers } from "@/lib/pricing";
import EditorFontShell from "@/components/EditorFontShell";

type ApiRecipe = {
  version: number;
  seed: string;
  datetimeISO: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: TextBox[];
  selectedStyle: StyleId;
  aspectRatio?: AspectRatio;
  shape?: Shape;
  renderOptions?: Partial<RenderOptions> & {
    shapeMask?: string; // Legacy field for backwards compatibility
  };
};

type Props = {
  id: string;
  searchParams?: Record<string, string>;
};

function generateStoryText(recipe: ApiRecipe): string {
  const date = new Date(recipe.datetimeISO);
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);

  const location = recipe.location?.name || "this location";

  // Deterministic story based on data
  return `On ${formattedDate}, the night sky over ${location} looked exactly like this. Every star, every constellation, precisely as they appeared that evening.`;
}

export function ViewClient({ id, searchParams }: Props) {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [apiRecipe, setApiRecipe] = useState<ApiRecipe | null>(null);
  const [shareFeedback, setShareFeedback] = useState("");

  // Convert API recipe to MapRecipe format for PreviewCanvas
  // This keeps the recipe in local state instead of polluting the global store
  const mapRecipe = useMemo((): MapRecipe | undefined => {
    if (!apiRecipe) return undefined;

    // Resolve shape from either new format or legacy shapeMask
    const validShapes = new Set(["rectangle", "heart", "circle", "star", "diamond"]);
    let resolvedShape: Shape = "rectangle";
    if (apiRecipe.shape && validShapes.has(apiRecipe.shape)) {
      resolvedShape = apiRecipe.shape;
    } else if (apiRecipe.renderOptions?.shapeMask && validShapes.has(apiRecipe.renderOptions.shapeMask)) {
      resolvedShape = apiRecipe.renderOptions.shapeMask as Shape;
    }

    return {
      version: apiRecipe.version,
      seed: apiRecipe.seed,
      datetimeISO: apiRecipe.datetimeISO,
      location: apiRecipe.location,
      textBoxes: apiRecipe.textBoxes,
      selectedStyle: apiRecipe.selectedStyle,
      aspectRatio: apiRecipe.aspectRatio ?? "square",
      shape: resolvedShape,
      renderOptions: apiRecipe.renderOptions,
    };
  }, [apiRecipe]);

  const pricingLabel = useMemo(() => {
    const tiers = getPricingTiers();
    return formatPrice(tiers.single.amountCents, tiers.single.currency);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const qp = searchParams
          ? Object.entries(searchParams)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
              .join("&")
          : "";
        const res = await fetch(`/api/maps?id=${id}${qp ? `&${qp}` : ""}`);
        if (!res.ok) throw new Error("Not found");
        const data = (await res.json()) as ApiRecipe;

        setApiRecipe(data);
        setStatus("ready");
      } catch (e) {
        console.error(`Failed to load star map (id: ${id}):`, e);
        setStatus("error");
      }
    };
    load();
  }, [id, searchParams]);

  if (status === "loading") {
    return (
      <EditorFontShell>
        <main className="flex min-h-screen items-center justify-center bg-[#0b0f3b] text-amber-50">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-t-transparent"></div>
            <p className="mt-3 text-sm">Loading your star map…</p>
          </div>
        </main>
      </EditorFontShell>
    );
  }

  if (status === "error") {
    return (
      <EditorFontShell>
        <main className="flex min-h-screen flex-col items-center justify-center bg-[#0b0f3b] px-4 text-amber-50">
          <div className="text-center max-w-md">
            <p className="text-2xl font-semibold mb-2">Map not found</p>
            <p className="text-neutral-300 mb-6">This star map doesn't exist or has been removed.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-6 py-3 text-base font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] hover:shadow-xl"
            >
              ✨ Create your own star map
            </Link>
          </div>
        </main>
      </EditorFontShell>
    );
  }

  const storyText = apiRecipe ? generateStoryText(apiRecipe) : "";
  const title = apiRecipe?.textBoxes?.[0]?.text || "A Night to Remember";

  const handleShare = async () => {
    if (!apiRecipe) return;

    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `The night sky on ${new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(apiRecipe.datetimeISO))} over ${apiRecipe.location.name}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url, title, text });
      } catch {
        // User cancelled or error
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        setShareFeedback("Link copied!");
        setTimeout(() => setShareFeedback(""), 2000);
      } catch {
        setShareFeedback("Failed to copy");
        setTimeout(() => setShareFeedback(""), 2000);
      }
    }
  };

  return (
    <EditorFontShell>
      <main className="min-h-screen bg-gradient-to-b from-[#0b0f3b] to-[#1a1f3a] text-amber-50">
      {/* Hero Section */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">Star Map</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              {apiRecipe ? (
                <>
                  The exact night sky from{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }).format(new Date(apiRecipe.datetimeISO))}{" "}
                  — {apiRecipe.location.name}
                </>
              ) : (
                "A Night to Remember"
              )}
            </h1>
            {title && title !== "A Night to Remember" && (
              <p className="mt-2 text-lg text-neutral-300 italic">{title}</p>
            )}
          </div>
          <Link
            href={`/?from=${id}`}
            className="inline-flex flex-col items-center justify-center gap-1 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-6 py-3 text-sm font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] hover:shadow-xl"
          >
            <span>✨ Create your own star map</span>
            <span className="text-xs text-midnight/70 font-normal">Free preview · HD from {pricingLabel}</span>
          </Link>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
          {/* Left: Star Map */}
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-amber-200/30 bg-black/40 p-4 shadow-2xl backdrop-blur">
              <PreviewCanvas readOnly externalRecipe={mapRecipe} />
            </div>

            {/* Accuracy micro-explainer */}
            <div className="rounded-lg border border-amber-200/30 bg-amber-50/10 p-3 text-xs text-white">
              <details>
                <summary className="cursor-pointer font-semibold">
                  ⭐ Matches professional planetarium accuracy
                </summary>
                <p className="mt-2 text-neutral-200">
                  Built on Yale Bright Star Catalog & NASA-grade ephemeris.
                  Timezone-corrected, location-accurate to 0.01°.
                </p>
              </details>
            </div>

            {/* Share Button */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:shadow"
              >
                📤 Share this map
              </button>
              {shareFeedback && (
                <span className="text-xs text-amber-300">{shareFeedback}</span>
              )}
            </div>
          </div>

          {/* Right: Story & Details */}
          <div className="space-y-4">
            {/* Story Card */}
            <div className="rounded-xl border border-amber-200/30 bg-gradient-to-br from-amber-50/10 to-amber-100/5 p-6 backdrop-blur">
              <h2 className="mb-3 text-lg font-semibold text-white">The Story</h2>
              <p className="text-sm leading-relaxed text-neutral-200">{storyText}</p>
            </div>

            {/* Details Card */}
            {apiRecipe && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-amber-400">
                  Details
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-neutral-400">Location</p>
                    <p className="font-medium text-white">{apiRecipe.location?.name || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400">Date</p>
                    <p className="font-medium text-white">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(apiRecipe.datetimeISO))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400">Coordinates</p>
                    <p className="font-mono text-xs text-neutral-300">
                      {apiRecipe.location?.latitude.toFixed(4)}°, {apiRecipe.location?.longitude.toFixed(4)}°
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* CTA Card */}
            <div className="rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-50/10 to-amber-100/10 p-6 backdrop-blur">
              <h3 className="mb-2 text-lg font-semibold text-white">Create Your Own</h3>
              <p className="mb-4 text-sm text-neutral-200">
                Capture your own special moment with a custom star map. Fast, accurate, and print-ready.
              </p>
              <Link
                href={`/?from=${id}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-6 py-3 text-sm font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] hover:shadow-xl"
              >
                Start Creating →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-sm text-neutral-400">
            Made with{" "}
            <Link href="/" className="text-amber-400 hover:underline">
              StarMapCo
            </Link>
          </p>
        </div>
      </footer>
      </main>
    </EditorFontShell>
  );
}
