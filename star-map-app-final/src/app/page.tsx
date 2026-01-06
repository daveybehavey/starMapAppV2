"use client";

export const dynamic = "force-dynamic";

import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import { StyleId, TextBox, useStore, RenderOptions } from "@/lib/store";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap } from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";
import type { Shape } from "@/lib/types";
import { track } from "@/lib/analytics";
import { blogPosts } from "@/lib/blogPosts";
import { occasionPresets } from "@/lib/occasionPresets";
import { renderModes, type RenderModeId } from "@/lib/renderModes";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

const styles: { id: StyleId; name: string; note: string }[] = [
  { id: "navyGold", name: "Navy & Gold", note: "Luxe midnight with gilded accents" },
  { id: "vintageEngraving", name: "Vintage Engraving", note: "Linework etched on deep charcoal" },
  { id: "parchmentScroll", name: "Parchment Scroll", note: "Warm cream with antique border" },
  { id: "midnightMinimal", name: "Midnight Minimal", note: "Clean noir with subtle glow" },
];

const DRAFT_KEY = "star-map-draft";
const AUTO_EXPORT_KEY = "star-map-auto-export";
const REVEALED_FLAG = "star-map-last-revealed";

const fontOptions: Array<{ id: TextBox["fontFamily"]; label: string }> = [
  { id: "playfair", label: "Playfair Display" },
  { id: "cinzel", label: "Cinzel" },
  { id: "script", label: "Great Vibes" },
  { id: "cormorant", label: "Cormorant Garamond" },
  { id: "montserrat", label: "Montserrat" },
];

const visualModes: Array<{ id: RenderOptions["visualMode"]; label: string; description: string }> = [
  { id: "astronomical", label: "Astronomical", description: "Pure star field, minimal embellishment" },
  { id: "enhanced", label: "Enhanced", description: "Balanced glow and detail (default)" },
  { id: "illustrated", label: "Illustrated", description: "Artistic finish with richer accents" },
];

const shapes: Array<{ id: Shape; label: string }> = [
  { id: "rectangle", label: "Rectangle" },
  { id: "heart", label: "Heart" },
  { id: "circle", label: "Circle" },
  { id: "star", label: "Star" },
];

const shapeSymbols: Record<Shape, string> = {
  rectangle: "▯",
  heart: "♥",
  circle: "◯",
  star: "★",
};

const shapeSymbolScale: Record<Shape, string> = {
  rectangle: "scale(1.05)",
  heart: "scale(1.3)",
  circle: "scale(1.15)",
  star: "scale(1.05)",
};

