"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap, type MapRecipe } from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";
import type { Shape } from "@/lib/types";
import { track } from "@/lib/analytics";

const DRAFT_KEY = "star-map-draft";
const AUTO_EXPORT_KEY = "star-map-auto-export";

type Status = "checking" | "ready" | "downloading" | "error" | "no-draft" | "not-paid";
type PreviewStatus = "idle" | "rendering" | "ready" | "error";

function readDraft(): MapRecipe | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MapRecipe> & {
      dateTime?: string;
      selectedStyle?: MapRecipe["selectedStyle"];
      aspectRatio?: MapRecipe["aspectRatio"];
      shape?: Shape;
      renderOptions?: MapRecipe["renderOptions"] & { shapeMask?: string };
      location?: MapRecipe["location"];
      textBoxes?: MapRecipe["textBoxes"];
    };
    if (parsed.datetimeISO && parsed.location && parsed.textBoxes && parsed.selectedStyle) {
      return parsed as MapRecipe;
    }
    if (parsed.dateTime && parsed.location && parsed.textBoxes && parsed.selectedStyle) {
      return buildRecipeFromState({
        dateTime: parsed.dateTime,
        location: parsed.location,
        textBoxes: parsed.textBoxes,
        selectedStyle: parsed.selectedStyle,
        aspectRatio: parsed.aspectRatio,
        shape: parsed.shape,
        renderOptions: parsed.renderOptions,
      });
    }
  } catch {
    return null;
  }
  return null;
}

