"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type TextBox, type RenderOptions } from "@/lib/store";
import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import { EditorDrawer } from "@/components/EditorDrawer";
import EditorFontShell from "@/components/EditorFontShell";
import { occasionPresets } from "@/lib/occasionPresets";
import type { RenderModeId } from "@/lib/renderModes";
import { aspectRatioToNumber } from "@/lib/renderSky";
import { styles, fontOptions, visualModes, shapes, constellationPresets, mapLookTiers } from "@/lib/config";
import { applyMapLookTier, applyTierTypography, resolveMapLookTier, type MapLookTier } from "@/lib/mapLookTiers";
import { proPresets } from "@/lib/proPresets";
import { applyStyleDefaults } from "@/lib/styleDefaults";
import { track, trackFunnelStep } from "@/lib/analytics";
import Image from "next/image";
import type { CheckoutPlan, PrintVariant } from "@/lib/pricing";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import {
  formatPosterShippingFootnote,
  getPaywallPrintCheckoutPresentation,
  paywallPrintCheckoutRowKey,
  paywallPrintSkuButtonClassesMobile,
} from "@/lib/paywallPrintCheckout";
import { getPrintShippingCountryLabel, getPrintShippingCountryOptions } from "@/lib/printfulShipping";
import { PrintAspectMismatchNotice } from "@/components/PrintAspectMismatchNotice";
import { PrintGiftDecisionPanel } from "@/components/PrintGiftDecisionPanel";
import { getRevealProgressPercent, REVEAL_STAGES } from "@/lib/revealExperience";
import { useEditorLogic } from "@/hooks/useEditorLogic";

const REVEAL_ANIMATION_MS = 900;
const DEFAULT_TITLE_TEXT = "our night sky";

interface MobileCreateProps {
  onExport: (mode: "preview" | "hd") => void | Promise<void>;
  onShareImage: () => void;
  onShare: () => void;
  onCanvasReady?: () => void;
  variant?: "quick" | "full";
  allowAdvancedInQuick?: boolean;
  onCustomizeMore?: () => void;
  creditsRemaining?: number | null;
  currentPlan?: CheckoutPlan | null;
  printCheckoutEnabled?: boolean;
  preferredPrintVariant?: PrintVariant;
  preferredIncludeDigitalAddOn?: boolean;
  printShippingCountry?: string | null;
  printShippingCountries?: string[];
  onPrintShippingCountryChange?: (country: string) => void;
  printCheckoutInFlight?: boolean;
  onStartPrintCheckout?: (options: {
    variant: PrintVariant;
    includeDigitalAddOn: boolean;
    includeCardAddOn?: boolean;
  }) => void;
  onIntensityPaywall?: () => void;
}

