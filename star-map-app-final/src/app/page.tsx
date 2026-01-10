"use client";

export const dynamic = "force-dynamic";

import DateTimeControls from "@/components/DateTimeControls";
import { EditorDrawer } from "@/components/EditorDrawer";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import { MobileCreate } from "./MobileCreate";
import { StyleId, TextBox, useStore, RenderOptions } from "@/lib/store";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap } from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";
import type { Shape } from "@/lib/types";
import { track } from "@/lib/analytics";
import { blogPosts } from "@/lib/blogPosts";
import { formatPrice, getPricingInfo } from "@/lib/pricing";
import { occasionPresets } from "@/lib/occasionPresets";
import { renderModes, type RenderModeId } from "@/lib/renderModes";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useIsDesktop } from "@/hooks/useIsDesktop";

const styles: { id: StyleId; name: string; note: string }[] = [
  { id: "navyGold", name: "Navy & Gold", note: "Luxe midnight with gilded accents" },
  { id: "vintageEngraving", name: "Vintage Engraving", note: "Linework etched on deep charcoal" },
  { id: "parchmentScroll", name: "Parchment Scroll", note: "Warm cream with antique border" },
  { id: "midnightMinimal", name: "Midnight Minimal", note: "Clean noir with subtle glow" },
];

const DRAFT_KEY = "star-map-draft";
const AUTO_EXPORT_KEY = "star-map-auto-export";
const REVEALED_FLAG = "star-map-last-revealed";

