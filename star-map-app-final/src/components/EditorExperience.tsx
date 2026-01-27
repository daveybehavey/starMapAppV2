"use client";

import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import FontSelector from "@/components/FontSelector";
import { MobileCreate } from "@/app/MobileCreate";
import { TextBox, useStore, RenderOptions, StyleId } from "@/lib/store";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap } from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";
import type { AspectRatio, Shape } from "@/lib/types";
import { track } from "@/lib/analytics";
import { formatPrice, getPricingInfo } from "@/lib/pricing";
import { occasionPresets } from "@/lib/occasionPresets";
import { renderModes, type RenderModeId } from "@/lib/renderModes";
import {
  styles,
  fontOptions,
  visualModes,
  shapes,
  shapeSymbols,
  shapeSymbolScale,
  constellationPresets,
} from "@/lib/config";
import { proPresets } from "@/lib/proPresets";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useShallow } from "zustand/react/shallow";
import { useIsDesktop } from "@/hooks/useIsDesktop";

const DRAFT_KEY = "star-map-draft";
const AUTO_EXPORT_KEY = "star-map-auto-export";
const REVEALED_FLAG = "star-map-last-revealed";

export type EditorExperienceVariant = "quick" | "full";

interface EditorExperienceProps {
  variant?: EditorExperienceVariant;
  editorRef?: RefObject<HTMLDivElement | null>;
}