export function MobileCreate({
  onExport,
  onShareImage,
  onShare,
  onCanvasReady,
  variant = "full",
  allowAdvancedInQuick = false,
  onCustomizeMore,
  creditsRemaining = null,
  currentPlan = null,
  printCheckoutEnabled = false,
  preferredPrintVariant = "poster_framed",
  preferredIncludeDigitalAddOn = false,
  printShippingCountry,
  printShippingCountries = [],
  onPrintShippingCountryChange,
  printCheckoutInFlight = false,
  onStartPrintCheckout,
  onIntensityPaywall,
}: MobileCreateProps) {
  // Use shared editor logic hook
  const {
    dateTime,
    location,
    setDateTime,
    textBoxes,
    setTextBoxes,
    updateTextBox,
    removeTextBox,
    addTextBox,
    selectedStyle,
    setStyle,
    shape,
    setShape,
    aspectRatio,
    setAspectRatio,
    renderOptions,
    previewFidelity,
    setRenderOptions,
    setPreviewFidelity,
    revealed,
    setRevealed,
    paid,
    // Local editor state from hook
    renderMode,
    setRenderMode,
    setIntensity,
    intensityDisplay,
    setIntensityDisplay,
    selectedOccasion,
    setSelectedOccasion,
    customOccasion,
    setCustomOccasion,
    presetHint,
    // Derived state
    hasDate,
    canReveal,
    // Actions
    applyVisualOptions,
    applyPreset: hookApplyPreset,
    applyProPreset,
  } = useEditorLogic({ variant });
  const shippingDisclosure = getPrintShippingDisclosure();
  const printShippingCountryOptions = getPrintShippingCountryOptions(printShippingCountries);
  const posterShippingFootnote = useMemo(
    () => formatPosterShippingFootnote(printShippingCountry),
    [printShippingCountry],
  );
  const printCheckoutRows = useMemo(
    () => getPaywallPrintCheckoutPresentation(printShippingCountry),
    [printShippingCountry],
  );
  const primaryPrintRow = useMemo(
    () => printCheckoutRows.find((row) => row.recommended) ?? printCheckoutRows[0] ?? null,
    [printCheckoutRows],
  );
  const alternatePrintRows = useMemo(
    () => (primaryPrintRow ? printCheckoutRows.filter((row) => row !== primaryPrintRow) : printCheckoutRows),
    [printCheckoutRows, primaryPrintRow],
  );
  const posterAspectMismatch = aspectRatio !== "square";

  const isQuick = variant === "quick";
  const [showAdvancedState, setShowAdvancedState] = useState(!isQuick);
  const [showOccasionPresets, setShowOccasionPresets] = useState(() => !isQuick);
  const [showProPresets, setShowProPresets] = useState(() => !isQuick);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealStageIndex, setRevealStageIndex] = useState(0);
  const revealTimerRef = useRef<number | null>(null);
  const allowAdvanced = !isQuick || allowAdvancedInQuick;
  const showAdvanced = allowAdvanced ? showAdvancedState : false;
  const [collapsedTextBoxes, setCollapsedTextBoxes] = useState<Record<string, boolean>>(() => ({
    subtitle: true,
    dedication: true,
  }));
  const presetRailRef = useRef<HTMLDivElement>(null);
  const dateLocationRef = useRef<HTMLDivElement>(null);
  const previewSectionRef = useRef<HTMLDivElement>(null);
  const unlockHdRef = useRef<HTMLButtonElement>(null);
  const customizeMoreRef = useRef<HTMLButtonElement>(null);
  const lessOptionsStickyRef = useRef<HTMLButtonElement>(null);
  const wasShowEditorRef = useRef(false);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [showIntensityBanner, setShowIntensityBanner] = useState(false);
  const [showRenderModeBanner, setShowRenderModeBanner] = useState(false);
  const renderModeBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFontBanner, setShowFontBanner] = useState(false);
  const fontBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showGuidedForm = !revealed || !showAdvanced;
  const showEditor = revealed && showAdvanced;
  const showSetupPanels = !revealed || showEditor;
  const visibleTextBoxes = showGuidedForm ? textBoxes.slice(0, 1) : textBoxes;
  const revealStage = REVEAL_STAGES[revealStageIndex];
  const revealProgress = getRevealProgressPercent(revealStageIndex);
  const hasLocation = Boolean(location.name?.trim());
  const titleText =
    textBoxes.find((box) => box.id === "title")?.text?.trim() ??
    textBoxes[0]?.text?.trim() ??
    "";
  const hasPersonalizedTitle =
    titleText.length > 0 && titleText.toLowerCase() !== DEFAULT_TITLE_TEXT;
  const setupSteps = [
    { label: "Date + place", done: hasDate && hasLocation, optional: false },
    { label: "Personalize title", done: hasPersonalizedTitle, optional: true },
    { label: "Preview", done: revealed, optional: false },
  ];
  const previewLockedMessage = !hasDate && !hasLocation
    ? "Add your date and place to unlock preview. Presets optional."
    : !hasDate
      ? "Add your date to unlock preview. Presets optional."
      : "Add your place to unlock preview. Presets optional.";
  const previewReadyMessage = "Preview is ready. Presets optional.";
  const previewUnlockButtonLabel = !hasDate && !hasLocation
    ? "Add date + place to unlock preview"
    : !hasDate
      ? "Add your date to unlock preview"
      : "Add your place to unlock preview";
  const hdCreditLabel =
    !paid
      ? null
      : currentPlan === "subscription"
        ? "Unlimited HD"
        : typeof creditsRemaining === "number" && creditsRemaining > 0
          ? `${creditsRemaining} HD left`
          : null;

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

  // Wrap hook's applyPreset to scroll to mobile preview
  const applyPreset = useCallback(
    (id: string) => {
      hookApplyPreset(id, document.getElementById("mobile-preview"));
    },
    [hookApplyPreset]
  );

  useEffect(() => {
    if (selectedOccasion) {
      setShowOccasionPresets(true);
    }
  }, [selectedOccasion]);

  // Restore selectedOccasion from draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    let draft: string | null = null;
    try {
      draft = localStorage.getItem("star-map-draft");
    } catch {
      return;
    }
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as { selectedOccasion?: string | null };
        if (parsed.selectedOccasion) {
          setSelectedOccasion(parsed.selectedOccasion);
        } else if (parsed.selectedOccasion === null) {
          // User had custom date/location
          setCustomOccasion(true);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, [setCustomOccasion, setSelectedOccasion]);

  // Sync selectedOccasion to draft when it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    let draft: string | null = null;
    try {
      draft = localStorage.getItem("star-map-draft");
    } catch {
      return;
    }
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as Record<string, unknown>;
        parsed.selectedOccasion = selectedOccasion;
        try {
          localStorage.setItem("star-map-draft", JSON.stringify(parsed));
        } catch {
          // Ignore storage errors
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, [selectedOccasion]);

  // Handle intensity change
  const handleIntensityChange = useCallback(
    (value: number) => {
      if (!paid && value > 60) {
        setIntensityDisplay(60);
        track("paywall_intensity_blocked", { attemptedValue: value });
        if (!showIntensityBanner) {
          setShowIntensityBanner(true);
          track("mobile_intensity_upsell_shown", { attemptedValue: value });
        }
        return;
      }
      setIntensityDisplay(value);
      setIntensity(value);
      applyVisualOptions(renderMode, value);
    },
    [applyVisualOptions, paid, renderMode, setIntensity, setIntensityDisplay, showIntensityBanner],
  );

  // Handle render mode change
  const handleRenderModeChange = useCallback(
    (mode: RenderModeId) => {
      if ((mode === "cinematic" || mode === "luxe") && !paid) {
        track("paywall_render_mode_blocked", { mode });
        if (!showRenderModeBanner) {
          setShowRenderModeBanner(true);
          track("mobile_render_mode_upsell_shown", { mode });
        }
        return;
      }
      setRenderMode(mode);
      const targetLevel = mode === "cinematic" ? Math.max(intensityDisplay, 60) : intensityDisplay;
      setIntensity(targetLevel);
      setIntensityDisplay(targetLevel);
      applyVisualOptions(mode, targetLevel);
      track("render_mode_changed", { mode });
    },
    [applyVisualOptions, intensityDisplay, paid, setIntensity, setIntensityDisplay, setRenderMode, showRenderModeBanner],
  );

  const handleStartPreset = useCallback(() => {
    setShowOccasionPresets(true);
    presetRailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleStartScratch = useCallback(() => {
    setSelectedOccasion(null);
    setCustomOccasion(false);
    setRevealed(false);
    dateLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setCustomOccasion, setRevealed, setSelectedOccasion]);

  const handleDateTimeChange = useCallback(
    (iso: string) => {
      setDateTime(iso);
      setCustomOccasion(true);
      if (selectedOccasion) {
        setSelectedOccasion(null);
      }
    },
    [selectedOccasion, setCustomOccasion, setDateTime, setSelectedOccasion],
  );

  const handleLocationChange = useCallback(() => {
    setCustomOccasion(true);
    if (selectedOccasion) {
      setSelectedOccasion(null);
    }
  }, [selectedOccasion, setCustomOccasion, setSelectedOccasion]);

  const applySampleMoment = useCallback(() => {
    const preset = occasionPresets.find((item) => item.id === "wedding") ?? occasionPresets[0];
    if (!preset) return;
    applyPreset(preset.id);
    setRevealed(true);
    track("sample_moment_applied", { preset: preset.id });
    dateLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [applyPreset, setRevealed]);

  const handleReveal = useCallback(() => {
    if (!canReveal || isRevealing) return;
    const revealStartedAt = Date.now();
    setRevealStageIndex(0);
    setIsRevealing(true);
    track("preview_reveal_animation_started", { source: "mobile" });
    if (typeof window !== "undefined" && revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    revealTimerRef.current = window.setTimeout(() => {
      setRevealed(true);
      setIsRevealing(false);
      setRevealStageIndex(0);
      revealTimerRef.current = null;
      track("preview_revealed", { source: "mobile" });
      track("preview_reveal_animation_completed", {
        source: "mobile",
        durationMs: Math.max(0, Date.now() - revealStartedAt),
      });
      trackFunnelStep("editor_reveal", { source: "mobile" });
      setTimeout(() => {
        document.getElementById("mobile-preview")?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);
    }, REVEAL_ANIMATION_MS);
  }, [canReveal, isRevealing, setRevealed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isRevealing) {
      setRevealStageIndex(0);
      return;
    }
    setRevealStageIndex(0);
    let nextStage = 0;
    const stageInterval = window.setInterval(() => {
      nextStage = Math.min(REVEAL_STAGES.length - 1, nextStage + 1);
      setRevealStageIndex(nextStage);
      if (nextStage >= REVEAL_STAGES.length - 1) {
        window.clearInterval(stageInterval);
      }
    }, Math.max(180, Math.floor(REVEAL_ANIMATION_MS / REVEAL_STAGES.length)));
    return () => window.clearInterval(stageInterval);
  }, [isRevealing]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  // Auto-dismiss render mode upsell banner after 20 seconds
  useEffect(() => {
    if (!showRenderModeBanner) return;
    if (renderModeBannerTimerRef.current) {
      clearTimeout(renderModeBannerTimerRef.current);
    }
    renderModeBannerTimerRef.current = setTimeout(() => {
      setShowRenderModeBanner(false);
      renderModeBannerTimerRef.current = null;
    }, 20000);
    return () => {
      if (renderModeBannerTimerRef.current) {
        clearTimeout(renderModeBannerTimerRef.current);
        renderModeBannerTimerRef.current = null;
      }
    };
  }, [showRenderModeBanner]);

  // Auto-dismiss font upsell banner after 20 seconds
  useEffect(() => {
    if (!showFontBanner) return;
    if (fontBannerTimerRef.current) {
      clearTimeout(fontBannerTimerRef.current);
    }
    fontBannerTimerRef.current = setTimeout(() => {
      setShowFontBanner(false);
      fontBannerTimerRef.current = null;
    }, 20000);
    return () => {
      if (fontBannerTimerRef.current) {
        clearTimeout(fontBannerTimerRef.current);
        fontBannerTimerRef.current = null;
      }
    };
  }, [showFontBanner]);

  useEffect(() => {
    if (!canReveal || revealed) {
      setShowStickyCTA(false);
      return;
    }
    const updateSticky = () => {
      const dateBottom = dateLocationRef.current?.getBoundingClientRect().bottom ?? 0;
      const previewRect = previewSectionRef.current?.getBoundingClientRect();
      const previewTop = previewRect?.top ?? Number.POSITIVE_INFINITY;
      const previewFullyVisible =
        previewRect !== undefined && previewRect.top >= 0 && previewRect.bottom <= window.innerHeight;
      const passedDateBlock = dateBottom < 0;
      const previewVisible = previewTop < window.innerHeight * 0.6;
      setShowStickyCTA(!previewFullyVisible && (passedDateBlock || previewVisible));
    };
    updateSticky();
    window.addEventListener("scroll", updateSticky, { passive: true });
    window.addEventListener("resize", updateSticky);
    return () => {
      window.removeEventListener("scroll", updateSticky);
      window.removeEventListener("resize", updateSticky);
    };
  }, [canReveal, revealed]);

  useEffect(() => {
    if (!isQuick) return;
    const lockedIntensity = 70;
    setRenderMode("cinematic");
    setIntensity(lockedIntensity);
    setIntensityDisplay(lockedIntensity);
    applyVisualOptions("cinematic", lockedIntensity);
  }, [applyVisualOptions, isQuick, setIntensity, setIntensityDisplay, setRenderMode]);

  const handleLessOptions = useCallback(() => {
    setShowAdvancedState(false);
  }, []);

  const handleCustomizeMore = useCallback(() => {
    if (isQuick && !allowAdvancedInQuick) {
      onCustomizeMore?.();
      return;
    }
    setShowAdvancedState((prev) => !prev);
  }, [allowAdvancedInQuick, isQuick, onCustomizeMore]);

  // Restore purchase-CTA focus after leaving Customize more (issue #180).
  useEffect(() => {
    const wasOpen = wasShowEditorRef.current;
    wasShowEditorRef.current = showEditor;
    if (!wasOpen || showEditor) return;
    const frame = requestAnimationFrame(() => {
      previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      unlockHdRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [showEditor]);

  const handleStyleChange = useCallback(
    (styleId: typeof selectedStyle) => {
      setStyle(styleId);
      const tier: MapLookTier =
        renderOptions.mapLookTier ?? resolveMapLookTier(renderOptions, selectedStyle);
      const tierOptions = tier === "custom" ? {} : applyMapLookTier(tier, styleId);
      const defaults = applyStyleDefaults(styleId, textBoxes);
      const mergedOptions = { ...defaults.renderOptions, ...tierOptions };
      if (Object.keys(mergedOptions).length) {
        setRenderOptions(mergedOptions);
      }
      const nextText =
        tier === "custom"
          ? defaults.textBoxes
          : applyTierTypography(tier, styleId, defaults.textBoxes);
      if (nextText !== textBoxes) {
        setTextBoxes(nextText);
      }
    },
    [renderOptions, selectedStyle, setRenderOptions, setStyle, setTextBoxes, textBoxes],
  );

  return (
    <EditorFontShell>
      <div className="space-y-3">
      {/* Section 1: Header */}
      {!revealed && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d7b56c]">
            Create your star map
          </p>
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">
            Build your map in 3 quick steps
          </h2>
          <p className="text-base text-neutral-200">
            Enter date and place, add your title, then generate a free preview.
          </p>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-300">
            {setupSteps.map((step, index) => (
              <span
                key={step.label}
                className={`rounded-full border px-3 py-1 ${
                  step.done
                    ? "border-emerald-300/70 bg-emerald-300/20 text-emerald-100"
                    : "border-white/12 bg-white/8"
                }`}
              >
                {step.done ? "Done" : `${index + 1}.`} {step.label}
                {step.optional && !step.done ? " (optional)" : ""}
              </span>
            ))}
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={applySampleMoment}
              className="w-full rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow-md sm:w-auto"
            >
              Try a sample moment
            </button>
            <button
              type="button"
              onClick={handleStartPreset}
              className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:border-white/30 hover:bg-white/10 sm:w-auto"
            >
              Browse occasion presets
            </button>
            <button
              type="button"
              onClick={handleStartScratch}
              className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:border-white/30 hover:bg-white/10 sm:w-auto"
            >
              Start empty
            </button>
          </div>
          <p className="text-xs text-neutral-300">Need deeper control? Use “Customize more” after preview.</p>
        </div>
      )}

      {/* Section 2: Occasion Presets */}
      {showSetupPanels && (
        <section
          ref={presetRailRef}
          className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm shadow-black/30"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white">Occasion presets</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOccasionPresets((prev) => !prev)}
                className="rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200 transition hover:border-white/25 hover:bg-white/12"
              >
                {showOccasionPresets ? "Hide presets" : "Show presets"}
              </button>
              {customOccasion && (
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                  Custom
                </span>
              )}
            </div>
          </div>
          {showOccasionPresets ? (
            <>
              <div className="flex flex-wrap gap-2">
                {occasionPresets.map((preset) => {
                  const occasionStyles = {
                    wedding: "border-pink-300/40 bg-gradient-to-br from-pink-100/15 to-rose-100/15 text-pink-100 hover:border-pink-300/60 hover:bg-pink-100/20",
                    anniversary: "border-amber-300/40 bg-gradient-to-br from-amber-100/15 to-orange-100/15 text-amber-100 hover:border-amber-300/60 hover:bg-amber-100/20",
                    birthday: "border-cyan-300/40 bg-gradient-to-br from-cyan-100/15 to-blue-100/15 text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-100/20",
                    birth: "border-green-300/40 bg-gradient-to-br from-green-100/15 to-emerald-100/15 text-green-100 hover:border-green-300/60 hover:bg-green-100/20",
                    memorial: "border-purple-300/40 bg-gradient-to-br from-purple-100/15 to-violet-100/15 text-purple-100 hover:border-purple-300/60 hover:bg-purple-100/20",
                    graduation: "border-yellow-300/40 bg-gradient-to-br from-yellow-100/15 to-amber-100/15 text-yellow-100 hover:border-yellow-300/60 hover:bg-yellow-100/20",
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
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:scale-95 ${
                        occasionStyles[preset.id as keyof typeof occasionStyles]
                      } ${selectedOccasion === preset.id ? "ring-2 ring-amber-300/70 btn-selection-pulse btn-selected-glow" : ""}`}
                    >
                      {occasionEmojis[preset.id as keyof typeof occasionEmojis]} {preset.label}
                    </button>
                  );
                })}
              </div>
              {presetHint && <p className="mt-2 text-xs text-amber-100/80">{presetHint}</p>}
            </>
          ) : (
            <p className="text-xs text-neutral-300">
              Keep this hidden if you already know the exact date and location.
            </p>
          )}
        </section>
      )}

      {/* Date & Location - FIRST (required input) */}
      {!revealed && showGuidedForm && (
        <section
          ref={dateLocationRef}
          className="rounded-xl border border-white/10 bg-white/5 p-3"
        >
          <h3 className="text-xs font-semibold text-white mb-2">Date & Location</h3>
          <div className="space-y-2">
            <LocationSearch onLocationChange={handleLocationChange} />
            <DateTimeControls dateTime={dateTime} onChange={handleDateTimeChange} />
          </div>
        </section>
      )}

      {/* Pro Presets - SECOND (optional styling) */}
      {showSetupPanels && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm shadow-black/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-white">Pro Presets</h3>
              <p className="text-[10px] text-neutral-300">Curated looks with balanced typography.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowProPresets((prev) => !prev)}
              className="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-200 transition hover:border-white/25 hover:bg-white/12"
            >
              {showProPresets ? "Hide" : "Show"}
            </button>
          </div>
          {showProPresets ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {proPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyProPreset(preset.id)}
                  className={`group overflow-hidden rounded-lg border bg-[#0b0f24]/80 text-left shadow-sm transition-all duration-200 hover:-translate-y-[2px] hover:shadow-lg active:scale-[0.98] ${
                    selectedOccasion === preset.id ? "border-amber-300/70 ring-1 ring-amber-300/30 btn-selection-pulse btn-selected-glow" : "border-white/10"
                  }`}
                >
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <Image
                      src={preset.thumbnail}
                      alt={preset.label}
                      fill
                      loading="lazy"
                      sizes="(min-width: 640px) 180px, 45vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="border-t border-white/10 px-2 py-2">
                    <div className="text-xs font-semibold text-white">{preset.label}</div>
                    <div className="text-[10px] text-neutral-300">{preset.note}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-neutral-300">Show this when you want curated style shortcuts.</p>
          )}
        </section>
      )}

      {/* Section 3: Render Mode + Intensity (Always Visible) */}
      {showEditor && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm shadow-black/30">
          <h3 className="text-xs font-semibold text-white mb-2">Render Style</h3>
          <div className="flex gap-2 mb-3">
            {[
              { id: "classic", label: "Classic", premium: false },
              { id: "cinematic", label: "Enhanced", premium: true },
              { id: "blueprint", label: "Blueprint", premium: false },
              { id: "luxe", label: "Luxe", premium: true },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleRenderModeChange(mode.id as RenderModeId)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow active:scale-95 ${
                  renderMode === mode.id
                  ? "border-amber-400 bg-amber-200 !text-midnight btn-selection-pulse btn-selected-glow"
                    : "border-white/20 bg-white/10 text-white"
                }`}
              >
                {mode.premium && !paid && "🔒"} {mode.label}
              </button>
            ))}
          </div>

          {!paid && showRenderModeBanner && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2">
              <p className="text-[11px] font-semibold text-amber-100">
                This render mode requires HD access — unlock to apply it
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    track("mobile_render_mode_upsell_clicked");
                    onIntensityPaywall?.();
                  }}
                  data-cta-priority="secondary"
                  className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-white/15 active:scale-95"
                >
                  Unlock HD →
                </button>
                <button
                  type="button"
                  onClick={() => setShowRenderModeBanner(false)}
                  aria-label="Dismiss render mode upsell"
                  className="text-amber-100/60 hover:text-amber-100 text-[14px] leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white">Intensity</label>
              <span className="text-xs text-neutral-300">{intensityDisplay}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={intensityDisplay}
              onChange={(e) => handleIntensityChange(Number(e.target.value))}
              aria-label="Star intensity"
              aria-valuetext={`Intensity: ${intensityDisplay}%`}
              className="w-full accent-amber-400"
            />
            {!paid && showIntensityBanner && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2">
                <p className="text-[11px] font-semibold text-amber-100">
                  Intensity locked at 60% — unlock more with HD access
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      track("mobile_intensity_upsell_clicked");
                      onIntensityPaywall?.();
                    }}
                    data-cta-priority="secondary"
                    className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-white/15 active:scale-95"
                  >
                    Unlock HD
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIntensityBanner(false)}
                    aria-label="Dismiss intensity upsell"
                    className="text-amber-100/60 hover:text-amber-100 text-[14px] leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Your Message + Generate Button */}
      {!revealed && showGuidedForm && (
        <div className="space-y-3">
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-amber-300">✎</span>
              <h3 className="text-xs font-semibold text-white">Your Message</h3>
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
          <button
            type="button"
            onClick={handleReveal}
            disabled={!canReveal || isRevealing}
            aria-label={
              isRevealing
                ? "Revealing your sky"
                : canReveal
                  ? "Generate preview"
                  : previewUnlockButtonLabel
            }
            className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30] ${
              canReveal && !isRevealing
                ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                : "cursor-not-allowed bg-neutral-400/60 text-neutral-700 shadow-none"
            }`}
          >
            {isRevealing ? "Revealing your sky..." : canReveal ? "Generate preview" : previewUnlockButtonLabel}
          </button>
          <div className="text-xs text-neutral-400">
            <p>
              {isRevealing
                ? revealStage.description
                : canReveal
                  ? previewReadyMessage
                  : previewLockedMessage}
            </p>
            <p className="text-[11px] text-neutral-500">
              {canReveal ? "Free preview, HD optional." : "Free preview, HD optional after you add date + place."}
            </p>
          </div>
        </div>
      )}

      {/* Section 4: Drawer with Secondary Controls */}
      {showEditor && (
        <EditorDrawer
          defaultOpen={true}
          footer={
            <div className="mx-auto flex w-full max-w-md gap-2">
              <button
                ref={lessOptionsStickyRef}
                type="button"
                onClick={handleLessOptions}
                data-testid="mobile-sticky-less-options"
                data-cta-priority="secondary"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-white/15 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
              >
                Less options
              </button>
              <button
                type="button"
                onClick={() => void onExport("hd")}
                aria-label={paid ? "HD download" : "Unlock HD"}
                data-testid="mobile-sticky-unlock-hd"
                data-cta-priority="primary"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-3 py-2.5 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
              >
                {paid ? "HD download" : "Unlock HD"}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            {/* Date & Location */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Date & Location</h3>
              <div className="space-y-2">
                <LocationSearch onLocationChange={handleLocationChange} />
                <DateTimeControls dateTime={dateTime} onChange={handleDateTimeChange} />
              </div>
            </section>

            {/* Your Message */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
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

            {/* Text Styling */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Text Styling</h3>
              <div className="space-y-3">
                {textBoxes.map((box) => {
                  const isCollapsed = collapsedTextBoxes[box.id] ?? false;

                  return (
                    <div key={box.id} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
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
                            aria-expanded={isCollapsed ? "false" : "true"}
                            aria-controls={`text-style-${box.id}`}
                            className="text-[10px] font-semibold text-amber-200/70 hover:text-amber-200"
                          >
                            {isCollapsed ? "Show" : "Hide"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTextBox(box.id)}
                            className="text-[10px] text-rose-300 hover:text-rose-200"
                            aria-label={`Remove ${box.label} text box`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {!isCollapsed && (
                        <div id={`text-style-${box.id}`} className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label htmlFor={`font-select-${box.id}`} className="text-[10px] text-neutral-300">Font</label>
                              <select
                                id={`font-select-${box.id}`}
                                value={box.fontFamily}
                                onChange={(e) => {
                                  const next = e.target.value as TextBox["fontFamily"];
                                  const fontMeta = fontOptions.find((opt) => opt.id === next);
                                  if (fontMeta?.premium && !paid) {
                                    track("paywall_font_blocked", { font: next });
                                    if (!showFontBanner) {
                                      setShowFontBanner(true);
                                      track("mobile_font_upsell_shown", { font: next });
                                    }
                                    return;
                                  }
                                  updateTextBox(box.id, { fontFamily: next });
                                }}
                                className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                              >
                                {fontOptions.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.premium ? `🔒 ${opt.label}` : opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label htmlFor={`size-input-${box.id}`} className="text-[10px] text-neutral-300">Size</label>
                              <input
                                id={`size-input-${box.id}`}
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
                              <label htmlFor={`color-input-${box.id}`} className="text-[10px] text-neutral-300">Color</label>
                              <input
                                id={`color-input-${box.id}`}
                                type="color"
                                value={box.color}
                                onChange={(e) => updateTextBox(box.id, { color: e.target.value })}
                                className="w-full h-8 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                              />
                            </div>
                            <div className="space-y-1">
                              <label htmlFor={`align-select-${box.id}`} className="text-[10px] text-neutral-300">Align</label>
                              <select
                                id={`align-select-${box.id}`}
                                value={box.align}
                                onChange={(e) => updateTextBox(box.id, { align: e.target.value as TextBox["align"] })}
                                className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                              >
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
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
                              aria-label={`Toggle shadow for ${box.label}`}
                            aria-pressed={box.textShadow ? "true" : "false"}
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
                              aria-label={`Toggle glow for ${box.label}`}
                            aria-pressed={box.textGlow ? "true" : "false"}
                            >
                              Glow
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!paid && showFontBanner && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2">
                    <p className="text-[11px] font-semibold text-amber-100">
                      This font style requires HD access — unlock to apply it
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          track("mobile_font_upsell_clicked");
                          onIntensityPaywall?.();
                        }}
                        data-cta-priority="secondary"
                        className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-white/15 active:scale-95"
                      >
                        Unlock HD →
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFontBanner(false)}
                        aria-label="Dismiss font upsell"
                        className="text-amber-100/60 hover:text-amber-100 text-[14px] leading-none"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={addTextBox}
                  className="w-full rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
                >
                  + Add Text Line
                </button>
              </div>
            </section>

            {/* Style */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="mobile-map-look-label" className="text-xs font-semibold text-white">
                  Map look
                </h3>
                {resolveMapLookTier(renderOptions, selectedStyle) !== "custom" && (
                  <button
                    type="button"
                    onClick={() => {
                      const tier = resolveMapLookTier(renderOptions, selectedStyle);
                      setTextBoxes(applyTierTypography(tier, selectedStyle, textBoxes));
                    }}
                    className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-amber-100/90"
                  >
                    Reset typography
                  </button>
                )}
              </div>
              <div
                role="radiogroup"
                aria-labelledby="mobile-map-look-label"
                className="mb-3 grid grid-cols-3 gap-1.5"
              >
                {mapLookTiers.map((tier) => {
                  const activeTier = resolveMapLookTier(renderOptions, selectedStyle);
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      role="radio"
                      aria-checked={activeTier === tier.id ? "true" : "false"}
                      aria-label={`${tier.label}: ${tier.description}`}
                      onClick={() => {
                        setRenderOptions(applyMapLookTier(tier.id, selectedStyle));
                        setTextBoxes(applyTierTypography(tier.id, selectedStyle, textBoxes));
                      }}
                      className={`min-h-[2.75rem] rounded-md border px-2 py-2 text-left transition ${
                        activeTier === tier.id
                          ? "!text-midnight border-amber-300 bg-amber-100"
                          : "border-white/15 bg-white/10 text-white"
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{tier.label}</div>
                    </button>
                  );
                })}
              </div>
              <h3 className="text-xs font-semibold text-white mb-2">Style</h3>
              <div className="grid grid-cols-2 gap-2">
                {styles.map((style) => {
                  const styleClasses = {
                    navyGold:
                      selectedStyle === style.id
                        ? "border-amber-400 bg-gradient-to-br from-[#0d1b2a] to-[#1b2838] text-amber-300"
                        : "border-amber-500/30 bg-gradient-to-br from-[#0d1b2a]/80 to-[#1b2838]/80 text-amber-200/80",
                    vintageEngraving:
                      selectedStyle === style.id
                        ? "border-amber-300 bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] text-amber-100"
                        : "border-neutral-400/30 bg-gradient-to-br from-[#2d2d2d]/80 to-[#1a1a1a]/80 text-neutral-200/80",
                    parchmentScroll:
                      selectedStyle === style.id
                        ? "border-amber-400 bg-gradient-to-br from-[#f5f0e6] to-[#e8dcc8] text-amber-900"
                        : "border-amber-500/30 bg-gradient-to-br from-[#f5f0e6]/90 to-[#e8dcc8]/90 text-amber-800/80",
                    midnightMinimal:
                      selectedStyle === style.id
                        ? "border-blue-400 bg-gradient-to-br from-[#0a0a0a] to-[#1a1a2e] text-blue-300"
                        : "border-blue-500/30 bg-gradient-to-br from-[#0a0a0a]/80 to-[#1a1a2e]/80 text-blue-200/80",
                  };

                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => handleStyleChange(style.id)}
                      className={`flex flex-col justify-center rounded-lg border px-3 py-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:scale-[0.98] ${
                        styleClasses[style.id as keyof typeof styleClasses]
                      } ${selectedStyle === style.id ? "btn-selection-pulse" : ""}`}
                    >
                      <div className="text-sm font-semibold">{style.name}</div>
                      <div className="text-xs opacity-80 mt-1">{style.note}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Shape */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Shape</h3>
              <div className="grid grid-cols-4 gap-2">
                {shapes.map((shapeOption) => (
                  <button
                    key={shapeOption.id}
                    type="button"
                    onClick={() => setShape(shapeOption.id)}
                    className={`flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-xs font-semibold transition active:scale-95 ${
                      shape === shapeOption.id
                        ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 !text-midnight"
                        : "border-white/15 bg-white/5 text-white"
                    }`}
                  >
                    {shapeOption.label}
                  </button>
                ))}
              </div>
              {shape !== "rectangle" && (
                <div className="mt-2 space-y-1">
                  <label htmlFor="shape-background-color" className="text-[10px] text-neutral-300">
                    Background Color
                  </label>
                  <input
                    id="shape-background-color"
                    type="color"
                    value={renderOptions.backgroundColor || "#0b1a30"}
                    onChange={(e) => setRenderOptions({ backgroundColor: e.target.value })}
                    className="w-full h-8 rounded-md border border-white/15 bg-white/10 cursor-pointer"
                  />
                </div>
              )}
            </section>

            {/* Frame */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Frame</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "square" as const, label: "Square" },
                  { id: "4:5" as const, label: "Poster" },
                  { id: "2:3" as const, label: "Wide" },
                ].map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`flex items-center justify-center rounded-lg border px-2 py-2 text-xs font-semibold transition active:scale-95 ${
                      aspectRatio === ratio.id
                        ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 !text-midnight"
                        : "border-white/15 bg-white/5 text-white"
                    }`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRenderOptions({ frameEnabled: !renderOptions.frameEnabled })}
                className={`mt-2 w-full rounded-md border px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                  renderOptions.frameEnabled
                    ? "border-amber-300 bg-amber-100 !text-midnight"
                    : "border-white/15 bg-white/10 text-white"
                }`}
              >
                {renderOptions.frameEnabled ? "Frame Border On" : "Frame Border Off"}
              </button>
            </section>

            {/* Advanced */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="text-xs font-semibold text-white mb-2">Advanced</h3>
              <div className="space-y-3">
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
                        aria-label="Constellation line color"
                        title="Constellation line color"
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
                        onClick={() => setPreviewFidelity(preset.id as "standard" | "high")}
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
                        {!paid && preset.id !== "off" ? "🔒 " : ""}{preset.label}
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
                          setRenderOptions({ premiumPlanets: preset.id as RenderOptions["premiumPlanets"] });
                          if (!paid && preset.id !== "off") {
                            track("premium_preview_enabled", { feature: "planets", level: preset.id });
                          }
                        }}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                          renderOptions.premiumPlanets === preset.id
                          ? "border-amber-300 bg-amber-100 !text-midnight"
                            : "border-white/15 bg-white/10 text-white"
                        }`}
                      >
                        {!paid && preset.id !== "off" ? "🔒 " : ""}{preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </EditorDrawer>
      )}

      {/* Section 5: Preview */}
      <section ref={previewSectionRef} id="mobile-preview" className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-[#0b0f24]/90 p-3 shadow-xl shadow-black/30">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-white">Preview</h3>
            {revealed && (
              <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                {styles.find((s) => s.id === selectedStyle)?.name ?? "Style"}
              </div>
            )}
          </div>
          <div className="relative mx-auto overflow-hidden" style={{ width: "100%", maxWidth: "600px", aspectRatio: `${aspectRatioToNumber(aspectRatio)} / 1` }}>
            {!revealed && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="space-y-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-semibold text-neutral-200 shadow-sm backdrop-blur text-center">
                  <p>
                    {isRevealing
                      ? "Locking in your sky details..."
                      : canReveal
                        ? "Preview is ready. Tap Generate preview to reveal your sky."
                        : previewLockedMessage}
                  </p>
                  {canReveal ? (
                    isRevealing ? (
                      <div className="reveal-loader-card rounded-xl px-3 py-3 text-center">
                        <div className="reveal-glow reveal-glow-left" aria-hidden="true" />
                        <div className="reveal-glow reveal-glow-right" aria-hidden="true" />
                        <div className="mb-2 flex items-center justify-between gap-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-100/75">
                          <span>Free preview</span>
                          <span>{revealProgress}</span>
                        </div>
                        <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-amber-200/60 bg-amber-100/10">
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-200/70 border-t-transparent" />
                        </div>
                        <p className="text-[9px] font-semibold tracking-[0.22em] text-amber-100/80 uppercase">
                          Revealing your sky
                        </p>
                        <p className="mt-1 text-xs font-semibold text-amber-50">{revealStage.title}</p>
                        <p className="mt-1 text-[10px] leading-4 text-neutral-200">{revealStage.description}</p>
                        <div className="mt-2 grid grid-cols-3 gap-1 text-[8px] font-semibold tracking-[0.18em] text-neutral-300 uppercase">
                          {REVEAL_STAGES.map((stage, index) => {
                            const isActive = index === revealStageIndex;
                            const isComplete = index < revealStageIndex;
                            return (
                              <span
                                key={stage.label}
                                className={`rounded-full border px-1.5 py-1 ${
                                  isComplete
                                    ? "border-amber-200/50 bg-amber-200/18 text-amber-50"
                                    : isActive
                                      ? "border-amber-200/45 bg-white/8 text-amber-100"
                                      : "border-white/10 bg-white/[0.04] text-neutral-400"
                                }`}
                              >
                                {stage.label}
                              </span>
                            );
                          })}
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="reveal-progress-fill h-full rounded-full bg-gradient-to-r from-amber-300 via-amber-100 to-amber-300 transition-[width] duration-200"
                            style={{ width: revealProgress }}
                          />
                        </div>
                        <p className="mt-2 text-[10px] text-neutral-300">Usually takes about a second. No charge yet.</p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleReveal}
                        aria-label="Generate preview"
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold text-midnight shadow-lg transition"
                      >
                        Generate preview
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={handleReveal}
                      disabled
                      aria-label={previewUnlockButtonLabel}
                      className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full bg-neutral-400/60 px-4 py-2 text-xs font-semibold text-neutral-700 shadow-none"
                    >
                      {previewUnlockButtonLabel}
                    </button>
                  )}
                  <p className="text-[10px] text-neutral-300">
                    {isRevealing
                      ? "This usually takes about a second."
                      : canReveal
                        ? "Free preview, HD optional."
                        : "Free preview, HD optional after you add date + place."}
                  </p>
                  {printCheckoutEnabled && (
                    <p className="text-[10px] text-amber-100/90">
                      Printed and framed options unlock after preview.
                    </p>
                  )}
                </div>
              </div>
            )}
            {revealed && <PreviewCanvas onRendered={onCanvasReady} />}
          </div>
        </div>

      {revealed && (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onExport("preview")}
              aria-label="Free export"
              data-cta-priority="secondary"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
            >
              Free preview
            </button>
            <button
              ref={unlockHdRef}
              type="button"
              onClick={() => void onExport("hd")}
              aria-label="HD export"
              data-testid="mobile-unlock-hd"
              data-cta-priority="primary"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-3 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg active:scale-95"
            >
              {paid ? "HD download" : "Unlock HD"}
            </button>
          </div>
          {hdCreditLabel && (
            <div className="mt-2 flex justify-end">
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80">
                {hdCreditLabel}
              </span>
            </div>
          )}
            {printCheckoutEnabled && onStartPrintCheckout && (
              <div className="mt-2 rounded-xl border border-amber-300/40 bg-amber-300/10 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-semibold text-amber-100">Buy a physical gift from this exact preview</p>
                  <span className="rounded-full border border-amber-300/40 bg-amber-300/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-100">
                    Framed + HD recommended
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-amber-100/80">
                  Start with the framed gift-ready path. Shipping shows before payment, and your print order is created
                  right after checkout. {shippingDisclosure}
                </p>
                {posterAspectMismatch && (
                  <PrintAspectMismatchNotice aspectRatio={aspectRatio} className="mt-2" />
                )}
                {printShippingCountries.length > 0 && (
                  <div className="mt-2">
                    <label htmlFor="mobile-print-shipping-country" className="text-[10px] font-semibold text-amber-100/80">
                      Shipping country
                    </label>
                    <select
                      id="mobile-print-shipping-country"
                      value={printShippingCountry ?? ""}
                      onChange={(event) => onPrintShippingCountryChange?.(event.target.value)}
                      aria-label="Shipping country"
                      title="Shipping country"
                      className="print-country-select mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-[11px] text-midnight"
                      style={{ color: "#111827", WebkitTextFillColor: "#111827", colorScheme: "light" }}
                    >
                      {printShippingCountryOptions.map((country) => (
                        <option
                          key={country.code}
                          value={country.code}
                          className="text-midnight"
                          style={{ color: "#111827", backgroundColor: "#ffffff" }}
                        >
                          {country.label}
                        </option>
                      ))}
                    </select>
                    {printShippingCountry && posterShippingFootnote ? (
                      <p className="mt-1 text-[10px] text-amber-100/80">
                        Estimated shipping to {getPrintShippingCountryLabel(printShippingCountry)}: {posterShippingFootnote}
                      </p>
                    ) : null}
                    <PrintGiftDecisionPanel
                      printShippingCountry={printShippingCountry}
                      sizingVariant={preferredPrintVariant}
                      compact
                      showGiftLadder={false}
                    />
                  </div>
                )}
                {primaryPrintRow && (
                  <button
                    type="button"
                    onClick={() =>
                      onStartPrintCheckout({
                        variant: primaryPrintRow.variant,
                        includeDigitalAddOn: primaryPrintRow.includeDigitalAddOn,
                        includeCardAddOn: primaryPrintRow.includeCardAddOn,
                      })
                    }
                    disabled={!printShippingCountry || printCheckoutInFlight}
                    className={`${paywallPrintSkuButtonClassesMobile(primaryPrintRow, preferredPrintVariant, preferredIncludeDigitalAddOn)} mt-2 w-full`}
                  >
                    {printCheckoutInFlight ? (
                      "Opening secure checkout..."
                    ) : (
                      <span className="text-center leading-tight">
                        <span className="block text-[11px] font-semibold">
                          {primaryPrintRow.recommended ? "🖼️ " : ""}
                          {primaryPrintRow.headline}
                        </span>
                        <span className="block text-[10px] text-amber-100/95">{primaryPrintRow.secondaryLine}</span>
                      </span>
                    )}
                  </button>
                )}
                {alternatePrintRows.length > 0 && (
                  <details className="mt-2 rounded-lg border border-amber-300/30 bg-black/15 px-3 py-2">
                    <summary className="cursor-pointer list-none text-[10px] font-semibold text-amber-100">
                      Other print options
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {alternatePrintRows.map((row) => (
                        <button
                          key={paywallPrintCheckoutRowKey(row)}
                          type="button"
                          onClick={() =>
                            onStartPrintCheckout({
                              variant: row.variant,
                              includeDigitalAddOn: row.includeDigitalAddOn,
                              includeCardAddOn: row.includeCardAddOn,
                            })
                          }
                          disabled={!printShippingCountry || printCheckoutInFlight}
                          className={paywallPrintSkuButtonClassesMobile(row, preferredPrintVariant, preferredIncludeDigitalAddOn)}
                        >
                          {printCheckoutInFlight ? (
                            "Opening secure checkout..."
                          ) : (
                            <span className="text-center leading-tight">
                              <span className="block text-[11px] font-semibold">
                                {row.recommended ? "🖼️ " : ""}
                                {row.headline}
                              </span>
                              <span className="block text-[10px] text-amber-100/95">{row.secondaryLine}</span>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
                {!printShippingCountry && (
                  <p className="mt-2 text-[10px] font-semibold text-amber-100/85">
                    Choose your shipping country to show shipping pricing and unlock print checkout.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                  <a
                    href="/star-map-gift-formats"
                    className="font-semibold text-amber-100 underline decoration-amber-300/60 underline-offset-2"
                  >
                    Compare formats
                  </a>
                  <a
                    href="/shipping"
                    className="font-semibold text-amber-100 underline decoration-amber-300/60 underline-offset-2"
                  >
                    Shipping details
                  </a>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onShareImage}
                  aria-label="Share star map"
                  data-cta-priority="secondary"
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
                >
                  🔗 Share
                </button>
                {showEditor && (
                  <button
                    type="button"
                    onClick={onShare}
                    aria-label="Save and remix star map"
                    data-cta-priority="secondary"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
                  >
                    💾 Save & Remix
                  </button>
                )}
              </div>
              <button
                ref={customizeMoreRef}
                type="button"
                onClick={handleCustomizeMore}
                aria-expanded={showEditor ? "true" : "false"}
                data-testid="mobile-customize-more"
                data-cta-priority="secondary"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-white/15 hover:shadow active:scale-95"
              >
                {showEditor ? "Less options" : "Customize more"}
              </button>
            </div>
          </>
        )}
      </section>
      {canReveal && !revealed && showStickyCTA && !isRevealing && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[90%] max-w-md -translate-x-1/2 rounded-2xl border border-amber-200/40 bg-[#0b0f24]/95 px-4 py-3 shadow-xl shadow-black/30 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Preview is ready</p>
              <p className="text-[10px] text-neutral-300">
                Free preview. HD export is optional.
              </p>
            </div>
            <button
              type="button"
              onClick={handleReveal}
              data-testid="mobile-sticky-generate"
              disabled={isRevealing}
              className="rounded-full px-3 py-2 text-xs font-semibold text-midnight shadow-md transition bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:-translate-y-[1px] hover:shadow-lg"
            >
              Reveal preview
            </button>
          </div>
        </div>
      )}
      </div>
    </EditorFontShell>
  );
}