export default function DownloadClient() {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<MapRecipe | null>(null);
  const [paid, setPaid] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewAspect, setPreviewAspect] = useState<string>("1 / 1");
  const autoTriggeredRef = useRef(false);
  const paidRef = useRef(false);

  const setPaidState = useCallback((value: boolean) => {
    paidRef.current = value;
    setPaid(value);
  }, []);

  const refreshPaidStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/premium", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as { paid?: boolean };
      const nextPaid = Boolean(data.paid);
      setPaidState(nextPaid);
      return nextPaid;
    } catch {
      return false;
    }
  }, [setPaidState]);

  const resolveShapeAndRatio = useCallback(async (activeRecipe: MapRecipe) => {
    const shape = (activeRecipe.shape ||
      (activeRecipe.renderOptions?.shapeMask as Shape) ||
      "rectangle") as Shape;
    const shapeData = await getShapeData(shape).catch(() => null);
    let ratio = aspectRatioToNumber(activeRecipe.aspectRatio ?? "square");
    if (shapeData && shapeData.viewBox.height > 0) {
      ratio = shapeData.viewBox.width / shapeData.viewBox.height;
    }
    return { shape, ratio };
  }, []);

  const updatePreviewAspect = useCallback(
    async (activeRecipe: MapRecipe) => {
      const { ratio } = await resolveShapeAndRatio(activeRecipe);
      setPreviewAspect(`${ratio} / 1`);
    },
    [resolveShapeAndRatio],
  );

  const startDownload = useCallback(
    async (recipeOverride?: MapRecipe, source: "auto" | "manual" = "manual") => {
      const activeRecipe = recipeOverride ?? recipe;
      if (!paidRef.current) {
        setStatus("not-paid");
        setMessage("Payment verification is still pending. Please refresh in a moment.");
        return;
      }
      if (!activeRecipe) {
        setStatus("no-draft");
        setMessage("We couldn't find your saved map. Open the editor to rebuild it, then download.");
        return;
      }

      setStatus("downloading");
      setMessage(source === "auto" ? "Preparing your HD file..." : null);

      try {
        if (typeof document !== "undefined" && document.fonts) {
          await document.fonts.ready;
        }

        const { shape, ratio } = await resolveShapeAndRatio(activeRecipe);
        const width = 6000;
        const height = Math.max(1, Math.round(width / ratio));
        const canvas = document.createElement("canvas");

        await renderStarMap({
          recipe: { ...activeRecipe, shape },
          canvas,
          width,
          height,
          watermark: false,
          quality: "export",
          premium: true,
        });

        const url = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = "star-map-hd.png";
        link.href = url;
        link.click();

        try {
          localStorage.removeItem(AUTO_EXPORT_KEY);
        } catch {
          // ignore storage errors
        }

        setStatus("ready");
        setMessage("Download started. Check your downloads folder.");
        track("export_download", { type: "hd", source });
      } catch (err) {
        console.error("Download failed", err);
        setStatus("error");
        setMessage("We couldn't start the download. Please try again.");
      }
    },
    [recipe, resolveShapeAndRatio],
  );

  const renderPreview = useCallback(
    async (activeRecipe: MapRecipe) => {
      if (!paidRef.current) return;
      if (previewStatus === "rendering") return;
      setPreviewStatus("rendering");

      try {
        if (typeof document !== "undefined" && document.fonts) {
          await document.fonts.ready;
        }

        const { shape, ratio } = await resolveShapeAndRatio(activeRecipe);
        setPreviewAspect(`${ratio} / 1`);
        const width = 1200;
        const height = Math.max(1, Math.round(width / ratio));
        const canvas = document.createElement("canvas");

        await renderStarMap({
          recipe: { ...activeRecipe, shape },
          canvas,
          width,
          height,
          watermark: false,
          quality: "preview",
          premium: true,
        });

        const url = canvas.toDataURL("image/png");
        setPreviewUrl(url);
        setPreviewStatus("ready");
      } catch {
        setPreviewStatus("error");
      }
    },
    [previewStatus, resolveShapeAndRatio],
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      setStatus("checking");
      setMessage("Verifying payment...");
      const paidOk = await refreshPaidStatus();
      if (!active) return;
      if (!paidOk) {
        setStatus("not-paid");
        setMessage("Payment verification is still pending. Please refresh in a moment.");
        return;
      }

      const draft = readDraft();
      if (!draft) {
        setStatus("no-draft");
        setMessage("We couldn't find your saved map. Open the editor to rebuild it, then download.");
        return;
      }

      setRecipe(draft);
      setStatus("ready");
      setMessage("Your HD file is ready.");
      void updatePreviewAspect(draft);

      if (!autoTriggeredRef.current) {
        autoTriggeredRef.current = true;
        void startDownload(draft, "auto");
      }
    };

    void init();
    return () => {
      active = false;
    };
  }, [refreshPaidStatus, startDownload, updatePreviewAspect]);

  useEffect(() => {
    if (!recipe || !paid) return;
    if (previewUrl || previewStatus !== "idle") return;
    const timer = window.setTimeout(() => {
      void renderPreview(recipe);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [paid, previewStatus, previewUrl, recipe, renderPreview]);

  const statusLabel = (() => {
    switch (status) {
      case "checking":
        return "Verifying payment";
      case "downloading":
        return "Preparing download";
      case "no-draft":
        return "Map not found";
      case "not-paid":
        return "Not verified";
      case "error":
        return "Download issue";
      default:
        return "Download ready";
    }
  })();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b1433] via-[#0b1a30] to-[#0b1433] px-4 py-8 text-amber-50 sm:px-6 sm:py-12 lg:px-10 lg:py-14">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:gap-10">
        <section className="relative overflow-hidden rounded-3xl border border-amber-200/30 bg-white/10 px-6 py-8 shadow-2xl backdrop-blur sm:px-8 sm:py-10 md:px-12">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-8 -top-16 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl" />
            <div className="absolute -bottom-16 right-0 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="absolute right-20 top-10 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-100 shadow-sm">
              StarMapCo
            </div>

            <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <h1 className="text-2xl font-semibold text-white sm:text-3xl md:text-4xl font-[var(--font-playfair)]">
                  Your download is ready
                </h1>
                <p className="max-w-2xl text-sm text-amber-100/90 sm:text-base">
                  We verified your payment. Download the HD print file now, or jump back into the editor to tweak details.
                </p>
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                    status === "ready"
                      ? "border-emerald-300/60 bg-emerald-500/20 text-emerald-100"
                      : status === "downloading"
                        ? "border-amber-300/60 bg-amber-400/20 text-amber-100"
                        : "border-white/20 bg-white/10 text-amber-100"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {statusLabel}
                </div>
                {message && <p className="text-xs text-amber-100/80">{message}</p>}
              </div>

              <div className="grid w-full gap-3 md:max-w-[260px]">
                <button
                  type="button"
                  onClick={() => void startDownload(undefined, "manual")}
                  disabled={status === "downloading" || !paid}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2.5 text-sm font-semibold text-[#201a0c] shadow-lg transition disabled:cursor-not-allowed disabled:opacity-70 hover:-translate-y-[1px] hover:shadow-[0_12px_35px_rgba(215,181,108,0.45)] focus:outline-none focus:ring-2 focus:ring-[#d7b56c]/70 focus:ring-offset-2"
                >
                  Download HD file
                </button>
                <Link
                  href="/editor"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2"
                >
                  Keep editing
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80 transition hover:text-amber-100"
                >
                  Back to homepage
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Your map preview</h2>
              <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                HD ready
              </span>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f24]/90">
              <div className="relative w-full" style={{ aspectRatio: previewAspect }}>
                {previewUrl ? (
                  <img src={previewUrl} alt="Star map preview" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-xs text-neutral-300">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
                      <span>
                        {previewStatus === "error"
                          ? "Preview unavailable"
                          : "Rendering your preview..."}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-4 text-xs text-neutral-200">
              This preview matches your final print file. Adjust details in the editor before downloading.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-1">
            {[
              {
                title: "Print-ready quality",
                desc: "6000×6000px PNG sized for crisp framing and posters.",
              },
              {
                title: "No watermark",
                desc: "Your premium file is clean, high-resolution, and ready to gift.",
              },
              {
                title: "Re-download anytime",
                desc: "Come back to this page or the editor to download again.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-100 shadow-sm shadow-black/20"
              >
                <h3 className="text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-xs text-neutral-200">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