const constellationPresets: Array<{ id: RenderOptions["constellationLines"]; label: string; note: string }> = [
  { id: "off", label: "Off", note: "No lines visible" },
  { id: "thin", label: "Thin", note: "Subtle guides (default)" },
  { id: "thick", label: "Bold", note: "Stronger, etched lines" },
];

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const {
    dateTime,
    textBoxes,
    selectedStyle,
    aspectRatio,
    shape,
    renderOptions,
    paid,
    revealed,
    location,
    setLocation,
    setDateTime,
    updateTextBox,
    removeTextBox,
    addTextBox,
    setStyle,
    setAspectRatio,
    setShape,
    setRenderOptions,
    setPaid,
    setRevealed,
    setTextBoxes,
  } = useStore(
    useShallow((state) => ({
      dateTime: state.dateTime,
      textBoxes: state.textBoxes,
      selectedStyle: state.selectedStyle,
      aspectRatio: state.aspectRatio,
      shape: state.shape,
      renderOptions: state.renderOptions,
      paid: state.paid,
      revealed: state.revealed,
      location: state.location,
      setLocation: state.setLocation,
      setDateTime: state.setDateTime,
      updateTextBox: state.updateTextBox,
      removeTextBox: state.removeTextBox,
      addTextBox: state.addTextBox,
      setStyle: state.setStyle,
      setAspectRatio: state.setAspectRatio,
      setShape: state.setShape,
      setRenderOptions: state.setRenderOptions,
      setPaid: state.setPaid,
      setRevealed: state.setRevealed,
      setTextBoxes: state.setTextBoxes,
    })),
  );

  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() => {
    const entries = textBoxes.map((box, idx) => [box.id, idx === 0 ? false : true]);
    return { __all__: false, ...Object.fromEntries(entries) };
  });
  const [restored, setRestored] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [pendingExport, setPendingExport] = useState<"preview" | "hd" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [autoExportPending, setAutoExportPending] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [heroPreviewSrc, setHeroPreviewSrc] = useState("/custom-star-map-anniversary.webp");
  const [demoApplied, setDemoApplied] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [renderMode, setRenderMode] = useState<RenderModeId>("classic");
  const [intensity, setIntensity] = useState(50); // applied intensity
  const [intensityDraft, setIntensityDraft] = useState(50); // live slider value
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPresetTransition, setShowPresetTransition] = useState(false);
  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  const canReveal = Boolean(locationName);
  const previewRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [presetApplied, setPresetApplied] = useState(false);
  const handleEditScroll = useCallback(() => {
    inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const scrollToPreview = useCallback(() => {
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    fetch("/api/og/sample")
      .then((res) => {
        if (!res.ok) throw new Error("OG fetch failed");
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setHeroPreviewSrc(objectUrl);
      })
      .catch(() => {
        setHeroPreviewSrc("/custom-star-map-anniversary.webp");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!demoApplied && !presetApplied) {
      const demoKey = searchParams.get("demo");
      const preset =
        occasionPresets.find((p) => p.id === (demoKey as any)) || occasionPresets.find((p) => p.id === "wedding");
      if (preset) {
        setDateTime(preset.dateTimeISO);
        setLocation({
          name: preset.location?.name ?? "",
          latitude: preset.location?.latitude ?? 0,
          longitude: preset.location?.longitude ?? 0,
          timezone: preset.location?.timezone ?? "UTC",
        });
        if (preset.textBoxes) setTextBoxes(preset.textBoxes);
        if (preset.style) setStyle(preset.style as StyleId);
        if (preset.shape) setShape(preset.shape as Shape);
        setRenderMode(preset.renderMode);
        const level = Math.round(preset.intensity * 100);
        setIntensity(level);
        setRevealed(true);
        setPaid(false);
        setDemoApplied(Boolean(demoKey));
        setPresetApplied(true);
      }
    }
    const token = localStorage.getItem("star-map-unlock");
    if (token) {
      setPaid(true);
    }
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as ReturnType<typeof buildRecipeFromState>;
        if (parsed.datetimeISO) setDateTime(parsed.datetimeISO);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.textBoxes?.length) setTextBoxes(parsed.textBoxes);
        if (parsed.selectedStyle) setStyle(parsed.selectedStyle);
        if (parsed.aspectRatio) setAspectRatio(parsed.aspectRatio as any);
        if ((parsed as any).shape) {
          setShape((parsed as any).shape);
        } else if ((parsed.renderOptions as any)?.shapeMask) {
          setShape((parsed.renderOptions as any).shapeMask);
        }
        if (parsed.renderOptions) setRenderOptions(parsed.renderOptions);
        if (parsed.location?.name) {
          setRevealed(true);
        } else {
          setRevealed(false);
        }
        setRestored(true);
      } catch {
        // ignore bad drafts
      }
    }
    const revealedFlag = localStorage.getItem(REVEALED_FLAG);
    if (revealedFlag === "true") {
      setRevealed(true);
    }
    const autoFlag = localStorage.getItem(AUTO_EXPORT_KEY);
    if (autoFlag === "hd") {
      setAutoExportPending(true);
    }
  }, [
    setPaid,
    setDateTime,
    setLocation,
    setRenderOptions,
    setRevealed,
    setStyle,
    setTextBoxes,
    setAspectRatio,
    setShape,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !restored) return;
    const recipe = buildRecipeFromState({
      dateTime,
      location,
      textBoxes,
      selectedStyle,
      aspectRatio,
      shape,
      renderOptions,
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(recipe));
  }, [aspectRatio, dateTime, location, renderOptions, restored, selectedStyle, shape, textBoxes]);

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
    track("reveal_map", { visualMode: renderOptions.visualMode, isPaid: paid });
    if (typeof window !== "undefined") {
      localStorage.setItem(REVEALED_FLAG, "true");
    }
    requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [canReveal, hasDate, setRevealed]);

  const applyVisualOptions = useCallback(
    (mode: RenderModeId, level: number) => {
      const cfg = renderModes[mode];
      const normalized = Math.min(Math.max(level / 100, 0), 1);
      const starIntensity: RenderOptions["starIntensity"] =
        normalized < 0.3 ? "subtle" : normalized < 0.7 ? "normal" : "bold";
      const starGlow = cfg.glow + normalized * 0.2 > 0.3;
      const visualMode: RenderOptions["visualMode"] =
        mode === "blueprint" ? "astronomical" : mode === "cinematic" ? "illustrated" : "enhanced";
      const colorTheme: RenderOptions["colorTheme"] =
        mode === "blueprint" ? "vintage" : mode === "cinematic" ? "midnight" : "night";
      const constellationLines: RenderOptions["constellationLines"] =
        mode === "blueprint" ? "thick" : "thin";
      const planetEmphasis: RenderOptions["planetEmphasis"] = cfg.contrast > 1.15 ? "highlighted" : "normal";

      setRenderOptions({
        starIntensity,
        starGlow,
        visualMode,
        colorTheme,
        constellationLines,
        planetEmphasis,
      });
    },
    [setRenderOptions],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setIsUpdating(true);
      setCanvasReady(false);
      applyVisualOptions(renderMode, intensity);
    }, 80);
    return () => clearTimeout(t);
  }, [applyVisualOptions, intensity, renderMode]);

  useEffect(() => {
    let next = intensityDraft;
    if (!paid && next > 60) {
      next = 60;
    }
    if (next === intensity) return;
    const t = setTimeout(() => setIntensity(next), 80);
    return () => clearTimeout(t);
  }, [intensityDraft, paid, intensity]);

  const applyPreset = useCallback(
    (id: string) => {
      const preset = occasionPresets.find((p) => p.id === id);
      if (!preset) return;
      setDateTime(preset.dateTimeISO);
      setLocation({
        name: preset.location?.name ?? "",
        latitude: preset.location?.latitude ?? 0,
        longitude: preset.location?.longitude ?? 0,
        timezone: preset.location?.timezone ?? "UTC",
      });
      setTextBoxes(preset.textBoxes);
      setStyle(preset.style as StyleId);
      setShape(preset.shape as Shape);
      setRenderMode(preset.renderMode);
      const level = Math.round(preset.intensity * 100);
      setIntensity(level);
      setIntensityDraft(level);
      applyVisualOptions(preset.renderMode, level);
      setRevealed(true);
      setPaid(false);
      setPresetApplied(true);
      setDemoApplied(false);
      setShowPresetTransition(true);
      setIsUpdating(true);
      setCanvasReady(false);
      handleEditScroll();
      setTimeout(() => setShowPresetTransition(false), 240);
    },
    [
      applyVisualOptions,
      handleEditScroll,
      setDateTime,
      setLocation,
      setPaid,
      setRenderMode,
      setRevealed,
      setShape,
      setStyle,
      setTextBoxes,
    ],
  );

  const exportImage = useCallback(
    async (mode: "preview" | "hd") => {
      const recipe = buildRecipeFromState({
        dateTime,
        location,
        textBoxes,
        selectedStyle,
        aspectRatio,
        shape,
        renderOptions,
      });
      const width = mode === "hd" ? 6000 : 1200;
      const shapeData = await getShapeData(recipe.shape).catch(() => null);
      const ratio = shapeData
        ? shapeData.viewBox.width / shapeData.viewBox.height
        : aspectRatioToNumber(recipe.aspectRatio);
      const height = Math.max(1, Math.round(width / ratio));
      const canvas = document.createElement("canvas");
      const watermark = mode !== "hd";
      await renderStarMap({
        recipe,
        canvas,
        width,
        height,
        watermark,
        quality: mode === "hd" ? "export" : "preview",
      });
      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = mode === "hd" ? "star-map-hd.png" : "star-map-preview.png";
      link.href = url;
      link.click();
    },
    [aspectRatio, dateTime, location, renderOptions, selectedStyle, shape, textBoxes],
  );

  useEffect(() => {
    if (!restored || !autoExportPending || !paid) return;
    setRevealed(true);
  }, [autoExportPending, paid, restored, setRevealed]);

  useEffect(() => {
    if (!autoExportPending || !canvasReady) return;
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoExportPending, canvasReady]);

  useEffect(() => {
    if (!autoExportPending || !canvasReady || !paid) return;
    const id = requestAnimationFrame(() => {
      exportImage("hd")
        .catch(() => {})
        .finally(() => {
          localStorage.removeItem(AUTO_EXPORT_KEY);
          setAutoExportPending(false);
        });
    });
    return () => cancelAnimationFrame(id);
  }, [autoExportPending, canvasReady, exportImage, paid]);

  const handleExport = useCallback(
    (mode: "preview" | "hd") => {
      if (mode === "hd" && !paid) {
        setPendingExport(mode);
        setPaywallOpen(true);
        setCheckoutError(null);
        track("paywall_view", { visualMode: renderOptions.visualMode });
        track("paywall_opened", { visualMode: renderOptions.visualMode });
        if (typeof window !== "undefined") {
          localStorage.setItem(AUTO_EXPORT_KEY, mode);
          if (revealed) localStorage.setItem(REVEALED_FLAG, "true");
        }
        return;
      }
      track(mode === "hd" ? "export_hd_clicked" : "export_free_clicked", {
        isPaid: paid,
        visualMode: renderOptions.visualMode,
        exportResolution: mode === "hd" ? 6000 : 1200,
      });
      track("export_download", { type: mode === "hd" ? "hd" : "preview" });
      exportImage(mode).catch(() => {});
    },
    [exportImage, paid, renderOptions.visualMode, revealed],
  );

  const startCheckout = useCallback(async () => {
    try {
      setCheckoutError(null);
      track("checkout_started", { visualMode: renderOptions.visualMode });
      const res = await fetch("/api/checkout", { method: "POST" });
      if (!res.ok) throw new Error("checkout failed");
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("no url");
    } catch (err) {
      console.error(err);
      setCheckoutError("Checkout is unavailable right now. Please try again shortly.");
      track("checkout_failed", { reason: (err as Error)?.message ?? "unknown" });
    }
  }, [renderOptions.visualMode]);

  const handleShare = useCallback(async () => {
    const recipe = buildRecipeFromState({
      dateTime,
      location,
      textBoxes,
      selectedStyle,
      aspectRatio,
      shape,
      renderOptions,
    });
    const res = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recipe),
    });
    if (!res.ok) return;
    const { id } = (await res.json()) as { id: string };
    const url = `${window.location.origin}/m/${id}`;
    setShareLink(url);
    track("share_link_clicked", { isPaid: paid, visualMode: renderOptions.visualMode });
    track("share", { platform: "link" });
    if (navigator.share) {
      await navigator.share({ url, title: "My Star Map", text: "See this night sky moment" }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [aspectRatio, dateTime, location, paid, renderOptions, selectedStyle, shape, textBoxes]);

  const handleShareImage = useCallback(async () => {
    const recipe = buildRecipeFromState({
      dateTime,
      location,
      textBoxes,
      selectedStyle,
      aspectRatio,
      shape,
      renderOptions,
    });
    const width = 1200;
    const shapeData = await getShapeData(recipe.shape).catch(() => null);
    const ratio = shapeData
      ? shapeData.viewBox.width / shapeData.viewBox.height
      : aspectRatioToNumber(recipe.aspectRatio);
    const height = Math.max(1, Math.round(width / ratio));
    const canvas = document.createElement("canvas");
    await renderStarMap({
      recipe,
      canvas,
      width,
      height,
      watermark: true,
      quality: "preview",
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    track("share_image_clicked", { isPaid: paid, visualMode: renderOptions.visualMode });
    track("share", { platform: "image" });

    const file = new File([blob], "star-map-share.png", { type: "image/png" });
    const shareData: ShareData = { files: [file], title: "My Star Map", text: "See this night sky moment" };

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // fallback below
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "star-map-share.png";
    link.click();
    URL.revokeObjectURL(url);
  }, [aspectRatio, dateTime, location, paid, renderOptions, selectedStyle, shape, textBoxes]);

  return (
    <main className="flex flex-col items-center px-4 py-4 md:py-8 lg:py-0">
      <section className="mx-auto w-full max-w-7xl py-12 sm:py-14 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_minmax(340px,1fr)]">
              <div className="space-y-5">
                <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-[42px]">
                  See the exact night sky from your most meaningful moment.
                </h1>
                <p className="max-w-2xl text-base text-neutral-200 sm:text-lg">
                  Accurate, instant star maps for weddings, births, anniversaries, and memorials — customized in seconds.
                </p>
                <p className="text-sm text-neutral-300">Designed to be framed, gifted, and kept forever.</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:ring-offset-2 sm:w-auto"
                  >
                    Start with a preset
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/?demo=default")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-300/70 bg-white/10 px-5 py-3 text-sm font-semibold text-amber-200 shadow-md transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:ring-offset-2 sm:w-auto"
                  >
                    Try a demo
                  </button>
                </div>
            <div className="flex flex-wrap gap-3 text-xs text-neutral-200 sm:text-sm">
              {["Instant preview", "Ready to frame exports", "One-time unlock"].map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 shadow-sm shadow-black/20"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_25px_60px_rgba(0,0,0,0.35)]">
              <div className="relative aspect-[1/1] bg-gradient-to-b from-[#0b0f24] via-[#0a0d1c] to-[#05070f]">
                <Image
                    src="/custom-star-map-anniversary.webp"
                    alt="Example star map output"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl py-12 sm:py-14 lg:py-16">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">What your map could look like</p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">See finished examples before you start</h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              Real outputs from our presets and render modes—so you know exactly what you can create in seconds.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                imageSrc: "/examples/example-birth-classic.webp",
                occasion: "Wedding",
                renderMode: "Cinematic",
                caption: "Santorini · June 1, 2024",
                badge: "CINEMATIC",
              },
              {
                imageSrc: "/examples/example-birthday-luxe.webp",
                occasion: "Wedding (Heart)",
                renderMode: "Cinematic",
                caption: "Santorini · June 1, 2024",
                badge: "CINEMATIC",
              },
              {
                imageSrc: "/examples/example-wedding-cinematic.webp",
                occasion: "Birthday",
                renderMode: "Luxe",
                caption: "Tokyo, Japan · July 9, 1995",
                badge: "LUXE",
              },
              {
                imageSrc: "/examples/example-wedding-cinematic-heart.webp",
                occasion: "Birth",
                renderMode: "Classic",
                caption: "Toronto, Canada · February 18, 2023",
                badge: "CLASSIC",
              },
              {
                imageSrc: "/examples/example-memorial-blueprint.webp",
                occasion: "Memorial",
                renderMode: "Blueprint",
                caption: "London, UK · November 2, 2018",
                badge: "BLUEPRINT",
              },
              {
                imageSrc: "/examples/example-graduation-classic.webp",
                occasion: "Graduation",
                renderMode: "Classic",
                caption: "Boston · May 25, 2024",
                badge: "CLASSIC",
              },
            ].map((item, idx) => (
              <div
                key={`${item.imageSrc}-${idx}`}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/30"
              >
                <div className="relative aspect-[4/5]">
                  <Image
                    src={item.imageSrc}
                    alt={`${item.occasion} · ${item.renderMode}`}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    loading="lazy"
                  />
                </div>
                <div className="border-t border-white/10 px-4 py-3 text-white">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{item.occasion} · {item.renderMode}</span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-200">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-200">
                    {item.caption}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-200 sm:text-base">
            A wedding night in Santorini. A birthday in Tokyo. A quiet memorial in London. Every sky is different — just like the moment it represents.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl py-12 sm:py-14 lg:py-16">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">How it works</p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">From date to finished star map</h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              Pick a meaningful moment, see the night sky instantly, personalize, and export a print-ready map in minutes.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Choose your moment",
                desc: "Select a preset or set the exact date, time, and location.",
              },
              {
                title: "Preview instantly",
                desc: "Accurate astronomy data renders the sky as it truly appeared.",
              },
              {
                title: "Unlock & export",
                desc: "Download a high-resolution, print-ready file with one-time unlock.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm shadow-black/20"
              >
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-neutral-200">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl py-12 sm:py-14 lg:py-16">
        <div className="cosmic-panel rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:px-10">
          <div className="space-y-6 text-neutral-800">
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold text-midnight sm:text-4xl">What Is a Custom Star Map?</h2>
              <p className="text-base leading-relaxed text-neutral-800 sm:text-lg">
                A custom star map shows the exact night sky from a specific date, time, and location. We turn that real sky into a print-ready design you can gift or frame. Every map is unique to the moment it represents.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">How StarMapCo Works</h2>
              <ol className="list-decimal space-y-2 pl-5 text-base leading-relaxed text-neutral-800 sm:text-lg">
                <li>Choose the date and location that matter most.</li>
                <li>Preview the sky instantly with accurate star positions.</li>
                <li>Personalize style, shape, and text.</li>
                <li>Unlock and export a high-res, print-ready file.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section ref={editorRef} id="editor" className="mx-auto w-full max-w-7xl lg:max-w-none py-12 sm:py-14 lg:py-12">
        <div className="space-y-6 lg:h-full">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">Create your star map</p>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">Design your sky in seconds</h2>
              <p className="text-base text-neutral-200 sm:text-lg">
                Start from a preset, fine-tune the details, and see a finished map before you unlock.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-100 shadow-sm shadow-black/30">
              <p className="font-semibold text-white">Matches professional planetarium accuracy (Yale catalogs + skyfield).</p>
              <Link href="#accuracy" className="mt-2 inline-flex text-sm font-semibold text-amber-300 hover:underline">
                Learn how accuracy works →
              </Link>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr_3fr] lg:items-start lg:gap-8">
            <section
              ref={previewRef}
              id="preview"
              className="col-span-6 flex flex-col gap-3 rounded-3xl border border-white/10 bg-[#0b0f24]/90 p-4 shadow-2xl shadow-black/30 backdrop-blur lg:col-span-1 lg:sticky lg:top-6 lg:h-[calc(100vh-72px)] lg:max-h-[calc(100vh-72px)] lg:w-full lg:self-start"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-white sm:text-3xl">StarMapCo Night Sky</h3>
                  <p className="text-xs text-neutral-300 sm:text-sm">
                    {revealed
                      ? "Your sky is revealed. Tap edit to refine."
                      : "Hidden until you reveal. Perfect your inputs first."}
                  </p>
                </div>
                <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm text-center">
                  {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
                </div>
              </div>
              <div
                className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/40 p-2 shadow-inner shadow-black/30"
                style={
                  revealed
                    ? undefined
                    : {
                        backgroundColor: "#0b0f3b",
                        backgroundImage:
                          "url('/ribbon-overlay.png'), radial-gradient(circle at 50% 65%, rgba(28, 34, 94, 0.55), rgba(7, 9, 26, 0.98))",
                        backgroundRepeat: "no-repeat, no-repeat",
                        backgroundSize: "100% auto, cover",
                        backgroundPosition: "center 26px, center",
                      }
                }
              >
                <div
                  className={`relative flex flex-col rounded-xl ${
                    revealed ? "" : "bg-transparent"
                  } transition-opacity duration-200 ${isUpdating ? "opacity-80" : "opacity-100"}`}
                  style={{ minHeight: revealed ? "auto" : "50vh" }}
                >
                  {!revealed && (
                    <div className="absolute inset-0 flex flex-col items-center justify-end gap-4 pb-10 text-center text-sm text-amber-50">
                      <div className="pointer-events-none absolute inset-0 opacity-35">
                        <div className="absolute inset-10 rounded-full bg-gradient-to-br from-amber-500/10 via-amber-200/5 to-transparent blur-3xl" />
                      </div>
                      <div className="relative z-10 flex flex-col items-center gap-2 px-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                          Live preview waiting
                        </div>
                        <p className="text-base font-semibold text-amber-50">Your sky is wrapped and waiting.</p>
                        <p className="text-xs text-amber-200/80">
                          Enter a place and date to unveil the exact night sky for your moment.
                        </p>
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
                      <PreviewCanvas
                        onRendered={() => {
                          setCanvasReady(true);
                          setIsUpdating(false);
                        }}
                      />
                      {(isUpdating || !canvasReady) && (
                        <div className="absolute inset-0 z-10 rounded-xl bg-gradient-to-b from-white/5 to-white/0 transition-opacity duration-300">
                          <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur">
                            Rendering…
                          </div>
                          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.06)_25%,rgba(255,255,255,0)_50%)] bg-[length:200%_100%]" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                        {isUpdating ? "Rendering…" : "Updated ✓"}
                      </div>
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5" />
                      <div className="mt-4 flex flex-wrap items-center justify-start gap-2 sm:justify-start">
                        <button
                          type="button"
                          onClick={() => handleExport("preview")}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                        >
                          Free ⬇️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExport("hd")}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                          title="Unlock to export HD without watermark; preview stays free."
                        >
                          {!paid && "🔒 "}HD ⬇️
                        </button>
                        <button
                          type="button"
                          onClick={handleShareImage}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                        >
                          🔗 Share
                        </button>
                        <button
                          type="button"
                          onClick={handleShare}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                        >
                          💾 Save & Remix
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsFullscreen(true)}
                        className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg text-white shadow-md backdrop-blur transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                        aria-label="Open fullscreen"
                      >
                        ⤢
                      </button>
                      <button
                        type="button"
                        onClick={handleEditScroll}
                        className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                      >
                        ← Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            <div
              ref={inputsRef}
              className="col-span-6 w-full lg:col-span-1 lg:h-[calc(100vh-72px)] lg:overflow-hidden"
            >
              <div className="flex h-full flex-col gap-4 lg:pr-2">
                <div className="rounded-3xl border border-white/10 bg-[rgba(10,14,30,0.82)] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.25)] backdrop-blur-sm ring-1 ring-white/5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">Occasion presets</p>
                      <p className="text-sm text-neutral-200">Tap to instantly apply a finished look.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {occasionPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset.id)}
                          className="w-full rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow sm:w-auto"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "classic", label: "Classic", premium: false },
                        { id: "cinematic", label: "Cinematic", premium: true },
                        { id: "blueprint", label: "Blueprint", premium: false },
                        { id: "luxe", label: "Luxe", premium: true },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            if (!paid && mode.premium) setPaywallOpen(true);
                            const targetLevel =
                              mode.id === "cinematic"
                                ? Math.max(intensityDraft, 60)
                                : mode.id === "luxe"
                                  ? Math.max(intensityDraft, 55)
                                  : intensityDraft;
                            setRenderMode(mode.id as RenderModeId);
                            setIntensity(targetLevel);
                            setIntensityDraft(targetLevel);
                          }}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-[1px] hover:shadow ${
                            renderMode === mode.id ? "border-amber-400 bg-amber-200 text-midnight" : "border-white/20 bg-white/10 text-white"
                          }`}
                          title={
                            mode.premium && !paid
                              ? "Unlock to export in Cinematic/Luxe. Preview stays free."
                              : mode.label
                          }
                        >
                          {mode.premium && "🔒"} {mode.label}
                        </button>
                      ))}
                    </div>
                    <div className="min-w-[260px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 shadow-inner shadow-black/30">
                      <label className="flex items-center justify-between text-sm font-semibold text-white">
                        <span>Visual Intensity</span>
                        <span className="text-xs text-neutral-300">Clean → Cinematic</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={intensityDraft}
                        onChange={(e) => {
                          let next = Number(e.target.value);
                          if (!paid && next > 60) {
                            next = 60;
                            setPaywallOpen(true);
                          }
                          setIntensityDraft(next);
                        }}
                        className="mt-2 w-full accent-amber-400"
                      />
                      {!paid && (
                        <p className="mt-1 text-xs text-neutral-300">
                          Cinematic/Luxe and higher intensity require unlock for export. Preview stays free to explore; only downloads are gated.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-100 shadow-inner shadow-black/30">
                    Real-time generation: change date/location and watch the sky update instantly with accurate stars.
                  </div>
                </div>

                <div className="flex h-full flex-col gap-4 lg:overflow-hidden">
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm shadow-black/30">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">Start here</p>
                        <h3 className="text-xl font-semibold text-white">Date, place, and basics</h3>
                        <p className="text-sm text-neutral-200">Tell us when and where—plus your main title lines.</p>
                      </div>
                      <div className="mt-3 space-y-3">
                        <DateTimeControls dateTime={dateTime} onChange={setDateTime} />
                        <LocationSearch />
                        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">Title & subtitle</p>
                            <span className="text-[11px] uppercase tracking-wide text-neutral-400">Fits above the fold</span>
                          </div>
                          {textBoxes.slice(0, 2).map((box) => (
                            <div key={box.id} className="space-y-1.5">
                              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-300">{box.label}</label>
                              <input
                                type="text"
                                value={box.text}
                                onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                                className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/5 shadow-sm shadow-black/30">
                      <button
                        type="button"
                        onClick={() => setCollapsedCards((prev) => ({ ...prev, __all__: !prev.__all__ }))}
                        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-white"
                      >
                        Custom text & fonts (advanced)
                        <span>{collapsedCards.__all__ ? "▾" : "▴"}</span>
                      </button>
                      {!collapsedCards.__all__ && (
                        <div className="divide-y divide-white/10">
                          {textBoxes.map((box) => (
                            <div key={box.id} className="space-y-2 p-3 sm:p-4">
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleCard(box.id)}
                                    className="h-7 w-7 rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow"
                                    aria-pressed={!!collapsedCards[box.id]}
                                    aria-label={`Toggle ${box.label}`}
                                  >
                                    {collapsedCards[box.id] ? "▾" : "▴"}
                                  </button>
                                  <span className="font-medium text-white">{box.label}</span>
                                </div>
                                <div className="ml-auto flex items-center justify-end gap-2">
                                  <select
                                    value={box.fontFamily}
                                    onChange={(e) =>
                                      paid && updateTextBox(box.id, { fontFamily: e.target.value as TextBox["fontFamily"] })
                                    }
                                    disabled={!paid}
                                    className={`w-20 truncate rounded-md border px-2 py-2 text-sm shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40 sm:w-24 ${
                                      paid
                                        ? "border-white/20 bg-white/10 text-white"
                                        : "cursor-not-allowed border-white/10 bg-white/5 text-neutral-400"
                                    }`}
                                  >
                                    {fontOptions.map((opt) => (
                                      <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
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
                                    className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                                  />
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="color"
                                      aria-label={`${box.label} color`}
                                      value={box.color}
                                      onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                                      className="h-10 w-14 cursor-pointer rounded-md border border-white/15 bg-white/10"
                                    />
                                    <input
                                      type="number"
                                      min={10}
                                      max={48}
                                      value={box.size}
                                      onChange={(e) =>
                                        updateTextBox(box.id, { size: Number.parseInt(e.target.value, 10) || box.size })
                                      }
                                      className="w-24 rounded-md border border-white/15 bg-white/10 px-2 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                                    />
                                    <select
                                      value={box.align}
                                      onChange={(e) => updateTextBox(box.id, { align: e.target.value as TextBox["align"] })}
                                      className="flex-1 rounded-md border border-white/15 bg-white/10 px-2 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                                    >
                                      <option value="left">Left</option>
                                      <option value="center">Center</option>
                                      <option value="right">Right</option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => paid && updateTextBox(box.id, { textShadow: !box.textShadow })}
                                      disabled={!paid}
                                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-inner shadow-black/20 transition ${
                                        paid
                                          ? box.textShadow
                                            ? "border-amber-300 bg-amber-100/80 text-midnight shadow-amber-200/60 hover:-translate-y-[1px] hover:shadow-md"
                                            : "border-white/15 bg-white/10 text-white hover:-translate-y-[1px] hover:shadow"
                                          : "cursor-not-allowed border-white/10 bg-white/5 text-neutral-400"
                                      }`}
                                      aria-pressed={!!box.textShadow}
                                      aria-label={`Toggle text shadow for ${box.label}`}
                                    >
                                      Shadow
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => paid && updateTextBox(box.id, { textGlow: !box.textGlow })}
                                      disabled={!paid}
                                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-inner shadow-black/20 transition ${
                                        paid
                                          ? box.textGlow
                                            ? "border-amber-300 bg-amber-50 text-midnight shadow-amber-200/80 hover:-translate-y-[1px] hover:shadow-md"
                                            : "border-white/15 bg-white/10 text-white hover:-translate-y-[1px] hover:shadow"
                                          : "cursor-not-allowed border-white/10 bg-white/5 text-neutral-400"
                                      }`}
                                      aria-pressed={!!box.textGlow}
                                      aria-label={`Toggle text glow for ${box.label}`}
                                    >
                                      Glow
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCollapsedCards((prev) => ({ ...prev, __all__: false }));
                          addTextBox();
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-b-xl border-t border-dashed border-white/20 bg-white/5 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow"
                      >
                        <span className="text-lg">＋</span>
                        Add text line
                      </button>
                    </section>

                    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Style</p>
                        <h3 className="text-xl font-semibold text-white">Finish & framing</h3>
                        <p className="text-sm text-neutral-200">Choose the look, shape, and constellation detail.</p>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white">Style presets</label>
                            <span className="text-xs uppercase tracking-wide text-neutral-300">4 of 10 presets</span>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {styles.map((style) => (
                              <button
                                key={style.id}
                                type="button"
                                onClick={() => setStyle(style.id)}
                                className={`flex h-full flex-col justify-center rounded-xl border px-4 py-3 text-left text-sm shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${
                                  selectedStyle === style.id
                                    ? "border-amber-300 bg-amber-50/80 text-midnight"
                                    : "border-white/15 bg-white/10 text-white"
                                }`}
                              >
                                <div className="text-sm font-semibold">{style.name}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-inner shadow-black/20">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white">Shape</p>
                              <p className="text-xs text-neutral-300">Pick a frame shape for your star map.</p>
                            </div>
                            {!paid && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                Paid
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {shapes.map((opt) => {
                              const active = shape === opt.id;
                              const locked = !paid && opt.id !== "rectangle";
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => {
                                    if (locked) {
                                      setPaywallOpen(true);
                                      return;
                                    }
                                    setShape(opt.id);
                                  }}
                                  className={`relative flex h-full items-center justify-center rounded-xl border px-3 py-3 text-sm shadow-sm transition ${
                                    active ? "border-amber-300 bg-amber-50 text-midnight" : "border-white/15 bg-white/10 text-white"
                                  } ${locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow-md"}`}
                                >
                                  <div className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl font-semibold leading-none">
                                    <span
                                      className="block"
                                      style={{ transform: shapeSymbolScale[opt.id], transformOrigin: "center" }}
                                    >
                                      {shapeSymbols[opt.id]}
                                    </span>
                                  </div>
                                  <span className="sr-only">{opt.label}</span>
                                  {locked && (
                                    <div className="pointer-events-none absolute right-1.5 top-1.5 text-[11px] font-semibold text-amber-200 drop-shadow-sm">
                                      🔒
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {shape !== "rectangle" && (
                            <div className="flex items-center gap-3">
                              <label className="text-sm font-semibold text-white">Background color</label>
                              <input
                                type="color"
                                value={renderOptions.backgroundColor || "#0b1a30"}
                                onChange={(e) => setRenderOptions({ backgroundColor: e.target.value })}
                                className="h-9 w-14 cursor-pointer rounded-md border border-white/15 bg-white/10 shadow-inner shadow-black/20"
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-inner shadow-black/20">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white">Visual mode</p>
                              <p className="text-xs text-neutral-300">Paid unlock · choose the finish</p>
                            </div>
                            {!paid && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                Paid
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            {visualModes.map((mode) => {
                              const active = renderOptions.visualMode === mode.id;
                              const locked = !paid && mode.id !== "enhanced";
                              return (
                                <button
                                  key={mode.id}
                                  type="button"
                                  disabled={locked}
                                  onClick={() => {
                                    if (!paid) return;
                                    setRenderOptions({ visualMode: mode.id });
                                    track("visual_mode_changed", { visualMode: mode.id, isPaid: paid });
                                  }}
                                  className={`flex h-full flex-col justify-center rounded-xl border px-4 py-3 text-left text-sm shadow-sm transition ${
                                    active ? "border-amber-300 bg-amber-50 text-midnight" : "border-white/15 bg-white/10 text-white"
                                  } ${locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow-md"}`}
                                >
                                  <div className="font-semibold">{mode.label}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-inner shadow-black/20">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white">Constellations</p>
                              <p className="text-xs text-neutral-300">Lines and labels for your map.</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            {constellationPresets.map((preset) => {
                              const active = renderOptions.constellationLines === preset.id;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => setRenderOptions({ constellationLines: preset.id })}
                                  className={`flex h-full flex-col justify-center rounded-xl border px-4 py-3 text-left text-sm shadow-sm transition ${
                                    active ? "border-amber-300 bg-amber-50 text-midnight" : "border-white/15 bg-white/10 text-white"
                                  } hover:-translate-y-[1px] hover:shadow-md`}
                                >
                                  <div className="font-semibold">{preset.label}</div>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-3 grid gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 sm:grid-cols-[1fr_1.5fr] sm:items-center">
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium text-white">Line color</div>
                              <input
                                type="color"
                                value={renderOptions.constellationColor || "#c6a35c"}
                                onChange={(e) => setRenderOptions({ constellationColor: e.target.value })}
                                className="h-9 w-14 cursor-pointer rounded-md border border-white/15 bg-white/10 shadow-inner shadow-black/20"
                                aria-label="Constellation line color"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium text-white">Line weight</div>
                                <span className="text-xs text-neutral-300">
                                  {((renderOptions.constellationLineScale ?? 1) * 100).toFixed(0)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0.6}
                                max={1.6}
                                step={0.1}
                                value={renderOptions.constellationLineScale ?? 1}
                                onChange={(e) =>
                                  setRenderOptions({ constellationLineScale: Number.parseFloat(e.target.value) || 1 })
                                }
                                className="w-full accent-amber-400"
                                aria-label="Constellation line weight"
                              />
                              <p className="text-xs text-neutral-300">Adjust line thickness (60%–160%).</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
                            <div className="text-sm font-medium text-white">Constellation labels</div>
                            <button
                              type="button"
                              onClick={() => setRenderOptions({ constellationLabels: !renderOptions.constellationLabels })}
                              className={`rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-wide transition ${
                                renderOptions.constellationLabels
                                  ? "border-amber-300 bg-amber-50 text-midnight"
                                  : "border-white/15 bg-white/10 text-white"
                              } hover:-translate-y-[1px] hover:shadow`}
                            >
                              {renderOptions.constellationLabels ? "Labels on" : "Labels off"}
                            </button>
                          </div>
                        </div>

                        {!paid && (
                          <div className="rounded-3xl border border-amber-200/70 bg-gradient-to-br from-[rgba(247,241,227,0.95)] via-[rgba(237,221,195,0.95)] to-[rgba(230,208,176,0.9)] p-6 text-neutral-900 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
                            <div className="text-base font-semibold text-midnight">Instant unlock</div>
                            <ul className="mt-2 space-y-1.5 text-left text-sm leading-relaxed text-neutral-800 list-disc pl-5">
                              <li>Print-ready 6000×6000 poster file</li>
                              <li>Illustrated & astronomical visual modes</li>
                              <li>Bold constellations, glow, labels</li>
                              <li>Customizable fonts</li>
                              <li>No watermark</li>
                            </ul>
                            <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                              One-time purchase · No subscription
                            </div>
                            <button
                              type="button"
                              onClick={() => setPaywallOpen(true)}
                              className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2.5 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                            >
                              🔓 Unlock premium styles →
                            </button>
                            <div className="mt-2 text-center text-[11px] font-semibold text-neutral-700">$9.99 · One-time purchase</div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm shadow-black/30">
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">Actions</p>
                      <h3 className="text-lg font-semibold text-white">Finish & share</h3>
                      <p className="text-sm text-neutral-200">Reveal, export, or share your star map.</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!revealed && (
                        <button
                          type="button"
                          onClick={handleReveal}
                          className={`inline-flex flex-1 min-w-[200px] items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-white ${
                            canReveal && hasDate
                              ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                              : "cursor-pointer bg-neutral-200 text-neutral-600 shadow-none"
                          }`}
                          aria-disabled={!canReveal || !hasDate}
                        >
                          ✨ Reveal my sky
                        </button>
                      )}
                      {revealed && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleExport("preview")}
                            className="inline-flex flex-1 min-w-[160px] items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                          >
                            Free preview ⬇️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExport("hd")}
                            className="inline-flex flex-1 min-w-[160px] items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                          >
                            {!paid && "🔒 "}HD export
                          </button>
                          <button
                            type="button"
                            onClick={handleShareImage}
                            className="inline-flex flex-1 min-w-[160px] items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                          >
                            🔗 Share image
                          </button>
                          <button
                            type="button"
                            onClick={handleShare}
                            className="inline-flex flex-1 min-w-[160px] items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                          >
                            💾 Save & remix
                          </button>
                        </>
                      )}
                    </div>
                    {!revealed && (!canReveal || !hasDate) && (
                      <p className="mt-2 text-xs text-neutral-400">
                        Add a location and date to unlock your reveal.
                      </p>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {paywallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-[rgba(247,241,227,0.95)] p-5 shadow-2xl shadow-black/25">
            <h3 className="text-lg font-semibold text-midnight">Download your print-ready star map</h3>
            <ul className="mt-3 space-y-1 text-sm text-neutral-700">
              <li>• 6000px high resolution (poster quality)</li>
              <li>• No watermark</li>
              <li>• Instant digital download</li>
              <li>• One-time payment — $9.99 USD</li>
              <li className="text-xs text-neutral-500">Secure checkout · No subscription</li>
              <li className="text-xs text-neutral-700">One-time payment: Instant access, no recurring fees.</li>
              <li className="text-xs text-neutral-700">Instant download: HD files ready immediately.</li>
              <li className="text-xs text-neutral-700">
                Satisfaction guarantee: Email support@starmapco.com for issues—refunds for technical errors.
              </li>
            </ul>
            <p className="mt-2 text-xs font-semibold text-neutral-600">
              Early access: No reviews yet—we focus on accuracy and your satisfaction.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaywallOpen(false);
                  setPendingExport(null);
                  setCheckoutError(null);
                }}
                className="rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startCheckout}
                className="rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
              >
                Continue to secure checkout
              </button>
            </div>
            {checkoutError && (
              <p className="mt-2 text-sm font-semibold text-rose-700">{checkoutError}</p>
            )}
          </div>
        </div>
      )}
      {shareLink && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[90%] max-w-xl -translate-x-1/2 rounded-full bg-[rgba(247,241,227,0.95)] px-4 py-2 text-center text-xs font-semibold text-neutral-800 shadow-lg">
          Link copied: {shareLink}
        </div>
      )}
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
              className="self-start rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-4 py-2 text-sm font-semibold text-neutral-800 shadow transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30]"
              aria-label="Exit fullscreen"
            >
              ⤡ Exit fullscreen
            </button>
            <div className="flex-1 overflow-hidden rounded-2xl border border-amber-200/60 bg-[rgba(5,9,21,0.25)] shadow-2xl">
              <PreviewCanvas />
            </div>
          </div>
        </div>
      )}
      <section id="accuracy" className="cosmic-panel mx-auto mb-8 mt-8 w-full max-w-7xl rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.9)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-4 text-neutral-800">
          <h2 className="text-3xl font-semibold text-midnight sm:text-4xl">Why is this accurate?</h2>
          <details className="group rounded-2xl border border-amber-200/60 bg-white/80 p-4">
            <summary className="cursor-pointer text-base font-semibold text-midnight sm:text-lg">Data Sources</summary>
            <p className="mt-2 text-sm sm:text-base">
              Yale Bright Star Catalog and astronomy-engine (Skyfield-based) for stellar positions across hemispheres.
            </p>
          </details>
          <details className="group rounded-2xl border border-amber-200/60 bg-white/80 p-4">
            <summary className="cursor-pointer text-base font-semibold text-midnight sm:text-lg">Calculations</summary>
            <p className="mt-2 text-sm sm:text-base">
              Precession, time zones, latitude/longitude, and horizon transforms (alt/az) for true-to-time skies.
            </p>
          </details>
          <details className="group rounded-2xl border border-amber-200/60 bg-white/80 p-4">
            <summary className="cursor-pointer text-base font-semibold text-midnight sm:text-lg">Verification</summary>
            <p className="mt-2 text-sm sm:text-base">
              Compare with Stellarium or other planetarium tools—your rendered sky should match within arcminutes.
            </p>
          </details>
        </div>
      </section>

      <section className="cosmic-panel mx-auto mb-8 mt-8 w-full max-w-7xl rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-6 text-neutral-800">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold text-midnight sm:text-4xl">Frequently Asked Questions</h2>
            <p className="text-base leading-relaxed sm:text-lg">
              Everything you need to know about creating and sharing a custom star map with StarMapCo—accuracy, styling,
              pricing, printing, and more.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                q: "How accurate are StarMapCo custom star maps?",
                a: "Extremely accurate—using professional astronomy libraries based on skyfield and Yale catalogs for precise star positions.",
              },
              {
                q: "What data sources do you use for the night sky?",
                a: "Real astronomical data from trusted sources like the Yale Bright Star Catalog to calculate exact positions for your date, time, and location.",
              },
              {
                q: "Can I customize text, styles, and shapes?",
                a: "Yes—add titles, subtitles, or dedications; choose from four styles (navy gold, vintage, parchment, minimal) and shapes (rectangle free, heart/circle/star premium) plus visual modes and constellations.",
              },
              {
                q: "What is included in the free version vs. premium unlock?",
                a: "Free: basic preview and watermarked export. Premium ($9.99 one-time): HD no-watermark PNG/PDF and advanced visuals.",
              },
              {
                q: "How do I export or download my star map?",
                a: "After premium unlock, download a high-resolution PNG or PDF directly from the app.",
              },
              {
                q: "Is this a one-time purchase or subscription?",
                a: "One-time $9.99 unlock per device/browser, stored locally—no subscriptions.",
              },
              {
                q: "Are the maps suitable for printing?",
                a: "Yes—designed to be print-ready up to 6000x6000 resolution for posters and frames.",
              },
              {
                q: "Can I share my custom star map with others?",
                a: "Generate and share images or links now; public sharing options are coming soon.",
              },
              {
                q: "What if I enter the wrong date or location?",
                a: "Edit inputs anytime before export—the preview updates in real time so you can correct details.",
              },
              {
                q: "Why choose StarMapCo over other star map generators?",
                a: "Instant real-time preview, accurate science, premium visuals, and an affordable one-time unlock with no subscriptions.",
              },
              {
                q: "Can I try a demo?",
                a: "Yes—use the demo button to auto-fill a sample moment and preview without payment.",
              },
            ].map((item) => (
              <details key={item.q} className="group rounded-2xl border border-amber-200/60 bg-white/70 p-4">
                <summary className="cursor-pointer text-base font-semibold text-midnight sm:text-lg">{item.q}</summary>
                <p className="mt-2 text-sm text-neutral-800 sm:text-base">{item.a}</p>
              </details>
            ))}
            <div className="pt-2">
              <Link
                href="#preview"
                className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
              >
                Ready to create yours? Start now
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="cosmic-panel mb-8 mt-8 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold text-midnight sm:text-4xl">Latest from the Blog</h2>
          <p className="text-base text-neutral-800 sm:text-lg">
            Guides and inspiration for anniversaries, birthdays, and accurate astronomy behind your custom star map.
          </p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...blogPosts]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 5)
              .map((post) => (
                <article
                  key={post.slug}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200/60 bg-white/80 text-midnight shadow-md transition hover:-translate-y-[2px] hover:shadow-2xl"
                >
                  <div className="relative h-40 w-full">
                    <Image
                      src="/custom-star-map-anniversary.webp"
                      alt={post.title}
                      fill
                      className="object-cover"
                      loading="lazy"
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="text-xs uppercase tracking-wide text-amber-700">
                      {new Date(post.date).toDateString()}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold">
                      <Link href={`/blog/${post.slug}`} className="hover:underline">
                        {post.title}
                      </Link>
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm text-neutral-700">{post.description}</p>
                    <div className="mt-auto pt-3">
                      <Link
                        href={`/blog/${post.slug}`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:underline"
                      >
                        Read more →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </div>
      </section>

      <section className="cosmic-panel mb-8 mt-8 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.92)] px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <h3 className="text-xl font-semibold text-midnight sm:text-2xl">Who builds StarMapCo?</h3>
        <p className="mt-2 text-sm text-neutral-800 sm:text-base">
          Built by an independent developer passionate about astronomy. Accuracy-first design with no subscriptions—just
          real sky data for meaningful maps.
        </p>
        <p className="mt-1 text-xs font-semibold text-neutral-700">
          Early access: We’re building reviews organically. Try the demo and see the accuracy yourself.
        </p>
      </section>
    </main>
  );
}