export function EditorExperience({ variant = "quick", editorRef }: EditorExperienceProps) {
  const {
    dateTime,
    textBoxes,
    selectedStyle,
    aspectRatio,
    shape,
    renderOptions,
    previewFidelity,
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
    setPreviewFidelity,
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
      previewFidelity: state.previewFidelity,
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
      setPreviewFidelity: state.setPreviewFidelity,
      setPaid: state.setPaid,
      setRevealed: state.setRevealed,
      setTextBoxes: state.setTextBoxes,
    })),
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __ZUSTAND_STORE__?: typeof useStore }).__ZUSTAND_STORE__ = useStore;
    }
  }, []);

  const isQuick = variant === "quick";
  const router = useRouter();
  const internalEditorRef = useRef<HTMLDivElement>(null);
  const editorSectionRef = editorRef ?? internalEditorRef;

  const [mounted, setMounted] = useState(false);
  const [pricing, setPricing] = useState(() => getPricingInfo());
  const [activePriceLabel, setActivePriceLabel] = useState("$0.99");
  const [basePriceLabel, setBasePriceLabel] = useState("$0.99");

  useEffect(() => {
    setMounted(true);
    const pricingInfo = getPricingInfo();
    setPricing(pricingInfo);
    setActivePriceLabel(formatPrice(pricingInfo.activeAmountCents, pricingInfo.currency));
    setBasePriceLabel(formatPrice(pricingInfo.baseAmountCents, pricingInfo.currency));
  }, []);

  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() => ({
    dateLocation: false,
    textStyling: false,
    style: false,
    shape: false,
    frame: false,
    advanced: true,
  }));
  const [collapsedTextBoxes, setCollapsedTextBoxes] = useState<Record<string, boolean>>(() => ({
    subtitle: true,
    dedication: true,
  }));
  const [restored, setRestored] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [, setPendingExport] = useState<"preview" | "hd" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [autoExportPending, setAutoExportPending] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const searchParams = useSearchParams();
  const isDesktopQuery = useIsDesktop();
  const [renderMode, setRenderMode] = useState<RenderModeId>("cinematic");

  useEffect(() => {
    setCollapsedTextBoxes((prev) => {
      const next: Record<string, boolean> = {};
      textBoxes.forEach((box) => {
        if (prev.hasOwnProperty(box.id)) {
          next[box.id] = prev[box.id];
          return;
        }
        next[box.id] = box.id === "subtitle" || box.id === "dedication";
      });
      return next;
    });
  }, [textBoxes]);

  // Test-only override for deterministic Playwright testing
  // In production, force will be null and normal responsive behavior applies
  const forceViewport = searchParams.get("force");
  const isDesktop = forceViewport === "desktop" ? true : forceViewport === "mobile" ? false : isDesktopQuery;
  const editorReady = mounted || Boolean(forceViewport);

  const [intensity, setIntensity] = useState(isQuick ? 70 : 50);
  const [intensityDisplay, setIntensityDisplay] = useState(isQuick ? 70 : 50);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [showAdvancedState, setShowAdvancedState] = useState(!isQuick);
  const showAdvanced = isQuick ? false : showAdvancedState;
  const locationName = location.name?.trim() ?? "";
  const hasDate = Number.isFinite(new Date(dateTime).getTime());
  const canReveal = Boolean(locationName) && hasDate;
  const previewRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const presetRailRef = useRef<HTMLDivElement>(null);
  const dateLocationRef = useRef<HTMLDivElement>(null);
  const [presetHint, setPresetHint] = useState<string | null>(null);
  const presetHintTimerRef = useRef<number | null>(null);
  const [customOccasion, setCustomOccasion] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const handleStartPreset = useCallback(() => {
    presetRailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const handleStartScratch = useCallback(() => {
    setSelectedOccasion(null);
    setCustomOccasion(false);
    setRevealed(false);
    dateLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setRevealed]);

  const handleDateTimeChange = useCallback(
    (iso: string) => {
      setDateTime(iso);
      setCustomOccasion(true);
      if (selectedOccasion) {
        setSelectedOccasion(null);
      }
    },
    [selectedOccasion, setDateTime],
  );

  const handleLocationChange = useCallback(() => {
    setCustomOccasion(true);
    if (selectedOccasion) {
      setSelectedOccasion(null);
    }
  }, [selectedOccasion]);

  const refreshPaidStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/premium", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as { paid?: boolean };
      const nextPaid = Boolean(data.paid);
      setPaid(nextPaid);
      return nextPaid;
    } catch {
      return false;
    }
  }, [setPaid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        // Draft may be from older versions with shapeMask in renderOptions
        type DraftData = ReturnType<typeof buildRecipeFromState> & {
          shape?: Shape;
          selectedOccasion?: string | null;
          renderOptions?: ReturnType<typeof buildRecipeFromState>["renderOptions"] & {
            shapeMask?: string;
          };
        };
        const parsed = JSON.parse(draft) as DraftData;
        if (parsed.datetimeISO) setDateTime(parsed.datetimeISO);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.textBoxes?.length) setTextBoxes(parsed.textBoxes);
        if (parsed.selectedStyle) setStyle(parsed.selectedStyle);
        if (parsed.aspectRatio) setAspectRatio(parsed.aspectRatio);
        if (parsed.selectedOccasion) {
          setSelectedOccasion(parsed.selectedOccasion);
          setCustomOccasion(false);
        } else if (parsed.location?.name) {
          setCustomOccasion(true);
        }
        // Handle both new (shape) and legacy (renderOptions.shapeMask) formats
        const shapeValue = parsed.shape ?? parsed.renderOptions?.shapeMask;
        if (shapeValue && ["rectangle", "heart", "circle", "star", "diamond"].includes(shapeValue)) {
          setShape(shapeValue as Shape);
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
    void refreshPaidStatus();
  }, [
    setDateTime,
    setLocation,
    setRenderOptions,
    setRevealed,
    setStyle,
    setTextBoxes,
    setAspectRatio,
    setShape,
    refreshPaidStatus,
  ]);

  useEffect(() => {
    if (!autoExportPending || paid) return;
    void refreshPaidStatus();
  }, [autoExportPending, paid, refreshPaidStatus]);

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
    const draft = { ...recipe, selectedOccasion };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [aspectRatio, dateTime, location, renderOptions, restored, selectedOccasion, selectedStyle, shape, textBoxes]);

  useEffect(() => {
    return () => {
      if (presetHintTimerRef.current) {
        window.clearTimeout(presetHintTimerRef.current);
        presetHintTimerRef.current = null;
      }
    };
  }, []);

  const toggleCard = (id: string) =>
    setCollapsedCards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));

  const setCardState = (updates: Record<string, boolean>) =>
    setCollapsedCards((prev) => ({ ...prev, ...updates }));

  const handleReveal = useCallback(() => {
    if (!canReveal || !hasDate) {
      inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setRevealed(true);
    // Auto-collapse Date & Location after generating map
    setCollapsedCards((prev) => ({ ...prev, dateLocation: true }));
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
      const constellationLines: RenderOptions["constellationLines"] =
        mode === "blueprint" ? "thick" : "thin";
      const planetEmphasis: RenderOptions["planetEmphasis"] = cfg.contrast > 1.15 ? "highlighted" : "normal";

      setRenderOptions({
        starIntensity,
        starGlow,
        visualMode,
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
      const preset = occasionPresets.find((item) => item.id === id);
      if (!preset) return;
      const shouldAutofill = !locationName || !hasDate;
      setSelectedOccasion(id);
      setCustomOccasion(false);
      track("occasion_selected", { preset: id, autofill: shouldAutofill });

      // Always apply style, shape, textBoxes, and render options from preset
      setTextBoxes(preset.textBoxes);
      setStyle(preset.style);
      setShape(preset.shape);
      setRenderMode(preset.renderMode);
      // Intensity is already on 0-100 scale
      setIntensity(preset.intensity);
      setIntensityDisplay(preset.intensity);
      applyVisualOptions(preset.renderMode, preset.intensity);

      if (shouldAutofill) {
        // Also set date/location if user hasn't entered them yet
        setDateTime(preset.dateTimeISO);
        setLocation(preset.location as Parameters<typeof setLocation>[0]);
        setPresetHint("Preset applied — edit date or location anytime.");
      } else {
        setPresetHint("Preset applied — date and location preserved.");
      }
      setRevealed(true);

      if (presetHintTimerRef.current) {
        window.clearTimeout(presetHintTimerRef.current);
      }
      presetHintTimerRef.current = window.setTimeout(() => {
        setPresetHint(null);
        presetHintTimerRef.current = null;
      }, 2400);
    },
    [
      applyVisualOptions,
      hasDate,
      locationName,
      setDateTime,
      setLocation,
      setRevealed,
      setShape,
      setStyle,
      setTextBoxes,
    ],
  );

  const applySampleMoment = useCallback(() => {
    const preset = occasionPresets.find((item) => item.id === "wedding") ?? occasionPresets[0];
    if (!preset) return;
    setSelectedOccasion(preset.id);
    setCustomOccasion(false);
    setDateTime(preset.dateTimeISO);
    setLocation(preset.location as Parameters<typeof setLocation>[0]);
    setTextBoxes(preset.textBoxes);
    setStyle(preset.style);
    setShape(preset.shape);
    setRenderMode(preset.renderMode);
    // Intensity is already on 0-100 scale
    setIntensity(preset.intensity);
    setIntensityDisplay(preset.intensity);
    applyVisualOptions(preset.renderMode, preset.intensity);
    setRevealed(true);
    track("sample_moment_applied", { preset: preset.id });
    dateLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [
    applyVisualOptions,
    setDateTime,
    setLocation,
    setRevealed,
    setShape,
    setStyle,
    setTextBoxes,
  ]);

  const applyProPreset = useCallback(
    (id: string) => {
      const preset = proPresets.find((entry) => entry.id === id);
      if (!preset) return;
      // Pro presets retain their intended renderMode and intensity for visual fidelity
      setSelectedOccasion(id);
      setCustomOccasion(false);
      setStyle(preset.style);
      setShape(preset.shape);
      setAspectRatio(preset.aspectRatio);
      setTextBoxes(preset.textBoxes);
      setRenderMode(preset.renderMode);
      setIntensity(preset.intensity);
      setIntensityDisplay(preset.intensity);
      // Apply base visual options first, then merge preset-specific overrides on top
      applyVisualOptions(preset.renderMode, preset.intensity);
      setRenderOptions(preset.renderOptions);
      track("pro_preset_selected", { preset: id });
    },
    [
      applyVisualOptions,
      setAspectRatio,
      setRenderMode,
      setRenderOptions,
      setShape,
      setStyle,
      setTextBoxes,
    ],
  );

  const exportImage = useCallback(
    async (mode: "preview" | "hd", premiumOverride?: boolean) => {
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
          console.warn("Invalid shape viewBox height");
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
      const premium = premiumOverride ?? paid;

      // Render the map
      await renderStarMap({
        recipe,
        canvas,
        width,
        height,
        watermark,
        quality: mode === "hd" ? "export" : "preview",
        premium,
      });

      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = mode === "hd" ? "star-map-hd.png" : "star-map-preview.png";
      link.href = url;
      link.click();
    },
    [aspectRatio, dateTime, location, paid, renderOptions, selectedStyle, shape, textBoxes],
  );

  useEffect(() => {
    if (!restored || !autoExportPending || !paid) return;
    setRevealed(true);
  }, [autoExportPending, paid, restored, setRevealed]);

  // Intentionally no auto-scroll on auto-export to avoid unexpected page jumps.

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
    async (mode: "preview" | "hd") => {
      let hasAccess = paid;
      if (mode === "hd" && !paid) {
        hasAccess = await refreshPaidStatus();
        if (!hasAccess) {
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
      }
      track(mode === "hd" ? "export_hd_clicked" : "export_free_clicked", {
        isPaid: hasAccess,
        visualMode: renderOptions.visualMode,
        exportResolution: mode === "hd" ? 6000 : 1200,
      });
      track("export_download", { type: mode === "hd" ? "hd" : "preview" });
      exportImage(mode, hasAccess).catch(() => {});
    },
    [exportImage, paid, refreshPaidStatus, renderOptions.visualMode, revealed],
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
        console.warn("Invalid shape viewBox height");
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
      premium: paid,
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

  const handleCustomizeMore = useCallback(() => {
    if (isQuick) {
      router.push("/editor");
      return;
    }
    setShowAdvancedState(true);
    requestAnimationFrame(() => handleEditScroll());
  }, [handleEditScroll, isQuick, router]);

  const showGuidedForm = !revealed || !showAdvanced;
  const showEditor = revealed && showAdvanced;
  const visibleTextBoxes = showGuidedForm ? textBoxes.slice(0, 1) : textBoxes;
  const cardIds = ["dateLocation", "textStyling", "style", "shape", "frame", "advanced"] as const;
  const allCardsCollapsed = cardIds.every((id) => collapsedCards[id]);

  return (
    <>
      <section
        ref={editorSectionRef}
        id="editor"
        className="mx-auto w-full max-w-7xl lg:max-w-none py-12 sm:py-14 lg:py-12"
        data-force={forceViewport || "none"}
        data-is-desktop={String(isDesktop)}
      >
        {/* Conditional rendering with key to force React to replace tree */}
        {!editorReady ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-neutral-300 shadow-sm shadow-black/30">
            Loading editor…
          </div>
        ) : isDesktop ? (
          <div key="desktop" data-component="desktop">
            <div className="space-y-4 lg:h-full font-[var(--font-montserrat)] text-neutral-100 text-[13px]">
              {/* Header section - above the grid */}
              {(showGuidedForm || showEditor) && (
                <div ref={inputsRef} className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d7b56c]">Create your star map</p>
                    <h2 className="text-3xl font-semibold text-white sm:text-4xl font-[var(--font-playfair)] tracking-tight">
                      Design your sky in seconds
                    </h2>
                    <p className="text-base text-neutral-200 sm:text-lg">
                      Start from a preset, fine-tune the details, and see a finished map before you unlock.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleStartPreset}
                        className="rounded-full border border-amber-200/40 bg-amber-100/10 px-4 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:border-amber-200/70 hover:bg-amber-100/20"
                      >
                        Start with a preset
                      </button>
                      <button
                        type="button"
                        onClick={handleStartScratch}
                        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:border-white/30 hover:bg-white/10"
                      >
                        Start from scratch
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={applySampleMoment}
                      className="w-fit text-xs font-semibold text-amber-200/80 underline decoration-amber-200/40 underline-offset-4 transition hover:text-amber-100"
                    >
                      Try a sample moment
                    </button>
                    <p className="text-xs text-neutral-300">
                      Preset optional · Add date + location · Add a line of text → Preview
                    </p>
                  </div>

                  <div
                    ref={presetRailRef}
                    className="hidden lg:block rounded-2xl border border-[#d7b56c]/15 bg-[#0b1024]/85 p-3 shadow-lg backdrop-blur-sm ring-1 ring-white/5"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-neutral-300">Choose an occasion (optional)</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                          Presets optional
                        </span>
                        {customOccasion && (
                          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                            Custom
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        {occasionPresets.map((preset) => {
                          const occasionStyles = {
                            wedding:
                              "border-pink-300/40 bg-gradient-to-br from-pink-100/15 to-rose-100/15 text-pink-100 hover:border-pink-300/60 hover:bg-pink-100/20",
                            anniversary:
                              "border-amber-300/40 bg-gradient-to-br from-amber-100/15 to-orange-100/15 text-amber-100 hover:border-amber-300/60 hover:bg-amber-100/20",
                            birthday:
                              "border-cyan-300/40 bg-gradient-to-br from-cyan-100/15 to-blue-100/15 text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-100/20",
                            birth:
                              "border-green-300/40 bg-gradient-to-br from-green-100/15 to-emerald-100/15 text-green-100 hover:border-green-300/60 hover:bg-green-100/20",
                            memorial:
                              "border-purple-300/40 bg-gradient-to-br from-purple-100/15 to-violet-100/15 text-purple-100 hover:border-purple-300/60 hover:bg-purple-100/20",
                            graduation:
                              "border-yellow-300/40 bg-gradient-to-br from-yellow-100/15 to-amber-100/15 text-yellow-100 hover:border-yellow-300/60 hover:bg-yellow-100/20",
                          };

                          const occasionEmojis = {
                            wedding: "💍",
                            anniversary: "❤️",
                            birthday: "🎉",
                            birth: "👶",
                            memorial: "🕊️",
                            graduation: "🎓",
                          };

                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyPreset(preset.id)}
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:scale-95 ${
                                occasionStyles[preset.id as keyof typeof occasionStyles]
                              } ${selectedOccasion === preset.id ? "ring-2 ring-amber-300/70 btn-selection-pulse btn-selected-glow" : ""}`}
                            >
                              {occasionEmojis[preset.id as keyof typeof occasionEmojis]} {preset.label}
                            </button>
                          );
                        })}
                      </div>
                      {showEditor && (
                        <div className="flex flex-wrap gap-2">
                          {[
                            { id: "classic", label: "Classic", premium: false },
                            { id: "cinematic", label: "Enhanced", premium: true },
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
                                    ? Math.max(intensityDisplay, 60)
                                    : intensityDisplay;
                                setRenderMode(mode.id as RenderModeId);
                                setIntensity(targetLevel);
                                setIntensityDisplay(targetLevel);
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow active:scale-95 ${
                                renderMode === mode.id
                                  ? "border-amber-400 bg-amber-200 !text-midnight btn-selection-pulse btn-selected-glow"
                                  : "border-white/20 bg-white/10 text-white"
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
                      )}
                    </div>
                    {presetHint && <p className="mt-2 text-xs text-amber-100/80">{presetHint}</p>}

                    {showEditor && (
                      <div className="mt-2 rounded-xl border border-white/15 bg-white/5 px-2.5 py-2 shadow-inner shadow-black/30 backdrop-blur-sm">
                        <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                          <span>Intensity</span>
                          <span className="text-[10px] font-semibold text-amber-200/70">{intensityDisplay}%</span>
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
                          aria-label="Star intensity"
                          aria-valuetext={`Intensity: ${intensityDisplay}%`}
                          className="mt-1 w-full accent-amber-400"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Main grid - Pro Presets + Form on left, Preview on right */}
              <div
                className={`grid gap-3 lg:gap-4 ${
                  showGuidedForm || showEditor
                    ? "lg:grid-cols-[3fr_2fr] lg:items-start"
                    : "lg:grid-cols-1"
                }`}
              >
                {(showGuidedForm || showEditor) && (
                  <div className="w-full">
                    <div className="space-y-2">
                    {/* Date & Location - FIRST (required input) */}
                    {(showGuidedForm || showEditor) && (
                      <section
                        ref={dateLocationRef}
                        className="hidden lg:block rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-sm shadow-black/30 backdrop-blur-sm"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCard("dateLocation")}
                          aria-expanded={!collapsedCards.dateLocation}
                          className="flex w-full items-center justify-between text-left mb-1.5"
                        >
                          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                            Date & Location
                          </h3>
                          <span className="text-[11px] font-semibold text-amber-200/70">
                            {collapsedCards.dateLocation ? "Show" : "Hide"}
                          </span>
                        </button>
                        {!collapsedCards.dateLocation && (
                          <div className="grid gap-2 md:grid-cols-2">
                            <LocationSearch onLocationChange={handleLocationChange} />
                            <DateTimeControls dateTime={dateTime} onChange={handleDateTimeChange} />
                          </div>
                        )}
                      </section>
                    )}

                    {/* Pro Presets - SECOND (optional styling) */}
                    {(showGuidedForm || showEditor) && (
                      <div className="hidden lg:block rounded-2xl border border-white/15 bg-white/5 p-3 shadow-sm shadow-black/30 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-amber-100/90">Pro Presets</h3>
                            <p className="text-xs text-neutral-200/80">Curated looks with balanced typography.</p>
                          </div>
                          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-100/80">
                            New
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 lg:grid-cols-4">
                          {proPresets.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyProPreset(preset.id)}
                              className={`group overflow-hidden rounded-xl border bg-[#0b0f24]/80 text-left shadow-sm transition hover:-translate-y-[2px] hover:border-[#d7b56c]/40 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)] ${
                                selectedOccasion === preset.id
                                  ? "border-amber-300/70 ring-1 ring-amber-300/30"
                                  : "border-white/10"
                              }`}
                            >
                              <div className="relative aspect-[4/5] overflow-hidden">
                                <Image
                                  src={preset.thumbnail}
                                  alt={preset.label}
                                  fill
                                  loading="lazy"
                                  className="object-cover transition duration-300 group-hover:scale-[1.02]"
                                  sizes="(min-width: 1024px) 180px, 45vw"
                                />
                              </div>
                              <div className="border-t border-white/10 px-3 py-2">
                                <div className="text-sm font-semibold text-white">{preset.label}</div>
                                <div className="text-xs text-neutral-300">{preset.note}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    </div>

                    {/* Your Message + Editor sections */}
                    {(showGuidedForm || showEditor) && (
                      <div className="mt-2 space-y-2">

                        {showGuidedForm && (
                          <div className="space-y-2">
                            <section className="rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-sm shadow-black/30 backdrop-blur-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <span className="text-amber-300">✎</span>
                                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                                  Your Message
                                </h3>
                              </div>
                              <div className="space-y-3">
                                {visibleTextBoxes.map((box) => (
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
                            {!revealed && (
                              <button
                                type="button"
                                onClick={handleReveal}
                                disabled={!canReveal}
                                aria-label="Generate preview"
                                className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30] ${
                                  canReveal
                                    ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                                    : "cursor-not-allowed bg-neutral-400/60 text-neutral-700 shadow-none"
                                }`}
                              >
                                Generate preview
                              </button>
                            )}
                            {!revealed && (
                              <div className="space-y-1 text-xs text-neutral-400">
                                <p>Add date + location to unlock your preview. Presets optional.</p>
                                <p className="text-[11px] text-neutral-500">Free preview, HD optional.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {showEditor && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-start">
                              <button
                                type="button"
                                onClick={() =>
                                  setCardState(
                                    allCardsCollapsed
                                      ? {
                                          dateLocation: false,
                                          textStyling: false,
                                          style: false,
                                          shape: false,
                                          frame: false,
                                          advanced: false,
                                        }
                                      : {
                                          dateLocation: true,
                                          textStyling: true,
                                          style: true,
                                          shape: true,
                                          frame: true,
                                          advanced: true,
                                        }
                                  )
                                }
                                className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition hover:border-amber-300/60"
                              >
                                {allCardsCollapsed ? "Expand all" : "Collapse all"}
                              </button>
                            </div>

                            <div className="w-full flex flex-col gap-2">
                              <div
                                className={`flex flex-col gap-2 ${
                                  collapsedCards.textStyling ? "" : "lg:flex-row"
                                }`}
                              >
                                <div
                                  className={`flex flex-col gap-2 ${
                                    collapsedCards.textStyling ? "" : "lg:w-1/2"
                                  }`}
                                >
                                  <section className="rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-inner shadow-black/20 backdrop-blur-sm">
                                    <button
                                      type="button"
                                      onClick={() => toggleCard("textStyling")}
                                      aria-expanded={!collapsedCards.textStyling}
                                      className="flex w-full items-center justify-between text-left"
                                    >
                                      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                                        Text Styling
                                      </h3>
                                      <span className="text-[11px] font-semibold text-amber-200/70">
                                        {collapsedCards.textStyling ? "Show" : "Hide"}
                                      </span>
                                    </button>
                              {!collapsedCards.textStyling && (
                                <div className="mt-2 space-y-3">
                                  {textBoxes.map((box) => {
                                    const isCollapsed = collapsedTextBoxes[box.id] ?? false;

                                    return (
                                      <div key={box.id} className="rounded-lg border border-white/15 bg-white/5 p-3 space-y-2 backdrop-blur-sm">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-semibold text-white">{box.label}</span>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setCollapsedTextBoxes((prev) => ({
                                                  ...prev,
                                                  [box.id]: !isCollapsed,
                                                }))
                                              }
                                              aria-expanded={!isCollapsed}
                                              aria-controls={`text-style-${box.id}`}
                                              className="text-[10px] font-semibold text-amber-200/70 hover:text-amber-200"
                                            >
                                              {isCollapsed ? "Show" : "Hide"}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => removeTextBox(box.id)}
                                              className="text-[10px] text-rose-300 hover:text-rose-200"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        </div>
                                        {!isCollapsed && (
                                          <div id={`text-style-${box.id}`} className="space-y-2">
                                            <input
                                              type="text"
                                              value={box.text}
                                              onChange={(e) => updateTextBox(box.id, { text: e.target.value })}
                                              className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-xs text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                                              placeholder={`Enter ${box.label.toLowerCase()}...`}
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="space-y-1">
                                                <label className="text-[10px] text-neutral-300">Font</label>
                                                <select
                                                  value={box.fontFamily}
                                                  onChange={(e) => {
                                                    const next = e.target.value as TextBox["fontFamily"];
                                                    const fontMeta = fontOptions.find((opt) => opt.id === next);
                                                    if (fontMeta?.premium && !paid) {
                                                      setPaywallOpen(true);
                                                      return;
                                                    }
                                                    updateTextBox(box.id, { fontFamily: next });
                                                  }}
                                                  className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                                                  style={{ color: 'white' }}
                                                >
                                                  {fontOptions.map((opt) => (
                                                    <option key={opt.id} value={opt.id} style={{ color: '#111827' }}>
                                                      {opt.premium ? `🔒 ${opt.label}` : opt.label}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div className="space-y-1">
                                                <label className="text-[10px] text-neutral-300">Size</label>
                                                <input
                                                  type="number"
                                                  min={10}
                                                  max={64}
                                                  value={box.size}
                                                  onChange={(e) => updateTextBox(box.id, { size: Number(e.target.value) })}
                                                  className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                                                />
                                              </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="space-y-1">
                                                <label className="text-[10px] text-neutral-300">Color</label>
                                                <input
                                                  type="color"
                                                  value={box.color}
                                                  onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                                                  className="w-full h-8 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                                                />
                                              </div>
                                              <div className="space-y-1">
                                                <label className="text-[10px] text-neutral-300">Align</label>
                                                <select
                                                  value={box.align}
                                                  onChange={(e) =>
                                                    updateTextBox(box.id, { align: e.target.value as TextBox["align"] })
                                                  }
                                                  className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                                                  style={{ color: 'white' }}
                                                >
                                                  <option value="left" style={{ color: '#111827' }}>Left</option>
                                                  <option value="center" style={{ color: '#111827' }}>Center</option>
                                                  <option value="right" style={{ color: '#111827' }}>Right</option>
                                                </select>
                                              </div>
                                            </div>
                                            <div className="flex gap-2">
                                              <button
                                                type="button"
                                                onClick={() => updateTextBox(box.id, { textShadow: !box.textShadow })}
                                                className={`flex-1 rounded-md border px-3 py-1.5 text-[10px] font-semibold transition ${
                                                  box.textShadow
                                                    ? "border-amber-300 bg-amber-100 !text-midnight"
                                                    : "border-white/15 bg-white/10 text-white"
                                                }`}
                                              >
                                                Shadow
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => updateTextBox(box.id, { textGlow: !box.textGlow })}
                                                className={`flex-1 rounded-md border px-3 py-1.5 text-[10px] font-semibold transition ${
                                                  box.textGlow
                                                    ? "border-amber-300 bg-amber-100 !text-midnight"
                                                    : "border-white/15 bg-white/10 text-white"
                                                }`}
                                              >
                                                Glow
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    onClick={addTextBox}
                                    className="w-full rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
                                  >
                                    + Add Text Line
                                  </button>
                                </div>
                              )}
                                  </section>

                                </div>
                                <div
                                  className={`flex flex-col gap-2 ${
                                    collapsedCards.textStyling ? "" : "lg:w-1/2"
                                  }`}
                                >
                                  <section className="rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-inner shadow-black/20 backdrop-blur-sm">
                                    <button
                                      type="button"
                                      onClick={() => toggleCard("style")}
                                      aria-expanded={!collapsedCards.style}
                                      className="flex w-full items-center justify-between text-left"
                                    >
                                      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                                        Style
                                      </h3>
                                      <span className="text-[11px] font-semibold text-amber-200/70">
                                        {collapsedCards.style ? "Show" : "Hide"}
                                      </span>
                                    </button>
                                    {!collapsedCards.style && (
                                      <div className="mt-2 grid grid-cols-1 gap-2">
                                        {styles.map((style) => {
                                          const styleClasses = {
                                            navyGold:
                                              selectedStyle === style.id
                                                ? "border-amber-400 bg-gradient-to-br from-[#0d1b2a] to-[#1b2838] text-amber-300 shadow-amber-500/20"
                                                : "border-amber-500/30 bg-gradient-to-br from-[#0d1b2a]/80 to-[#1b2838]/80 text-amber-200/80 hover:border-amber-400/50",
                                            vintageEngraving:
                                              selectedStyle === style.id
                                                ? "border-amber-300 bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] text-amber-100 shadow-amber-500/20"
                                                : "border-neutral-400/30 bg-gradient-to-br from-[#2d2d2d]/80 to-[#1a1a1a]/80 text-neutral-200/80 hover:border-neutral-300/50",
                                            parchmentScroll:
                                              selectedStyle === style.id
                                                ? "border-amber-400 bg-gradient-to-br from-[#f5f0e6] to-[#e8dcc8] text-amber-900 shadow-amber-500/20"
                                                : "border-amber-500/30 bg-gradient-to-br from-[#f5f0e6]/90 to-[#e8dcc8]/90 text-amber-800/80 hover:border-amber-400/50",
                                            midnightMinimal:
                                              selectedStyle === style.id
                                                ? "border-blue-400 bg-gradient-to-br from-[#0a0a0a] to-[#1a1a2e] text-blue-300 shadow-blue-500/20"
                                                : "border-blue-500/30 bg-gradient-to-br from-[#0a0a0a]/80 to-[#1a1a2e]/80 text-blue-200/80 hover:border-blue-400/50",
                                          };

                                          return (
                                            <button
                                              key={style.id}
                                              type="button"
                                              onClick={() => setStyle(style.id)}
                                              className={`flex h-full flex-col justify-center rounded-lg border px-3 py-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:scale-[0.98] ${
                                                styleClasses[style.id as keyof typeof styleClasses]
                                              } ${selectedStyle === style.id ? "btn-selection-pulse" : ""}`}
                                            >
                                              <div className="text-sm font-semibold">{style.name}</div>
                                              <div className="text-xs opacity-80 mt-1">{style.note}</div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </section>
                                  <section className="rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-inner shadow-black/20 backdrop-blur-sm">
                                    <button
                                      type="button"
                                      onClick={() => toggleCard("shape")}
                                      aria-expanded={!collapsedCards.shape}
                                      className="flex w-full items-center justify-between text-left"
                                    >
                                      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                                        Shape
                                      </h3>
                                      <span className="text-[11px] font-semibold text-amber-200/70">
                                        {collapsedCards.shape ? "Show" : "Hide"}
                                      </span>
                                    </button>
                              {!collapsedCards.shape && (
                                <>
                                  <div className="mt-2 grid grid-cols-4 gap-2">
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
                                              ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 !text-midnight shadow-amber-500/20"
                                              : "border-white/15 bg-white/5 text-white hover:border-amber-400/50"
                                          }`}
                                        >
                                          <span className="text-2xl mb-1" style={{ transform: shapeSymbolScale[shapeOption.id] }}>
                                            {shapeSymbols[shapeOption.id]}
                                          </span>
                                          <span className="text-[10px]">{shapeOption.label}</span>
                                          {isPremium && <span className="text-[9px] text-amber-400 mt-0.5">HD only</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {shape !== "rectangle" && (
                                    <div className="mt-2 space-y-1">
                                      <label className="text-[10px] text-neutral-300">Background Color</label>
                                      <input
                                        type="color"
                                        value={renderOptions.backgroundColor || "#0b1a30"}
                                        onChange={(e) => setRenderOptions({ backgroundColor: e.target.value })}
                                        className="w-full h-8 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                                      />
                                    </div>
                                  )}
                                </>
                              )}
                                  </section>

                                  <section className="rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-inner shadow-black/20 backdrop-blur-sm">
                                    <button
                                      type="button"
                                      onClick={() => toggleCard("frame")}
                                      aria-expanded={!collapsedCards.frame}
                                      className="flex w-full items-center justify-between text-left"
                                    >
                                      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                                        Frame
                                      </h3>
                                      <span className="text-[11px] font-semibold text-amber-200/70">
                                        {collapsedCards.frame ? "Show" : "Hide"}
                                      </span>
                                    </button>
                              {!collapsedCards.frame && (
                                <>
                                  <div className="mt-2 grid grid-cols-3 gap-2">
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
                                              ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 !text-midnight shadow-amber-500/20"
                                              : "border-white/15 bg-white/5 text-white hover:border-amber-400/50"
                                          }`}
                                        >
                                          <span className="text-[10px]">{ratio.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setRenderOptions({ frameEnabled: !renderOptions.frameEnabled })}
                                    className={`mt-2 w-full rounded-md border px-3 py-2 text-xs font-semibold transition ${
                                      renderOptions.frameEnabled
                                        ? "border-amber-300 bg-amber-100 !text-midnight"
                                        : "border-white/15 bg-white/10 text-white"
                                    }`}
                                  >
                                    {renderOptions.frameEnabled ? "Frame Border On" : "Frame Border Off"}
                                  </button>
                                </>
                              )}
                                  </section>
                                </div>
                              </div>

                              <section className="rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-inner shadow-black/20 backdrop-blur-sm">
                                <button
                                  type="button"
                                  onClick={() => toggleCard("advanced")}
                                  aria-expanded={!collapsedCards.advanced}
                                  className="flex w-full items-center justify-between text-left"
                                >
                                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                                    Advanced
                                  </h3>
                                  <span className="text-[11px] font-semibold text-amber-200/70">
                                    {collapsedCards.advanced ? "Show" : "Hide"}
                                  </span>
                                </button>
                              {!collapsedCards.advanced && (
                                <div className="mt-2 space-y-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] text-neutral-300">Constellation Lines</label>
                                    <div className="grid grid-cols-3 gap-2">
                                      {constellationPresets.map((preset) => (
                                        <button
                                          key={preset.id}
                                          type="button"
                                          onClick={() => setRenderOptions({ constellationLines: preset.id })}
                                          className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                                            renderOptions.constellationLines === preset.id
                                              ? "border-amber-300 bg-amber-100 !text-midnight"
                                              : "border-white/15 bg-white/10 text-white"
                                          }`}
                                        >
                                          {preset.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {renderOptions.constellationLines !== "off" && (
                                    <>
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-neutral-300">Line Color</label>
                                        <input
                                          type="color"
                                          value={renderOptions.constellationColor || "#ffffff"}
                                          onChange={(e) => setRenderOptions({ constellationColor: e.target.value })}
                                          className="w-full h-8 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-neutral-300">
                                          Line Scale: {renderOptions.constellationLineScale || 1}
                                        </label>
                                        <input
                                          type="range"
                                          min={0.5}
                                          max={2}
                                          step={0.1}
                                          value={renderOptions.constellationLineScale || 1}
                                          onChange={(e) =>
                                            setRenderOptions({ constellationLineScale: Number(e.target.value) })
                                          }
                                          aria-label="Constellation line scale"
                                          aria-valuetext={`Line scale: ${renderOptions.constellationLineScale || 1}`}
                                          className="w-full accent-amber-400"
                                        />
                                      </div>
                                    </>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRenderOptions({ constellationLabels: !renderOptions.constellationLabels })
                                    }
                                    className={`w-full rounded-md border px-3 py-2 text-xs font-semibold transition ${
                                      renderOptions.constellationLabels
                                        ? "border-amber-300 bg-amber-100 !text-midnight"
                                        : "border-white/15 bg-white/10 text-white"
                                    }`}
                                  >
                                    {renderOptions.constellationLabels ? "Labels On" : "Labels Off"}
                                  </button>

                                  <div className="space-y-1">
                                    <label className="text-[10px] text-neutral-300">Visual Mode</label>
                                    <div className="grid grid-cols-3 gap-2">
                                      {visualModes.map((mode) => (
                                        <button
                                          key={mode.id}
                                          type="button"
                                          onClick={() => setRenderOptions({ visualMode: mode.id })}
                                          className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                                            renderOptions.visualMode === mode.id
                                              ? "border-amber-300 bg-amber-100 !text-midnight"
                                              : "border-white/15 bg-white/10 text-white"
                                          }`}
                                        >
                                          {mode.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] text-neutral-300">Preview Fidelity</label>
                                    <div className="grid grid-cols-2 gap-2">
                                      {[
                                        { id: "standard", label: "Standard" },
                                        { id: "high", label: "High" },
                                      ].map((preset) => (
                                        <button
                                          key={preset.id}
                                          type="button"
                                          onClick={() =>
                                            setPreviewFidelity(preset.id as "standard" | "high")
                                          }
                                          className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                                            previewFidelity === preset.id
                                              ? "border-amber-300 bg-amber-100 !text-midnight"
                                              : "border-white/15 bg-white/10 text-white"
                                          }`}
                                        >
                                          {preset.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] text-neutral-300">Premium Stars</label>
                                    <div className="grid grid-cols-3 gap-2">
                                      {[
                                        { id: "off", label: "Off" },
                                        { id: "subtle", label: "Subtle" },
                                        { id: "realistic", label: "Realistic" },
                                      ].map((preset) => (
                                        <button
                                          key={preset.id}
                                          type="button"
                                          onClick={() => {
                                            setRenderOptions({ premiumStars: preset.id as RenderOptions["premiumStars"] });
                                            if (!paid && preset.id !== "off") {
                                              track("premium_preview_enabled", { feature: "stars", level: preset.id });
                                            }
                                          }}
                                          className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                                            renderOptions.premiumStars === preset.id
                                              ? "border-amber-300 bg-amber-100 !text-midnight"
                                              : "border-white/15 bg-white/10 text-white"
                                          }`}
                                        >
                                          {!paid && preset.id !== "off" ? "🔒 " : ""}
                                          {preset.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] text-neutral-300">Premium Planets</label>
                                    <div className="grid grid-cols-2 gap-2">
                                      {[
                                        { id: "off", label: "Off" },
                                        { id: "realistic", label: "Realistic" },
                                      ].map((preset) => (
                                        <button
                                          key={preset.id}
                                          type="button"
                                          onClick={() => {
                                            setRenderOptions({
                                              premiumPlanets: preset.id as RenderOptions["premiumPlanets"],
                                            });
                                            if (!paid && preset.id !== "off") {
                                              track("premium_preview_enabled", {
                                                feature: "planets",
                                                level: preset.id,
                                              });
                                            }
                                          }}
                                          className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                                            renderOptions.premiumPlanets === preset.id
                                              ? "border-amber-300 bg-amber-100 !text-midnight"
                                              : "border-white/15 bg-white/10 text-white"
                                          }`}
                                        >
                                          {!paid && preset.id !== "off" ? "🔒 " : ""}
                                          {preset.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                              </section>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div ref={previewRef} id="preview" className="flex w-full flex-col gap-3 pb-4 lg:pb-0 order-1 lg:order-2">
                  <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0b0f24]/90 p-3 shadow-xl shadow-black/30 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Preview</h3>
                      {revealed && (
                        <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                          {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
                        </div>
                      )}
                    </div>
                    <div
                      className="relative mx-auto overflow-hidden"
                      style={{
                        width: "100%",
                        maxWidth: "600px",
                        aspectRatio: `${aspectRatioToNumber(aspectRatio)} / 1`,
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
                          <div className="absolute inset-0 z-10">
                            <div className="absolute left-1/2 top-[62%] flex w-full max-w-[320px] -translate-x-1/2 flex-col items-center gap-2 px-4 text-center">
                              {canReveal ? (
                                <button
                                  type="button"
                                  onClick={handleReveal}
                                  aria-label="Generate preview"
                                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30]"
                                >
                                  Generate preview
                                </button>
                              ) : (
                                <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-neutral-200 shadow-sm backdrop-blur">
                                  Add date + location to reveal your sky. Presets optional.
                                </div>
                              )}
                              {canReveal && (
                                <p className="text-[11px] text-neutral-300">Free preview, HD optional.</p>
                              )}
                            </div>
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
                                <div className="pointer-events-none absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0)_100%)] bg-[length:200%_100%] opacity-60" style={{ animationDuration: "1.5s" }} />
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
                            {showEditor && (
                              <button
                                type="button"
                                onClick={handleEditScroll}
                                className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                              >
                                ← Edit
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {revealed && (
                      <div className="mx-auto w-full max-w-[600px]">
                        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-start">
                          <button
                            type="button"
                            onClick={() => void handleExport("preview")}
                            aria-label="Free export"
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                          >
                            Free ⬇️
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExport("hd")}
                            aria-label="HD export"
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
                          {showEditor && (
                            <button
                              type="button"
                              onClick={handleShare}
                              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                            >
                              💾 Save & Remix
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleCustomizeMore}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-400 px-3 py-2 text-xs font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:bg-amber-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                          >
                            Customize more
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
            {revealed && (
              <div className="mx-auto w-full max-w-[600px]">
                <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-start">
                  <button
                    type="button"
                    onClick={() => void handleExport("preview")}
                    aria-label="Free export"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                  >
                    Free ⬇️
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport("hd")}
                    aria-label="HD export"
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
                  {showEditor && (
                    <button
                      type="button"
                      onClick={handleShare}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                    >
                      💾 Save & Remix
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCustomizeMore}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-400 px-3 py-2 text-xs font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:bg-amber-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                  >
                    Customize more
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Mobile: Use MobileCreate component */
          <div key="mobile">
            <MobileCreate
              onExport={handleExport}
              onShareImage={handleShareImage}
              onShare={handleShare}
              onCanvasReady={() => {
                setCanvasReady(true);
                setIsUpdating(false);
              }}
              variant={variant}
              onCustomizeMore={handleCustomizeMore}
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
            {checkoutError && <p className="mt-2 text-sm font-semibold text-rose-700">{checkoutError}</p>}
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
    </>
  );
}
