"use client";

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

const constellationPresets: Array<{ id: RenderOptions["constellationLines"]; label: string; note: string }> = [
  { id: "off", label: "Off", note: "No lines visible" },
  { id: "thin", label: "Thin", note: "Subtle guides (default)" },
  { id: "thick", label: "Bold", note: "Stronger, etched lines" },
];

export default function Home() {
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

  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(textBoxes.map((box) => [box.id, true])),
  );
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
  const [intensity, setIntensity] = useState(50);
  const [isUpdating, setIsUpdating] = useState(false);
  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  const canReveal = Boolean(locationName);
  const previewRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
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
        applyVisualOptions(preset.renderMode, level);
        setRevealed(false);
        setPaid(false);
        setDemoApplied(Boolean(demoKey));
        setPresetApplied(true);
        requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
        setRevealed(false);
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
      setIsUpdating(true);
      setCanvasReady(false);
      const cfg = renderModes[mode];
      const normalized = Math.min(Math.max(level / 100, 0), 1);
      const starIntensity: RenderOptions["starIntensity"] =
        normalized < 0.3 ? "subtle" : normalized < 0.7 ? "normal" : "bold";
      const starGlow = cfg.glow + normalized * 0.3 > 0.35;
      const visualMode: RenderOptions["visualMode"] =
        mode === "blueprint" ? "astronomical" : mode === "cinematic" ? "illustrated" : "enhanced";
      const colorTheme: RenderOptions["colorTheme"] =
        mode === "blueprint" ? "vintage" : mode === "cinematic" ? "midnight" : "night";
      const constellationLines: RenderOptions["constellationLines"] =
        mode === "blueprint" ? "thick" : "thin";

      setRenderOptions({
        starIntensity,
        starGlow,
        visualMode,
        colorTheme,
        constellationLines,
      });
      setRenderOptions({
        planetEmphasis: cfg.contrast > 1.1 ? "highlighted" : "normal",
      });
    },
    [setRenderOptions],
  );

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
      applyVisualOptions(preset.renderMode, level);
      setRevealed(false);
      setPaid(false);
      setPresetApplied(true);
      setDemoApplied(false);
      handleEditScroll();
      requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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

  const heroBlurPlaceholder =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBg5C85vIAAAAASUVORK5CYII=";

  return (
    <Suspense fallback={null}>
      <main className="main-container mx-auto max-w-6xl px-4 pb-8 pt-6 sm:pt-8 lg:py-12">
      <section
        id="hero"
        className="cosmic-panel relative mb-8 overflow-hidden rounded-[32px] px-5 py-10 text-midnight shadow-[0_25px_80px_rgba(0,0,0,0.35)] sm:px-8 lg:mb-10 lg:px-12"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(241,194,125,0.16),transparent_36%),radial-gradient(circle_at_82%_12%,rgba(96,161,255,0.16),transparent_30%),linear-gradient(120deg,rgba(255,255,255,0.28),transparent_45%)] blur-xl"
          aria-hidden="true"
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.04fr_minmax(360px,1fr)]">
          <div className="space-y-5">
            <p className="text-xs uppercase tracking-[0.35em] text-amber-700">StarMapCo</p>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-[42px]">
              Buy Custom Star Map for Anniversary | Personalized Star Map Gift at StarMapCo
            </h1>
            <p className="max-w-xl text-base text-neutral-800 sm:text-lg">
              Create a custom star map for anniversary, personalized star map gift, or buy custom star map to capture
              special moments under the night sky.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  track("cta_click", { type: "hero_create" });
                  handleReveal();
                }}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg shadow-amber-200/60 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:ring-offset-2 ${
                  canReveal && hasDate
                    ? "bg-gradient-to-r from-amber-300 via-amber-400 to-amber-300 text-midnight focus:ring-offset-white"
                    : "bg-[rgba(247,241,227,0.85)] text-neutral-700 focus:ring-offset-[rgba(247,241,227,1)]"
                }`}
              >
                ✦ Create yours now
              </button>
              <button
                type="button"
                onClick={() => {
                  track("cta_click", { type: "hero_sample" });
                  scrollToPreview();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/60 bg-[rgba(247,241,227,0.9)] px-4 py-3 text-sm font-semibold text-neutral-800 shadow-md transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:ring-offset-2 focus:ring-offset-white"
              >
                👀 See a sample
              </button>
              <button
                type="button"
                onClick={() => router.push("/?demo=default")}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:ring-offset-2"
              >
                ✨ Try a Demo Star Map
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-neutral-800 sm:text-sm">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-[rgba(247,241,227,0.9)] px-3 py-2 shadow-sm shadow-black/10">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" />
                Astronomically accurate skyfields
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-[rgba(247,241,227,0.9)] px-3 py-2 shadow-sm shadow-black/10">
                100K+ maps crafted
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-[rgba(247,241,227,0.9)] px-3 py-2 shadow-sm shadow-black/10">
                Instant share & export
              </div>
            </div>
          </div>
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-6 bg-[radial-gradient(circle_at_20%_30%,rgba(241,194,125,0.18),transparent_35%),radial-gradient(circle_at_75%_10%,rgba(96,161,255,0.16),transparent_28%)] blur-3xl"
              aria-hidden="true"
            />
            <div className="relative overflow-hidden rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur">
              <div className="relative rounded-2xl border border-amber-100 bg-[rgba(247,241,227,0.92)] p-2 shadow-inner shadow-black/10">
                <picture>
                  <source srcSet="/custom-star-map-anniversary.webp" type="image/webp" />
                  <source srcSet="/custom-star-map-anniversary.png" type="image/png" />
                  <Image
                    src={heroPreviewSrc}
                    alt="Custom star map preview for anniversary gift"
                    width={1200}
                    height={900}
                    className="preview-static"
                    placeholder="blur"
                    blurDataURL={heroBlurPlaceholder}
                    priority
                  />
                </picture>
                <div className="pointer-events-none absolute inset-3 rounded-2xl ring-1 ring-amber-100" aria-hidden="true" />
                <div className="pointer-events-none absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-midnight shadow-sm backdrop-blur">
                  Sample preview
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cosmic-panel mb-8 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.9)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-4 text-neutral-800">
          <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">What StarMapCo Can Do</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Astronomical Accuracy",
                desc: "Real calculations from Yale catalogs for any date, location, and hemisphere.",
              },
              {
                title: "Global Hemispheres",
                desc: "Supports Northern/Southern skies with precise orientation.",
              },
              {
                title: "High-Res Exports",
                desc: "6000x6000 print-ready PNG/PDF, no watermarks on premium.",
              },
              {
                title: "One-Time Payment",
                desc: "$9.99 unlock, no subscriptions—lifetime access on your device.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-amber-200/60 bg-white/80 p-4 shadow-sm shadow-black/10"
              >
                <h3 className="text-lg font-semibold text-midnight">{item.title}</h3>
                <p className="mt-2 text-sm text-neutral-800">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cosmic-panel mb-8 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-4 text-neutral-800">
          <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">StarMapCo vs Generic Poster Sites</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-amber-200/50 text-left text-sm text-neutral-900">
              <thead className="bg-[#0f1f3a] text-amber-200">
                <tr>
                  <th className="p-3">Feature</th>
                  <th className="p-3">StarMapCo</th>
                  <th className="p-3">Generic Sites</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-amber-200/50">
                  <td className="p-3">Accuracy</td>
                  <td className="p-3">Real astronomy-engine & Yale catalogs</td>
                  <td className="p-3">Pre-made images</td>
                </tr>
                <tr className="border-t border-amber-200/50">
                  <td className="p-3">Customization</td>
                  <td className="p-3">Real-time preview, styles, shapes</td>
                  <td className="p-3">Limited templates</td>
                </tr>
                <tr className="border-t border-amber-200/50">
                  <td className="p-3">Price</td>
                  <td className="p-3">$9.99 one-time</td>
                  <td className="p-3">$20-50 recurring/upsells</td>
                </tr>
                <tr className="border-t border-amber-200/50">
                  <td className="p-3">Exports</td>
                  <td className="p-3">HD print-ready, no watermark</td>
                  <td className="p-3">Lower-res or watermarked</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="cosmic-panel mb-8 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-6 text-neutral-800">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">What Is a Custom Star Map?</h2>
            <p className="text-base leading-relaxed sm:text-lg">
              A custom star map is a personalized print that shows the exact night sky from a specific date, time, and
              location. At StarMapCo, we generate astronomically accurate star maps that reflect how the stars were
              aligned during life&apos;s most meaningful moments—weddings, anniversaries, birthdays, proposals, and
              milestones—then transform them into beautifully designed, print-ready artwork you can treasure or gift.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">How StarMapCo Works</h2>
            <p className="text-base leading-relaxed sm:text-lg">
              Creating your personalized star map takes just a few steps:
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-base leading-relaxed sm:text-lg">
              <li>Choose a date and location—the moment that matters most.</li>
              <li>Preview your night sky in real time with accurate star positions.</li>
              <li>Customize the design with text, styles, and visual finishes.</li>
              <li>Unlock and download a high-resolution star map ready for print or sharing.</li>
            </ol>
            <p className="text-base leading-relaxed sm:text-lg">
              Every star map is rendered based on your inputs, so the sky you see is the sky that truly existed.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">Astronomically Accurate Night Skies</h2>
            <p className="text-base leading-relaxed sm:text-lg">
              StarMapCo uses real astronomical calculations to render the sky exactly as it appeared from your chosen
              place and time. Star positions, constellations, and orientation are all determined by precise skyfield
              data—not approximations or guesses—so every map is scientifically grounded.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">Perfect for Meaningful Gifts & Milestones</h2>
            <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed sm:text-lg">
              <li>Wedding nights & anniversaries</li>
              <li>Birthdays & newborn arrivals</li>
              <li>Proposals & engagements</li>
              <li>Memorials & remembrance pieces</li>
              <li>Graduations and life milestones</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">Why Choose StarMapCo?</h2>
            <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed sm:text-lg">
              <li>Accurate star positioning based on real sky data</li>
              <li>Instant preview before you unlock</li>
              <li>High-resolution 6000×6000 export for printing</li>
              <li>Multiple visual styles & finishes</li>
              <li>One-time purchase—no subscription</li>
              <li>Designed for both digital sharing and physical prints</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">Create Your Custom Star Map Today</h2>
            <p className="text-base leading-relaxed sm:text-lg">
              Relive your moment under the stars with a personalized star map designed just for you. Enter a date and
              location to preview your sky, then unlock a premium, print-ready artwork you&apos;ll keep forever.
            </p>
            <p className="text-sm italic text-neutral-700">Each star map is uniquely generated. No two skies are ever the same.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-5 lg:gap-6">
        <section className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-amber-200/60 bg-[rgba(247,241,227,0.92)] px-3 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">Occasion presets</p>
          <div className="flex flex-wrap gap-2">
            {occasionPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="rounded-full border border-amber-300 bg-white/80 px-3 py-2 text-sm font-semibold text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 rounded-2xl border border-amber-200/60 bg-[rgba(247,241,227,0.92)] px-3 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">Render modes</p>
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
                      mode.id === "cinematic" ? Math.max(intensity, 60) : mode.id === "luxe" ? Math.max(intensity, 55) : intensity;
                    setRenderMode(mode.id as RenderModeId);
                    setIntensity(targetLevel);
                    applyVisualOptions(mode.id as RenderModeId, targetLevel);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-[1px] hover:shadow ${
                    renderMode === mode.id
                      ? "border-amber-400 bg-amber-200 text-midnight"
                      : "border-amber-200 bg-white/80 text-midnight"
                  }`}
                >
                  {mode.premium && "🔒"} {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <label className="flex items-center justify-between text-sm font-semibold text-midnight">
              <span>Visual Intensity</span>
              <span className="text-xs text-neutral-700">Clean → Cinematic</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={(e) => {
                let next = Number(e.target.value);
                if (!paid && next > 60) {
                  next = 60;
                  setPaywallOpen(true);
                }
                setIntensity(next);
                applyVisualOptions(renderMode, next);
              }}
              className="mt-2 w-full accent-amber-400"
            />
          </div>
          {!paid && (
            <p className="mt-2 text-xs font-semibold text-neutral-700">
              Cinematic/Luxe and higher intensity require unlock for export. Preview stays free to explore.
            </p>
          )}
        </section>

        <p className="text-sm font-semibold text-amber-700">
          Real-time generation: change date/location and watch the sky update instantly with accurate stars.
        </p>
        <section
          ref={previewRef}
        className="flex flex-col gap-3 rounded-3xl border border-amber-200/60 bg-[rgba(247,241,227,0.85)] p-3 shadow-2xl shadow-black/15 backdrop-blur transition-all duration-500 sm:p-4"
      >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">Preview</p>
              <h3 className="text-xl font-semibold text-midnight sm:text-2xl">StarMapCo night sky</h3>
              <p className="text-xs text-neutral-600 sm:text-sm">
                {revealed
                  ? "Your sky is revealed. Tap edit to refine."
                  : "Hidden until you reveal. Perfect your inputs first."}
              </p>
            </div>
            <div className="rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm">
              {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
            </div>
          </div>
          <div
            className="relative overflow-hidden rounded-2xl border border-amber-100/70 bg-[rgba(247,241,227,0.9)] p-2 shadow-inner shadow-black/10"
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
              className={`relative min-h-[70vh] overflow-hidden rounded-xl sm:min-h-[75vh] lg:min-h-[80vh] ${
                revealed ? "" : "bg-transparent"
              } transition-opacity duration-200 ${isUpdating ? "opacity-80" : "opacity-100"}`}
            >
              {!revealed && (
                <div className="absolute inset-0 flex flex-col items-center justify-end gap-4 pb-10 text-center text-sm text-amber-50">
                  <div className="pointer-events-none absolute inset-0 opacity-35">
                    <div className="absolute inset-10 rounded-full bg-gradient-to-br from-amber-500/10 via-amber-200/5 to-transparent blur-3xl" />
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
                  <PreviewCanvas
                    onRendered={() => {
                      setCanvasReady(true);
                      setIsUpdating(false);
                    }}
                  />
                  {isUpdating && (
                    <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-[rgba(247,241,227,0.95)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm backdrop-blur">
                      Updating sky…
                    </div>
                  )}
                  <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-[rgba(247,241,227,0.95)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm backdrop-blur">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                    Live Preview
                  </div>
                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5" />
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => handleExport("preview")}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-[rgba(247,241,227,0.95)] px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      Free ⬇️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport("hd")}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      {!paid && "🔒 "}HD ⬇️
                    </button>
                    <button
                      type="button"
                      onClick={handleShareImage}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-[rgba(247,241,227,0.95)] px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      🔗 Share
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-[rgba(247,241,227,0.95)] px-3 py-2 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      💾 Save & Remix
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(247,241,227,0.9)] text-lg text-neutral-800 shadow-md backdrop-blur transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    aria-label="Open fullscreen"
                  >
                    ⤢
                  </button>
                  <button
                    type="button"
                    onClick={handleEditScroll}
                    className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-[rgba(247,241,227,0.95)] px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
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
          className="rounded-3xl border border-amber-200/60 bg-[rgba(247,241,227,0.92)] p-4 shadow-xl shadow-black/15 backdrop-blur sm:p-5"
        >
          <h2 className="text-lg font-semibold text-midnight">Inputs</h2>
          <p className="mb-4 text-sm text-neutral-600">
            Set the celestial moment, place, and the words that anchor your print.
          </p>

          <div className="space-y-4">
            <DateTimeControls dateTime={dateTime} onChange={setDateTime} />

            <LocationSearch />

            <div className="divide-y divide-amber-100/70 rounded-2xl border border-amber-100/80 bg-[rgba(247,241,227,0.8)]">
              {textBoxes.map((box) => (
                <div key={box.id} className="space-y-2 p-3 sm:p-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCard(box.id)}
                        className="h-7 w-7 rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
                        aria-pressed={!!collapsedCards[box.id]}
                        aria-label={`Toggle ${box.label}`}
                      >
                        {collapsedCards[box.id] ? "▾" : "▴"}
                      </button>
                      <span className="font-medium text-neutral-800">{box.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={box.fontFamily}
                        onChange={(e) =>
                          paid && updateTextBox(box.id, { fontFamily: e.target.value as TextBox["fontFamily"] })
                        }
                        disabled={!paid}
                        className={`rounded-md border px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 ${
                          paid
                            ? "border-amber-200 bg-[rgba(247,241,227,0.95)] text-neutral-800"
                            : "cursor-not-allowed border-amber-100 bg-neutral-100 text-neutral-400"
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
                        className="w-full rounded-md border border-amber-200 bg-[rgba(247,241,227,0.95)] px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${box.label} color`}
                          value={box.color}
                          onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                          className="h-10 w-14 cursor-pointer rounded-md border border-amber-200 bg-[rgba(247,241,227,0.95)]"
                        />
                        <input
                          type="number"
                          min={10}
                          max={48}
                          value={box.size}
                          onChange={(e) =>
                            updateTextBox(box.id, { size: Number.parseInt(e.target.value, 10) || box.size })
                          }
                          className="w-24 rounded-md border border-amber-200 bg-[rgba(247,241,227,0.95)] px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                        />
                        <select
                          value={box.align}
                          onChange={(e) => updateTextBox(box.id, { align: e.target.value as TextBox["align"] })}
                          className="flex-1 rounded-md border border-amber-200 bg-[rgba(247,241,227,0.95)] px-2 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => paid && updateTextBox(box.id, { textShadow: !box.textShadow })}
                          disabled={!paid}
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-inner shadow-black/5 transition ${
                            paid
                              ? box.textShadow
                                ? "border-amber-300 bg-amber-100/80 text-midnight shadow-amber-200/60 hover:-translate-y-[1px] hover:shadow-md"
                                : "border-amber-200 bg-[rgba(247,241,227,0.95)] text-neutral-800 hover:-translate-y-[1px] hover:shadow"
                              : "cursor-not-allowed border-amber-100 bg-neutral-100 text-neutral-400"
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
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-inner shadow-black/5 transition ${
                            paid
                              ? box.textGlow
                                ? "border-amber-300 bg-amber-50 text-midnight shadow-amber-200/80 hover:-translate-y-[1px] hover:shadow-md"
                                : "border-amber-200 bg-[rgba(247,241,227,0.95)] text-neutral-800 hover:-translate-y-[1px] hover:shadow"
                              : "cursor-not-allowed border-amber-100 bg-neutral-100 text-neutral-400"
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
            <button
              type="button"
              onClick={addTextBox}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-amber-200 bg-[rgba(247,241,227,0.9)] px-3 py-3 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-[1px] hover:shadow"
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
                        : "border-amber-100 bg-[rgba(247,241,227,0.85)] text-neutral-800"
                    }`}
                  >
                    <div className="text-sm font-semibold">{style.name}</div>
                    <div className="mt-1 text-xs text-neutral-600">{style.note}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-amber-100/80 bg-[rgba(247,241,227,0.85)] p-3 shadow-inner shadow-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Shape</p>
                  <p className="text-xs text-neutral-600">Pick a frame shape for your star map.</p>
                </div>
                {!paid && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Paid
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                      className={`rounded-lg border px-3 py-3 text-left text-sm shadow-sm transition ${
                        active ? "border-gold bg-amber-50" : "border-amber-100 bg-[rgba(247,241,227,0.85)]"
                      } ${locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow-md"}`}
                    >
                      <div className="font-semibold text-neutral-900">{opt.label}</div>
                      {locked && <div className="text-[11px] font-semibold uppercase text-amber-700">Unlock</div>}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-neutral-800">Background color</label>
                <input
                  type="color"
                  value={renderOptions.backgroundColor || "#0b1a30"}
                  onChange={(e) => setRenderOptions({ backgroundColor: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded-md border border-amber-100 bg-[rgba(247,241,227,0.95)] shadow-inner shadow-black/5"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-amber-100/80 bg-[rgba(247,241,227,0.85)] p-3 shadow-inner shadow-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Visual mode</p>
                  <p className="text-xs text-neutral-600">Paid unlock · choose the finish</p>
                </div>
                {!paid && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Paid
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                      className={`rounded-xl border px-3 py-3 text-left text-sm shadow-sm transition ${
                        active ? "border-gold bg-amber-50" : "border-amber-100 bg-[rgba(247,241,227,0.85)]"
                      } ${locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow-md"}`}
                    >
                      <div className="font-semibold">{mode.label}</div>
                      <div className="text-xs text-neutral-600">{mode.description}</div>
                      {locked && <div className="mt-1 text-[10px] font-semibold text-amber-600">Unlock to use</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-amber-100/80 bg-[rgba(247,241,227,0.85)] p-3 shadow-inner shadow-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Constellations</p>
                  <p className="text-xs text-neutral-600">Paid unlock · lines and labels</p>
                </div>
                {!paid && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Paid
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {constellationPresets.map((preset) => {
                  const active = renderOptions.constellationLines === preset.id;
                  const locked = !paid && preset.id !== "thin";
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={locked}
                      onClick={() => paid && setRenderOptions({ constellationLines: preset.id })}
                      className={`rounded-xl border px-3 py-3 text-left text-sm shadow-sm transition ${
                        active ? "border-gold bg-amber-50" : "border-amber-100 bg-[rgba(247,241,227,0.85)]"
                      } ${locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow-md"}`}
                    >
                      <div className="font-semibold">{preset.label}</div>
                      <div className="text-xs text-neutral-600">{preset.note}</div>
                      {locked && <div className="mt-1 text-[10px] font-semibold text-amber-600">Unlock to use</div>}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-[rgba(247,241,227,0.85)] px-3 py-2">
                <div className="text-sm font-medium text-neutral-800">Constellation labels</div>
                <button
                  type="button"
                  disabled={!paid}
                  onClick={() => paid && setRenderOptions({ constellationLabels: !renderOptions.constellationLabels })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                    renderOptions.constellationLabels
                      ? "border-gold bg-amber-50 text-midnight"
                      : "border-amber-200 bg-[rgba(247,241,227,0.95)] text-neutral-700"
                  } ${!paid ? "cursor-not-allowed opacity-60" : "hover:-translate-y-[1px] hover:shadow"}`}
                >
                  {renderOptions.constellationLabels ? "Labels on" : "Labels off"}
                </button>
              </div>

              {!paid && (
                <div className="mt-3 space-y-2 rounded-xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] px-4 py-3 text-neutral-800 shadow-sm">
                  <div className="text-sm font-semibold text-midnight">Instant unlock</div>
                  <ul className="list-disc pl-5 text-xs text-neutral-700">
                    <li>Print-ready 6000×6000 poster file</li>
                    <li>Illustrated & astronomical visual modes</li>
                    <li>Bold constellations, glow, labels</li>
                    <li>Customizable fonts</li>
                    <li>No watermark</li>
                  </ul>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    One-time purchase · No subscription
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaywallOpen(true)}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                  >
                    🔓 Unlock premium styles →
                  </button>
                  <div className="text-center text-[11px] font-semibold text-neutral-700">$9.99 · One-time purchase</div>
                </div>
              )}
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
      <section className="cosmic-panel mb-8 mt-8 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-6 text-neutral-800">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">Frequently Asked Questions</h2>
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
          <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">Latest from the Blog</h2>
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

      <section className="cosmic-panel mb-8 mt-2 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.9)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-4 text-neutral-800">
          <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">Why is this accurate?</h2>
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

      <section className="cosmic-panel mb-8 mt-2 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.92)] px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
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
    </Suspense>
  );
}