const fontOptions: Array<{ id: TextBox["fontFamily"]; label: string; premium?: boolean }> = [
  // Free fonts
  { id: "playfair", label: "Playfair Display" },
  { id: "cinzel", label: "Cinzel" },
  { id: "script", label: "Great Vibes" },
  { id: "cormorant", label: "Cormorant Garamond" },
  { id: "montserrat", label: "Montserrat" },
  // Premium fonts - Serif
  { id: "libreBaskerville", label: "Libre Baskerville", premium: true },
  { id: "ebGaramond", label: "EB Garamond", premium: true },
  { id: "crimsonText", label: "Crimson Text", premium: true },
  { id: "lora", label: "Lora", premium: true },
  // Premium fonts - Sans-serif
  { id: "raleway", label: "Raleway", premium: true },
  { id: "poppins", label: "Poppins", premium: true },
  // Premium fonts - Script/Decorative
  { id: "dancingScript", label: "Dancing Script", premium: true },
  { id: "parisienne", label: "Parisienne", premium: true },
  // Premium fonts - Display
  { id: "bebasNeue", label: "Bebas Neue", premium: true },
  { id: "abrilFatface", label: "Abril Fatface", premium: true },
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
  rectangle: "■",
  heart: "♥",
  circle: "●",
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

  const [mounted, setMounted] = useState(false);
  const [pricing, setPricing] = useState(() => getPricingInfo());
  const [activePriceLabel, setActivePriceLabel] = useState("$9.99");
  const [basePriceLabel, setBasePriceLabel] = useState("$9.99");

  useEffect(() => {
    setMounted(true);
    const pricingInfo = getPricingInfo();
    setPricing(pricingInfo);
    setActivePriceLabel(formatPrice(pricingInfo.activeAmountCents, pricingInfo.currency));
    setBasePriceLabel(formatPrice(pricingInfo.baseAmountCents, pricingInfo.currency));
  }, []);

  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() => {
    const entries = textBoxes.map((box) => [box.id, true]);
    return { __all__: true, ...Object.fromEntries(entries) };
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
  const isDesktopQuery = useIsDesktop();
  const [renderMode, setRenderMode] = useState<RenderModeId>("classic");

  // Test-only override for deterministic Playwright testing
  // In production, force will be null and normal responsive behavior applies
  const forceViewport = searchParams.get("force");
  const isDesktop = forceViewport === "desktop" ? true : forceViewport === "mobile" ? false : isDesktopQuery;

  // Debug logging for tests
  if (typeof window !== 'undefined') {
    console.log(`[page.tsx] Force viewport: ${forceViewport}, isDesktop: ${isDesktop}, query result: ${isDesktopQuery}, window.innerWidth: ${window.innerWidth}`);
  }
  const [intensity, setIntensity] = useState(50); // applied intensity for rendering
  const [intensityDisplay, setIntensityDisplay] = useState(50); // immediate display value
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
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup transition timeout on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCollapsedCards((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const box of textBoxes) {
        if (typeof next[box.id] === "undefined") {
          next[box.id] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [textBoxes]);
  const handleEditScroll = useCallback(() => {
    inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const scrollToPreview = useCallback(() => {
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    fetch("/api/og/sample", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("OG fetch failed");
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setHeroPreviewSrc(objectUrl);
      })
      .catch((err) => {
        if (!active) return;
        if (err.name !== 'AbortError') {
          setHeroPreviewSrc("/custom-star-map-anniversary.webp");
        }
      });
    return () => {
      active = false;
      controller.abort();
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
        // Batch all Zustand store updates into single setState call for better performance
        useStore.setState({
          dateTime: preset.dateTimeISO,
          location: {
            name: preset.location?.name ?? "",
            latitude: preset.location?.latitude ?? 0,
            longitude: preset.location?.longitude ?? 0,
            timezone: preset.location?.timezone ?? "UTC",
          },
          textBoxes: preset.textBoxes,
          selectedStyle: preset.style as StyleId,
          shape: preset.shape as Shape,
          revealed: true,
          paid: false,
        });

        // Local state updates (fewer re-renders)
        setRenderMode(preset.renderMode);
        const level = Math.round(preset.intensity * 100);
        setIntensity(level);
        setIntensityDisplay(level);
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
    }, 150);
    return () => clearTimeout(t);
  }, [applyVisualOptions, intensity, renderMode]);

  useEffect(() => {
    let next = intensityDisplay;
    if (!paid && next > 60) {
      next = 60;
    }
    if (next === intensity) return;
    const t = setTimeout(() => setIntensity(next), 200);
    return () => clearTimeout(t);
  }, [intensityDisplay, paid, intensity]);

  const applyPreset = useCallback(
    (id: string) => {
      const preset = occasionPresets.find((p) => p.id === id);
      if (!preset) return;

      // Batch all Zustand store updates into single setState call for better performance
      useStore.setState({
        dateTime: preset.dateTimeISO,
        location: {
          name: preset.location?.name ?? "",
          latitude: preset.location?.latitude ?? 0,
          longitude: preset.location?.longitude ?? 0,
          timezone: preset.location?.timezone ?? "UTC",
        },
        textBoxes: preset.textBoxes,
        selectedStyle: preset.style as StyleId,
        shape: preset.shape as Shape,
        revealed: true,
        paid: false,
      });

      // Local state updates (fewer re-renders)
      setRenderMode(preset.renderMode);
      const level = Math.round(preset.intensity * 100);
      setIntensity(level);
      setIntensityDisplay(level);
      applyVisualOptions(preset.renderMode, level);
      setPresetApplied(true);
      setDemoApplied(false);
      setShowPresetTransition(true);
      setIsUpdating(true);
      setCanvasReady(false);
      handleEditScroll();
      // Clear any existing timeout before setting new one
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      transitionTimeoutRef.current = setTimeout(() => {
        setShowPresetTransition(false);
        transitionTimeoutRef.current = null;
      }, 240);
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
      // Ensure all fonts are loaded before export
      if (typeof document !== "undefined" && document.fonts) {
        await document.fonts.ready;
      }

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
      let ratio: number;
      if (shapeData) {
        if (shapeData.viewBox.height === 0) {
          console.warn('Invalid shape viewBox height');
          ratio = aspectRatioToNumber(recipe.aspectRatio);
        } else {
          ratio = shapeData.viewBox.width / shapeData.viewBox.height;
        }
      } else {
        ratio = aspectRatioToNumber(recipe.aspectRatio);
      }
      const height = Math.max(1, Math.round(width / ratio));
      const canvas = document.createElement("canvas");
      const watermark = mode !== "hd";

      // Render the map
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

    let mounted = true;
    const id = requestAnimationFrame(() => {
      exportImage("hd")
        .catch(() => {})
        .finally(() => {
          if (mounted) {
            localStorage.removeItem(AUTO_EXPORT_KEY);
            setAutoExportPending(false);
          }
        });
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(id);
    };
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
    // Ensure all fonts are loaded before export
    if (typeof document !== "undefined" && document.fonts) {
      await document.fonts.ready;
    }

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
    let ratio: number;
    if (shapeData) {
      if (shapeData.viewBox.height === 0) {
        console.warn('Invalid shape viewBox height');
        ratio = aspectRatioToNumber(recipe.aspectRatio);
      } else {
        ratio = shapeData.viewBox.width / shapeData.viewBox.height;
      }
    } else {
      ratio = aspectRatioToNumber(recipe.aspectRatio);
    }
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
    <main className="flex flex-col items-center px-6 md:px-8 lg:px-12 py-4 md:py-8 lg:py-0">
      <section className="mx-auto w-full max-w-7xl min-h-screen flex items-center py-12 sm:py-14 lg:py-16">
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
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_8px_30px_rgba(251,191,36,0.5)] focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:ring-offset-2 active:scale-95 sm:w-auto"
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
          <div className="relative" style={{ animation: 'float 6s ease-in-out infinite' }}>
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_25px_60px_rgba(0,0,0,0.35)] transition-shadow duration-300 hover:shadow-[0_30px_70px_rgba(241,194,125,0.2)]">
              <div className="relative aspect-[2/1] bg-gradient-to-b from-[#0b0f24] via-[#0a0d1c] to-[#05070f]">
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
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
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

      <section ref={editorRef} id="editor" className="mx-auto w-full max-w-7xl lg:max-w-none py-12 sm:py-14 lg:py-12" data-force={forceViewport || "none"} data-is-desktop={String(isDesktop)}>
        {/* Conditional rendering with key to force React to replace tree */}
        {isDesktop ? (
            /* Desktop: Use existing implementation - UNCHANGED */
            <div key="desktop" data-component="desktop">
          <div className="space-y-6 lg:h-full">
            <div className="grid gap-3 lg:gap-4 lg:grid-cols-2 lg:items-end">
              <div ref={inputsRef} className="w-full space-y-2">
              {/* Header - always visible */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">Create your star map</p>
                <h2 className="text-3xl font-semibold text-white sm:text-4xl">Design your sky in seconds</h2>
                <p className="text-base text-neutral-200 sm:text-lg">
                  Start from a preset, fine-tune the details, and see a finished map before you unlock.
                </p>
              </div>

              {/* Desktop: always visible, Mobile: inside drawer */}
              <div className="hidden lg:block rounded-2xl border border-white/10 bg-[rgba(10,14,30,0.82)] p-3 shadow-lg backdrop-blur-sm ring-1 ring-white/5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {occasionPresets.map((preset) => {
                      const occasionStyles = {
                        wedding: "border-pink-300/40 bg-gradient-to-br from-pink-100/15 to-rose-100/15 text-pink-100 hover:border-pink-300/60 hover:bg-pink-100/20",
                        anniversary: "border-amber-300/40 bg-gradient-to-br from-amber-100/15 to-orange-100/15 text-amber-100 hover:border-amber-300/60 hover:bg-amber-100/20",
                        birthday: "border-cyan-300/40 bg-gradient-to-br from-cyan-100/15 to-blue-100/15 text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-100/20",
                        birth: "border-green-300/40 bg-gradient-to-br from-green-100/15 to-emerald-100/15 text-green-100 hover:border-green-300/60 hover:bg-green-100/20",
                        memorial: "border-purple-300/40 bg-gradient-to-br from-purple-100/15 to-violet-100/15 text-purple-100 hover:border-purple-300/60 hover:bg-purple-100/20",
                        graduation: "border-yellow-300/40 bg-gradient-to-br from-yellow-100/15 to-amber-100/15 text-yellow-100 hover:border-yellow-300/60 hover:bg-yellow-100/20"
                      };

                      const occasionEmojis = {
                        wedding: "💍",
                        anniversary: "❤️",
                        birthday: "🎉",
                        birth: "👶",
                        memorial: "🕊️",
                        graduation: "🎓"
                      };

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset.id)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:scale-95 ${occasionStyles[preset.id as keyof typeof occasionStyles]}`}
                        >
                          {occasionEmojis[preset.id as keyof typeof occasionEmojis]} {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "classic", label: "Classic", premium: false },
                      { id: "cinematic", label: "Enhanced", premium: true },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          if (!paid && mode.premium) setPaywallOpen(true);
                          const targetLevel =
                            mode.id === "cinematic"
                              ? Math.max(intensityDisplay, 60)
                              : intensityDisplay;
                          setRenderMode(mode.id as RenderModeId);
                          setIntensity(targetLevel);
                          setIntensityDisplay(targetLevel);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition hover:-translate-y-[1px] hover:shadow ${
                          renderMode === mode.id ? "border-amber-400 bg-amber-200 text-midnight" : "border-white/20 bg-white/10 text-white"
                        }`}
                        title={
                          mode.premium && !paid
                            ? "Unlock to export Enhanced. Preview stays free."
                            : mode.label
                        }
                      >
                        {mode.premium && "🔒"} {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 shadow-inner shadow-black/30">
                  <label className="flex items-center justify-between text-xs font-semibold text-white">
                    <span>Intensity</span>
                    <span className="text-[10px] text-neutral-300">{intensityDisplay}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={intensityDisplay}
                    onChange={(e) => {
                      let next = Number(e.target.value);
                      if (!paid && next > 60) {
                        next = 60;
                        setPaywallOpen(true);
                      }
                      setIntensityDisplay(next);
                    }}
                    className="mt-1 w-full accent-amber-400"
                  />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <section className="rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-sm shadow-black/30">
                      <div className="mb-1.5">
                        <h3 className="text-xs font-semibold text-white">Date & Location</h3>
                      </div>
                      <div className="space-y-2">
                        <DateTimeControls dateTime={dateTime} onChange={setDateTime} />
                        <LocationSearch />
                      </div>
                    </section>

                    <section className="rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-sm shadow-black/30">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-amber-300">✎</span>
                        <h3 className="text-xs font-semibold text-white">Your Message</h3>
                      </div>
                      <div className="space-y-3">
                          {textBoxes.map((box) => (
                            <div key={box.id} className="space-y-2">
                              <label className="text-sm font-medium text-white">{box.label}</label>
                              <input
                                type="text"
                                value={box.text}
                                onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                                className="h-10 w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                                placeholder={`Enter ${box.label.toLowerCase()}...`}
                              />
                            </div>
                          ))}
                        </div>
                    </section>
                  </div>

                  <div className="space-y-2">
                    <section className="rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-inner shadow-black/20">
                      <h3 className="text-xs font-semibold text-white mb-2">Style</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {styles.map((style) => {
                          const styleClasses = {
                            navyGold: selectedStyle === style.id
                              ? "border-amber-400 bg-gradient-to-br from-[#0d1b2a] to-[#1b2838] text-amber-300 shadow-amber-500/20"
                              : "border-amber-500/30 bg-gradient-to-br from-[#0d1b2a]/80 to-[#1b2838]/80 text-amber-200/80 hover:border-amber-400/50",
                            vintageEngraving: selectedStyle === style.id
                              ? "border-amber-300 bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] text-amber-100 shadow-amber-500/20"
                              : "border-neutral-400/30 bg-gradient-to-br from-[#2d2d2d]/80 to-[#1a1a1a]/80 text-neutral-200/80 hover:border-neutral-300/50",
                            parchmentScroll: selectedStyle === style.id
                              ? "border-amber-400 bg-gradient-to-br from-[#f5f0e6] to-[#e8dcc8] text-amber-900 shadow-amber-500/20"
                              : "border-amber-500/30 bg-gradient-to-br from-[#f5f0e6]/90 to-[#e8dcc8]/90 text-amber-800/80 hover:border-amber-400/50",
                            midnightMinimal: selectedStyle === style.id
                              ? "border-blue-400 bg-gradient-to-br from-[#0a0a0a] to-[#1a1a2e] text-blue-300 shadow-blue-500/20"
                              : "border-blue-500/30 bg-gradient-to-br from-[#0a0a0a]/80 to-[#1a1a2e]/80 text-blue-200/80 hover:border-blue-400/50"
                          };

                          return (
                            <button
                              key={style.id}
                              type="button"
                              onClick={() => setStyle(style.id)}
                              className={`flex h-full flex-col justify-center rounded-lg border px-3 py-2 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${styleClasses[style.id as keyof typeof styleClasses]}`}
                            >
                              <div className="text-sm font-semibold">
                                {style.name}
                                {style.id === "navyGold" && (
                                  <span className="ml-1.5 text-[10px] text-amber-300">(Recommended)</span>
                                )}
                              </div>
                              <div className="text-xs opacity-80 mt-1">{style.note}</div>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-inner shadow-black/20">
                      <h3 className="text-xs font-semibold text-white mb-2">Shape</h3>
                      <div className="grid grid-cols-4 gap-2">
                        {shapes.map((shapeOption) => {
                          const isPremium = shapeOption.id !== "rectangle" && shapeOption.id !== "circle";
                          const isSelected = shape === shapeOption.id;

                          return (
                            <button
                              key={shapeOption.id}
                              type="button"
                              onClick={() => {
                                if (isPremium && !paid) {
                                  // Allow preview, but note that HD export requires payment
                                  setShape(shapeOption.id);
                                } else {
                                  setShape(shapeOption.id);
                                }
                              }}
                              className={`flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-xs font-semibold transition hover:-translate-y-[1px] hover:shadow-md ${
                                isSelected
                                  ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 shadow-amber-500/20"
                                  : "border-white/15 bg-white/5 text-white hover:border-amber-400/50"
                              }`}
                            >
                              <span className="text-2xl mb-1" style={{ transform: shapeSymbolScale[shapeOption.id] }}>
                                {shapeSymbols[shapeOption.id]}
                              </span>
                              <span className="text-[10px]">{shapeOption.label}</span>
                              {isPremium && (
                                <span className="text-[9px] text-amber-400 mt-0.5">HD only</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="rounded-xl border border-white/10 bg-white/5 p-2.5 shadow-inner shadow-black/20">
                      <h3 className="text-xs font-semibold text-white mb-2">Frame</h3>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: "square" as const, label: "Square" },
                          { id: "4:5" as const, label: "Poster" },
                          { id: "2:3" as const, label: "Wide" },
                        ].map((ratio) => {
                          const isSelected = aspectRatio === ratio.id;

                          return (
                            <button
                              key={ratio.id}
                              type="button"
                              onClick={() => setAspectRatio(ratio.id)}
                              className={`flex flex-col items-center justify-center rounded-lg border px-2 py-2.5 text-xs font-semibold transition hover:-translate-y-[1px] hover:shadow-md ${
                                isSelected
                                  ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 shadow-amber-500/20"
                                  : "border-white/15 bg-white/5 text-white hover:border-amber-400/50"
                              }`}
                            >
                              <span className="text-[10px]">{ratio.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </div>
              </div>
            </div>

            <div ref={previewRef} id="preview" className="flex w-full flex-col gap-3 pb-4 lg:pb-0 order-1 lg:order-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-100 shadow-sm shadow-black/30">
                <p className="font-semibold text-white">Matches professional planetarium accuracy (Yale catalogs + skyfield).</p>
                <Link href="#accuracy" className="mt-2 inline-flex text-sm font-semibold text-amber-300 hover:underline">
                  Learn how accuracy works →
                </Link>
              </div>
              <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0b0f24]/90 p-3 shadow-xl shadow-black/30 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Preview</h3>
                  <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                    {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
                  </div>
                </div>
                <div
                  className="relative mx-auto overflow-hidden"
                  style={{
                    width: "100%",
                    maxWidth: "600px",
                    aspectRatio: "1/1",
                    ...(revealed
                      ? {}
                      : {
                          backgroundColor: "#0b0f3b",
                          backgroundImage:
                            "url('/ribbon-overlay.png'), radial-gradient(circle at 50% 65%, rgba(28, 34, 94, 0.55), rgba(7, 9, 26, 0.98))",
                          backgroundRepeat: "no-repeat, no-repeat",
                          backgroundSize: "100% auto, cover",
                          backgroundPosition: "center 26px, center",
                        }),
                  }}
                >
                  <div
                    className={`relative flex flex-col rounded-xl ${
                      revealed ? "" : "bg-transparent"
                    } transition-opacity duration-200 ${isUpdating ? "opacity-80" : "opacity-100"}`}
                    style={{ height: "100%" }}
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
                          ✨ Show my star map
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
                              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                              Rendering sky…
                            </div>
                            <div className="pointer-events-none absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0)_100%)] bg-[length:200%_100%] opacity-60" style={{ animationDuration: '1.5s' }} />
                          </div>
                        )}
                        <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                          {isUpdating ? "Rendering…" : "Updated ✓"}
                        </div>
                        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5" />
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
                {revealed && (
                  <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-start">
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
                    <Link
                      href="/refine"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/50 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-200 shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      ⚙️ Fine-tune design
                    </Link>
                  </div>
                )}

                {revealed && (
                  <>
                    {/* Accuracy micro-explainer */}
                    <div className="mt-3 rounded-lg border border-amber-200/30 bg-amber-50/10 p-3 text-xs text-white">
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

                    {/* Free vs HD comparison */}
                    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-neutral-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="font-semibold text-white">Free Preview</p>
                          <ul className="mt-1 space-y-0.5">
                            <li>• 1200px resolution</li>
                            <li>• Watermark</li>
                            <li>• Screen sharing</li>
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-amber-300">HD Export</p>
                          <ul className="mt-1 space-y-0.5">
                            <li>• 6000px (6x larger)</li>
                            <li>• No watermark</li>
                            <li>• Print-ready</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>

              {!paid && revealed && (
                <section className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/95 to-amber-100/95 p-3 shadow-xl backdrop-blur">
                  <div className="flex h-full flex-col justify-between space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-base font-bold text-midnight">Unlock HD Export</h3>
                        {pricing.promoActive && pricing.promoAmountCents != null ? (
                          <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white shadow-md">
                            <span className="line-through opacity-80">{basePriceLabel}</span>{" "}
                            {activePriceLabel}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white shadow-md">
                            {activePriceLabel}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1 text-xs text-neutral-700">
                        <li className="flex items-start gap-1.5">
                          <span className="text-amber-600">✓</span>
                          <span>6000px HD resolution</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-amber-600">✓</span>
                          <span>No watermark</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-amber-600">✓</span>
                          <span>Instant download</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-amber-600">✓</span>
                          <span>One-time payment</span>
                        </li>
                      </ul>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingExport("hd");
                        setPaywallOpen(true);
                        setCheckoutError(null);
                        track("paywall_opened", { visualMode: renderOptions.visualMode, source: "unlock_card" });
                      }}
                      className="w-full rounded-full bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
                    >
                      Unlock Now
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
        </div>
          ) : (
            /* Mobile: Use MobileCreate component */
            <div key="mobile">
              <MobileCreate
                onExport={handleExport}
                onShareImage={handleShareImage}
                onShare={handleShare}
                paywallOpen={paywallOpen}
                canvasReady={canvasReady}
              />
            </div>
          )}
      </section>
      {paywallOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-[rgba(247,241,227,0.95)] p-5 shadow-2xl shadow-black/25">
            <h3 className="text-lg font-semibold text-midnight">Download your print-ready star map</h3>
            <ul className="mt-3 space-y-1 text-sm text-neutral-700">
              <li>• 6000px high resolution (poster quality)</li>
              <li>• No watermark</li>
              <li>• Instant digital download</li>
              <li>
                • One-time payment —{" "}
                {pricing.promoActive && pricing.promoAmountCents != null ? (
                  <span>
                    <span className="line-through opacity-70">{basePriceLabel}</span>{" "}
                    <span className="font-semibold text-amber-800">{activePriceLabel}</span>
                  </span>
                ) : (
                  <span className="font-semibold text-amber-800">{activePriceLabel}</span>
                )}{" "}
                {pricing.currency.toUpperCase()}
              </li>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#0b1a30] via-[#050b18] to-[#0b1a30]">
          <button
            type="button"
            onClick={() => {
              setIsFullscreen(false);
              requestAnimationFrame(() => {
                previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
            className="absolute left-4 top-4 z-10 rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-4 py-2 text-sm font-semibold text-neutral-800 shadow transition hover:-translate-y-[1px] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30] sm:left-6 sm:top-6"
            aria-label="Exit fullscreen"
          >
            ⤡ Exit fullscreen
          </button>
          <div className="relative w-[95vw] h-[95vh] max-w-[95vw] max-h-[95vh] flex items-center justify-center">
            <PreviewCanvas fullscreen />
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
                a: `Free: basic preview and watermarked export. Premium (${activePriceLabel} one-time): HD no-watermark PNG/PDF and advanced visuals.`,
              },
              {
                q: "How do I export or download my star map?",
                a: "After premium unlock, download a high-resolution PNG or PDF directly from the app.",
              },
              {
                q: "Is this a one-time purchase or subscription?",
                a: `One-time ${activePriceLabel} unlock per device/browser, stored locally—no subscriptions.`,
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
              .slice(0, 6)
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
          Early access: We're building reviews organically based on real customer experiences.
        </p>
      </section>
    </main>
  );
}
