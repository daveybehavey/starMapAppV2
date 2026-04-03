"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type TextBox, type RenderOptions } from "@/lib/store";
import DateTimeControls from "@/components/DateTimeControls";
import LocationSearch from "@/components/LocationSearch";
import PreviewCanvas from "@/components/PreviewCanvas";
import { EditorDrawer } from "@/components/EditorDrawer";
import EditorFontShell from "@/components/EditorFontShell";
import { occasionPresets } from "@/lib/occasionPresets";
import type { RenderModeId } from "@/lib/renderModes";
import { aspectRatioToNumber } from "@/lib/renderSky";
import { styles, fontOptions, visualModes, shapes, constellationPresets } from "@/lib/config";
import { proPresets } from "@/lib/proPresets";
import { applyStyleDefaults } from "@/lib/styleDefaults";
import { track, trackFunnelStep } from "@/lib/analytics";
import Image from "next/image";
import type { CheckoutPlan, PrintVariant } from "@/lib/pricing";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import {
  formatPrintDeliveryEstimate,
  formatPrintShippingEstimate,
  getPrintShippingCountryLabel,
  getPrintShippingCountryOptions,
} from "@/lib/printfulShipping";
import {
  DIGITAL_CHECKOUT_CTA_LABEL,
  DIGITAL_CHECKOUT_HELPER_TEXT,
  DIGITAL_CHECKOUT_TRUST_LINE,
  getPrintCheckoutCtaState,
  PRINT_CHECKOUT_REDIRECT_LABEL,
} from "@/lib/checkoutUi";
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
  printPriceLabels?: {
    unframed: string;
    framed: string;
    digitalAddOn: string;
  };
  printShippingCountry?: string | null;
  printShippingCountries?: string[];
  onPrintShippingCountryChange?: (country: string) => void;
  printCheckoutInFlight?: boolean;
  printCheckoutError?: string | null;
  onStartPrintCheckout?: (options: { variant: PrintVariant; includeDigitalAddOn: boolean }) => void;
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
  printPriceLabels,
  printShippingCountry,
  printShippingCountries = [],
  onPrintShippingCountryChange,
  printCheckoutInFlight = false,
  printCheckoutError = null,
  onStartPrintCheckout,
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
  const framedShippingLabel = formatPrintShippingEstimate("poster_framed", printShippingCountry, "shipping");
  const framedDeliveryLabel = formatPrintDeliveryEstimate("poster_framed", printShippingCountry);
  const unframedShippingLabel = formatPrintShippingEstimate("poster_unframed", printShippingCountry, "shipping");
  const unframedDeliveryLabel = formatPrintDeliveryEstimate("poster_unframed", printShippingCountry);
  const printCheckoutCtaState = getPrintCheckoutCtaState({
    checkoutInFlight: printCheckoutInFlight,
    hasShippingCountry: Boolean(printShippingCountry),
  });

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
  const [showStickyCTA, setShowStickyCTA] = useState(false);

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
  const revealBlockedMessage = !hasDate && !hasLocation
    ? "Add your date and place to unlock preview."
    : !hasDate
      ? "Add your date to unlock preview."
      : !hasLocation
        ? "Add your place to unlock preview."
        : "Presets optional.";
  const hdCreditLabel =
    currentPlan === "subscription"
      ? "Unlimited HD"
      : typeof creditsRemaining === "number"
        ? `${creditsRemaining} HD left`
        : null;
  const digitalCheckoutHelperText = paid
    ? "HD download is unlocked for this map. Free preview stays available."
    : DIGITAL_CHECKOUT_HELPER_TEXT;

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
        return;
      }
      setIntensityDisplay(value);
      setIntensity(value);
      applyVisualOptions(renderMode, value);
    },
    [applyVisualOptions, paid, renderMode, setIntensity, setIntensityDisplay],
  );

  // Handle render mode change
  const handleRenderModeChange = useCallback(
    (mode: RenderModeId) => {
      if ((mode === "cinematic" || mode === "luxe") && !paid) {
        track("paywall_render_mode_blocked", { mode });
        return;
      }
      setRenderMode(mode);
      const targetLevel = mode === "cinematic" ? Math.max(intensityDisplay, 60) : intensityDisplay;
      setIntensity(targetLevel);
      setIntensityDisplay(targetLevel);
      applyVisualOptions(mode, targetLevel);
      track("render_mode_changed", { mode });
    },
    [applyVisualOptions, intensityDisplay, paid, setIntensity, setIntensityDisplay, setRenderMode],
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

  const handleCustomizeMore = useCallback(() => {
    if (isQuick && !allowAdvancedInQuick) {
      onCustomizeMore?.();
      return;
    }
    setShowAdvancedState((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => {
          dateLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  }, [allowAdvancedInQuick, isQuick, onCustomizeMore]);

  const handleStyleChange = useCallback(
    (styleId: typeof selectedStyle) => {
      setStyle(styleId);
      const defaults = applyStyleDefaults(styleId, textBoxes);
      if (Object.keys(defaults.renderOptions).length) {
        setRenderOptions(defaults.renderOptions);
      }
      if (defaults.textBoxes !== textBoxes) {
        setTextBoxes(defaults.textBoxes);
      }
    },
    [setRenderOptions, setStyle, setTextBoxes, textBoxes],
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applySampleMoment}
              className="rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold text-midnight shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
            >
              Try a sample moment
            </button>
            <button
              type="button"
              onClick={handleStartPreset}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:border-white/30 hover:bg-white/10"
            >
              Browse occasion presets
            </button>
            <button
              type="button"
              onClick={handleStartScratch}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:border-white/30 hover:bg-white/10"
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
            aria-label="Generate preview"
            className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-[#0b1a30] ${
              canReveal && !isRevealing
                ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                : "cursor-not-allowed bg-neutral-400/60 text-neutral-700 shadow-none"
            }`}
          >
            {isRevealing ? "Revealing your sky..." : "Generate preview"}
          </button>
          <div className="text-xs text-neutral-400">
            <p>
              {isRevealing
                ? revealStage.description
                : revealBlockedMessage}
            </p>
            <p className="text-[11px] text-neutral-500">Free preview, HD optional.</p>
          </div>
        </div>
      )}

      {/* Section 4: Drawer with Secondary Controls */}
      {showEditor && (
        <EditorDrawer defaultOpen={true}>
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
                              aria-pressed={box.textShadow}
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
                              aria-pressed={box.textGlow}
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
            </section>

            {/* Style */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
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
                        ? "Generate your preview to unlock HD and print options."
                        : revealBlockedMessage}
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
                    <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-[11px] font-semibold text-neutral-200">
                      {revealBlockedMessage}
                    </div>
                  )}
                  <p className="text-[10px] text-neutral-300">
                    {isRevealing ? "This usually takes about a second." : "Free preview, HD optional."}
                  </p>
                  {printCheckoutEnabled && (
                    <p className="text-[10px] text-amber-100/90">
                      Framed and unframed print options unlock after preview.
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
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
            >
              Free preview
            </button>
            <button
              type="button"
              onClick={() => void onExport("hd")}
              aria-label="HD export"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-3 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg active:scale-95"
            >
              {paid ? "HD download" : DIGITAL_CHECKOUT_CTA_LABEL}
            </button>
          </div>
          {hdCreditLabel && (
            <div className="mt-2 flex justify-end">
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80">
                {hdCreditLabel}
              </span>
            </div>
          )}
          <p className="mt-2 text-[10px] text-neutral-300">{digitalCheckoutHelperText}</p>
          <p className="mt-1 text-[10px] text-neutral-400">{DIGITAL_CHECKOUT_TRUST_LINE}</p>
          {printCheckoutEnabled && printPriceLabels && onStartPrintCheckout && (
            <div className="mt-2 rounded-xl border border-amber-300/40 bg-amber-300/10 p-2.5">
              <p className="text-[11px] font-semibold text-amber-100">Choose your print route from this preview</p>
              <p className="mt-1 text-[10px] text-amber-100/80">
                Secure Stripe checkout uses this saved design automatically. Shipping is shown before payment, then
                your print order draft is created right after payment. {shippingDisclosure}
              </p>
              <div className="mt-2 rounded-lg border border-amber-300/30 bg-black/15 px-3 py-2 text-[10px] text-amber-100/85">
                <span className="font-semibold text-amber-100">Fastest:</span> digital only.{" "}
                <span className="font-semibold text-amber-100">Best gift:</span> framed print.{" "}
                <span className="font-semibold text-amber-100">Lower total:</span> unframed print.
              </div>
              {printShippingCountryOptions.length > 0 && (
                <div className="mt-2">
                  <label className="text-[10px] font-semibold text-amber-100/80">Shipping country</label>
                  <select
                    value={printShippingCountry ?? ""}
                    onChange={(event) => onPrintShippingCountryChange?.(event.target.value)}
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
                  {!printShippingCountry && (
                    <div className="mt-2 rounded-lg border border-amber-200/25 bg-white/10 px-3 py-2">
                      <p className="text-[11px] font-semibold text-amber-50">{printCheckoutCtaState.disabledReason}</p>
                      <p className="mt-1 text-[10px] text-amber-100/80">{printCheckoutCtaState.helperText}</p>
                    </div>
                  )}
                  {printShippingCountry && (
                    <p className="mt-1 text-[10px] text-amber-100/80">
                      Estimated shipping to {getPrintShippingCountryLabel(printShippingCountry)}: framed{" "}
                      {framedShippingLabel} · unframed {unframedShippingLabel}. Delivery: framed{" "}
                      {framedDeliveryLabel} · unframed {unframedDeliveryLabel}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onStartPrintCheckout({ variant: "poster_framed", includeDigitalAddOn: true })}
                    disabled={!printShippingCountry || printCheckoutInFlight}
                    title={printCheckoutCtaState.disabledReason ?? undefined}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200/70 bg-amber-300/36 px-4 py-2 text-xs font-semibold text-amber-50 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-300/46 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:bg-amber-300/36"
                  >
                    {printCheckoutInFlight ? (
                      PRINT_CHECKOUT_REDIRECT_LABEL
                    ) : (
                      <span className="text-center leading-tight">
                        <span className="block text-[11px] font-semibold">Framed + HD (recommended)</span>
                        <span className="block text-[10px] text-amber-100/95">
                          {printPriceLabels.framed} + {framedShippingLabel} + {printPriceLabels.digitalAddOn}
                        </span>
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartPrintCheckout({ variant: "poster_framed", includeDigitalAddOn: false })}
                    disabled={!printShippingCountry || printCheckoutInFlight}
                    title={printCheckoutCtaState.disabledReason ?? undefined}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/50 bg-amber-300/20 px-4 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-300/30 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:bg-amber-300/20"
                  >
                    {printCheckoutInFlight ? (
                      PRINT_CHECKOUT_REDIRECT_LABEL
                    ) : (
                      <span className="text-center leading-tight">
                        <span className="block text-[11px] font-semibold">Framed print</span>
                        <span className="block text-[10px] text-amber-100/90">
                          {printPriceLabels.framed} + {framedShippingLabel}
                        </span>
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartPrintCheckout({ variant: "poster_unframed", includeDigitalAddOn: false })}
                    disabled={!printShippingCountry || printCheckoutInFlight}
                    title={printCheckoutCtaState.disabledReason ?? undefined}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/50 bg-amber-100/20 px-4 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-100/30 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:bg-amber-100/20"
                  >
                    {printCheckoutInFlight ? (
                      PRINT_CHECKOUT_REDIRECT_LABEL
                    ) : (
                      <span className="text-center leading-tight">
                        <span className="block text-[11px] font-semibold">Unframed print</span>
                        <span className="block text-[10px] text-amber-100/90">
                          {printPriceLabels.unframed} + {unframedShippingLabel}
                        </span>
                      </span>
                    )}
                  </button>
                </div>
                {(printShippingCountry || printCheckoutInFlight) && (
                  <p className="mt-2 text-[10px] font-semibold text-amber-100/85">{printCheckoutCtaState.helperText}</p>
                )}
                {printCheckoutError ? <p className="mt-2 text-[10px] font-semibold text-rose-200">{printCheckoutError}</p> : null}
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
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
                >
                  🔗 Share
                </button>
                {showEditor && (
                  <button
                    type="button"
                    onClick={onShare}
                    aria-label="Save and remix star map"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow active:scale-95"
                  >
                    💾 Save & Remix
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleCustomizeMore}
                aria-expanded={showEditor}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:bg-amber-300 hover:shadow-lg active:scale-95"
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
              <p className="text-xs font-semibold text-white">Ready to reveal your sky?</p>
              <p className="text-[10px] text-neutral-300">
                {isRevealing ? "Rendering your reveal..." : "Free preview, HD optional."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleReveal}
              data-testid="mobile-sticky-generate"
              disabled={isRevealing}
              className={`rounded-full px-3 py-2 text-xs font-semibold text-midnight shadow-md transition ${
                isRevealing
                  ? "cursor-not-allowed bg-neutral-400/60 text-neutral-700 shadow-none"
                  : "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:-translate-y-[1px] hover:shadow-lg"
              }`}
            >
              {isRevealing ? "Revealing..." : "Generate preview"}
            </button>
          </div>
        </div>
      )}
      </div>
    </EditorFontShell>
  );
}
