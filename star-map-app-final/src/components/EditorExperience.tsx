"use client";

import dynamic from "next/dynamic";
import { TextBox, useStore } from "@/lib/store";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap } from "@/lib/renderSky";
import { getShapeData } from "@/lib/shapeUtils";
import { buildStarMapDownloadFilename } from "@/lib/downloadFilename";
import type { Shape } from "@/lib/types";
import {
  track,
  trackBeginCheckout,
  trackCheckoutClientDiagnostic,
  trackExperimentExposure,
  trackFunnelStep,
} from "@/lib/analytics";
import { formatPrice, getPricingTiers, type CheckoutOrderType, type CheckoutPlan, type PrintVariant } from "@/lib/pricing";
import { applyStyleDefaults } from "@/lib/styleDefaults";
import { occasionPresets } from "@/lib/occasionPresets";
import type { RenderModeId } from "@/lib/renderModes";
import { styles, fontOptions, shapes, shapeSymbols, shapeSymbolScale, mapLookTiers } from "@/lib/config";
import { applyMapLookTier, applyTierTypography, resolveMapLookTier, type MapLookTier } from "@/lib/mapLookTiers";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useEditorLogic } from "@/hooks/useEditorLogic";
import { getPaywallCopyVariant, PAYWALL_COPY_EXPERIMENT, type PaywallCopyVariant } from "@/lib/experiments";
import { PaywallModal } from "@/components/PaywallModal";
import { PrintAspectMismatchNotice } from "@/components/PrintAspectMismatchNotice";
import { PrintGiftDecisionPanel } from "@/components/PrintGiftDecisionPanel";
import {
  createHdConsumeToken,
  formatHdExportConsumeFailedMessage,
  formatHdExportFailedMessage,
  postHdCreditConsume,
  triggerBlobDownload,
} from "@/lib/hdExportFulfillment";
import { getPrintAllowedCountries, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import {
  getPrintShippingCountryLabel,
  getPrintShippingCountryOptions,
  readStoredPrintShippingCountry,
  storePrintShippingCountry,
} from "@/lib/printfulShipping";
import { isPrintVariant, parsePrintVariant } from "@/lib/printCatalog";
import {
  formatPosterShippingFootnote,
  getPaywallPrintCheckoutPresentation,
  paywallPrintCheckoutRowKey,
  paywallPrintSkuButtonClassesEditorPanel,
} from "@/lib/paywallPrintCheckout";
import {
  getMerchFamily,
  isMerchFamilyId,
  listMerchFamiliesEnabledForPublicUi,
  type MerchFamilyId,
} from "@/lib/merchCatalog";
import { getRevealProgressPercent, REVEAL_STAGES } from "@/lib/revealExperience";
import { normalizeReferralCode, readStoredReferralCode } from "@/lib/referrals";
import {
  resolveEditorGiftTrafficIntent,
  isWeddingCommerceContext,
  shouldAutoOpenEditorDigitalPaywall,
} from "@/lib/previewSourceHints";
import { stableMapRecipeFingerprint } from "@/lib/mapRecipeFingerprint";
import { cardRecipeFingerprintSuffix, getCard4x6ExportDimensions } from "@/lib/printCardExport";
import {
  isHydratableMapRecipe,
  normalizeHydratedLocation,
  resolveRecipeAspectRatio,
  resolveRecipeShape,
  type HydratableMapRecipe,
} from "@/lib/mapRecipeHydration";
import { parseMapIdParam } from "@/lib/mapId";

const MobileCreate = dynamic(() => import("@/app/MobileCreate").then((mod) => mod.MobileCreate), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-neutral-300 shadow-sm shadow-black/30">
      Loading editor...
    </div>
  ),
});

const DateTimeControls = dynamic(() => import("@/components/DateTimeControls"), {
  ssr: false,
  loading: () => (
    <div className="h-24 rounded-xl border border-white/15 bg-white/5 shadow-inner shadow-black/30" />
  ),
});

const LocationSearch = dynamic(() => import("@/components/LocationSearch"), {
  ssr: false,
  loading: () => (
    <div className="h-24 rounded-xl border border-white/15 bg-white/5 shadow-inner shadow-black/30" />
  ),
});

const PreviewCanvas = dynamic(() => import("@/components/PreviewCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-xl border border-white/10 bg-white/5" />,
});

const ProPresetsPanel = dynamic(
  () => import("@/components/ProPresetsPanel").then((mod) => mod.ProPresetsPanel),
  {
    ssr: false,
    loading: () => (
      <div className="hidden rounded-2xl border border-white/15 bg-white/5 p-3 shadow-sm shadow-black/30 lg:block" />
    ),
  }
);

const AdvancedPanel = dynamic(() => import("@/components/AdvancedPanel").then((mod) => mod.AdvancedPanel), {
  ssr: false,
  loading: () => <div className="mt-2 h-40 rounded-xl border border-white/15 bg-white/5" />,
});

const DRAFT_KEY = "star-map-draft";
const AUTO_EXPORT_KEY = "star-map-auto-export";
const REVEALED_FLAG = "star-map-last-revealed";
const CHECKOUT_MAP_KEY = "star-map-checkout-id";
const PROMO_CODE_KEY = "star-map-promo-code";
const MAX_PRINT_ASSET_BYTES = 16 * 1024 * 1024;
const REVEAL_ANIMATION_MS = 900;
const DEFAULT_TITLE_TEXT = "our night sky";

function isLikelyLowMemoryDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
  const maybeDeviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowMemoryHint = typeof maybeDeviceMemory === "number" && maybeDeviceMemory > 0 && maybeDeviceMemory <= 4;
  return mobileUA || lowMemoryHint;
}

function getDownloadLocationHint() {
  if (typeof navigator === "undefined") return "Download started. Check your browser's download history if you don't see the file.";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "Download started. On iPhone/iPad, open Files app -> Browse -> Downloads to find it.";
  }
  if (/Android/i.test(ua)) {
    return "Download started. On Android, open Files/My Files -> Downloads (or your browser download history).";
  }
  return "Download started. Check your Downloads folder (or browser download history) if it doesn't appear immediately.";
}

function normalizePromoCode(raw: string | null | undefined) {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(normalized)) return null;
  return normalized;
}

function parseDateParamToIso(dateParam: string) {
  const trimmed = dateParam.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed.toISOString();
}

function parsePrintVariantParam(raw: string | null | undefined): PrintVariant | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return isPrintVariant(trimmed) ? trimmed : null;
}

function parseShippingCountryParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return normalized;
}

function estimateDataUrlBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return Number.POSITIVE_INFINITY;
  const base64 = dataUrl.slice(commaIndex + 1);
  const paddingLength = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - paddingLength;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Failed to generate image blob"));
    }, "image/png");
  });
}

type PaywallIntent = "digital" | "print";

export type EditorExperienceVariant = "quick" | "full";

interface EditorExperienceProps {
  variant?: EditorExperienceVariant;
  editorRef?: RefObject<HTMLDivElement | null>;
  allowAdvancedInQuick?: boolean;
}

export function EditorExperience({
  variant = "quick",
  editorRef,
  allowAdvancedInQuick = false,
}: EditorExperienceProps) {
  // Loading state callback for visual options
  const [isUpdating, setIsUpdating] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const onVisualOptionsApplied = useCallback(() => {
    setIsUpdating(true);
    setCanvasReady(false);
  }, []);

  // Use shared editor logic hook
  const {
    dateTime,
    location,
    textBoxes,
    selectedStyle,
    aspectRatio,
    shape,
    renderOptions,
    previewFidelity,
    paid,
    revealed,
    setDateTime,
    setLocation,
    setTextBoxes,
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
    applyPreset: hookApplyPreset,
    applyProPreset,
  } = useEditorLogic({ variant, onVisualOptionsApplied });

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
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [currentPlan, setCurrentPlan] = useState<CheckoutPlan | null>(null);

  // Compute pricing labels once (never change during session)
  const priceLabels = useMemo(() => {
    const tiers = getPricingTiers();
    return {
      single: formatPrice(tiers.single.amountCents, tiers.single.currency),
      pack3: formatPrice(tiers.pack3.amountCents, tiers.pack3.currency),
      subscription: formatPrice(tiers.subscription.amountCents, tiers.subscription.currency),
    };
  }, []);
  const paywallVariant = useMemo<PaywallCopyVariant>(() => getPaywallCopyVariant(), []);
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );

  const hdCreditLabel =
    !paid
      ? null
      : currentPlan === "subscription"
        ? "Unlimited HD"
        : typeof creditsRemaining === "number" && creditsRemaining > 0
          ? `${creditsRemaining} HD credit${creditsRemaining === 1 ? "" : "s"} left`
          : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>(() => ({
    dateLocation: false,
    textStyling: true,
    style: true,
    shape: true,
    frame: true,
    advanced: true,
  }));
  const [collapsedTextBoxes, setCollapsedTextBoxes] = useState<Record<string, boolean>>(() => ({
    subtitle: true,
    dedication: true,
  }));
  const [showOccasionPresets, setShowOccasionPresets] = useState(false);
  const [showProPresets, setShowProPresets] = useState(false);
  const [restored, setRestored] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallIntent, setPaywallIntent] = useState<PaywallIntent>("digital");
  const [preferredPrintVariant, setPreferredPrintVariant] = useState<PrintVariant>("poster_framed");
  const [preferredIncludeDigitalAddOn, setPreferredIncludeDigitalAddOn] = useState(false);
  const enabledMerchFamilies = useMemo(() => listMerchFamiliesEnabledForPublicUi(), []);
  const defaultMerchFamily = (enabledMerchFamilies[0]?.id ?? "sticker_kisscut") as MerchFamilyId;
  const [selectedMerchFamily, setSelectedMerchFamily] = useState<MerchFamilyId>(defaultMerchFamily);
  const [selectedMerchSize, setSelectedMerchSize] = useState<string>("");
  const [selectedMerchColor, setSelectedMerchColor] = useState<string>("");
  const printShippingCountries = useMemo(() => getPrintAllowedCountries(), []);
  const printShippingCountryOptions = useMemo(
    () => getPrintShippingCountryOptions(printShippingCountries),
    [printShippingCountries],
  );
  const [printShippingCountry, setPrintShippingCountry] = useState<string | null>(null);
  const [, setPendingExport] = useState<"preview" | "hd" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutInFlight, setCheckoutInFlight] = useState(false);
  const checkoutInFlightRef = useRef(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [autoExportPending, setAutoExportPending] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealStageIndex, setRevealStageIndex] = useState(0);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const searchParams = useSearchParams();
  const isDesktopQuery = useIsDesktop();
  const consumePromiseRef = useRef<Promise<boolean> | null>(null);
  const [hdExportInFlight, setHdExportInFlight] = useState(false);
  const hdExportInFlightRef = useRef(false);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);
  const prefillAppliedRef = useRef(false);
  const printIntentHandledRef = useRef(false);
  const digitalIntentHandledRef = useRef(false);
  const mapFromUrlHandledRef = useRef(false);
  const loadedMapIdRef = useRef<string | null>(null);
  const loadedMapFingerprintRef = useRef<string | null>(null);
  const queryPromoCode = normalizePromoCode(searchParams.get("code"));
  const queryReferralCode = normalizeReferralCode(searchParams.get("ref"));
  const mapIdFromQuery = useMemo(() => parseMapIdParam(searchParams.get("map_id")), [searchParams]);
  const merchFamilyFromQuery = searchParams.get("merch_family");
  const revealStage = REVEAL_STAGES[revealStageIndex];
  const revealProgress = getRevealProgressPercent(revealStageIndex);
  const setPrintShippingCountryValue = useCallback(
    (country: string, source: "initial" | "query-param" | "editor-panel" | "mobile-preview" | "paywall-modal") => {
      const normalized = country.trim().toUpperCase();
      if (!printShippingCountries.includes(normalized)) return;
      setPrintShippingCountry(normalized);
      storePrintShippingCountry(normalized);
      if (source !== "initial" && normalized !== printShippingCountry) {
        track("print_shipping_country_selected", {
          source,
          country: normalized,
        });
      }
    },
    [printShippingCountries, printShippingCountry],
  );
  useEffect(() => {
    const stored = readStoredPrintShippingCountry();
    if (stored && printShippingCountries.includes(stored)) {
      setPrintShippingCountryValue(stored, "initial");
      return;
    }
    if (printShippingCountries.length) {
      setPrintShippingCountryValue(printShippingCountries[0], "initial");
    }
  }, [printShippingCountries, setPrintShippingCountryValue]);

  useEffect(() => {
    if (!merchFamilyFromQuery?.trim()) return;
    const id = merchFamilyFromQuery.trim();
    if (!isMerchFamilyId(id)) return;
    if (!enabledMerchFamilies.some((f) => f.id === id)) return;
    setSelectedMerchFamily(id);
    const fam = getMerchFamily(id);
    setSelectedMerchSize(fam.options.size?.[0] ?? "");
    setSelectedMerchColor(fam.options.color?.[0] ?? "");
  }, [merchFamilyFromQuery, enabledMerchFamilies]);

  const readStoredPromoCode = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      return normalizePromoCode(window.localStorage.getItem(PROMO_CODE_KEY));
    } catch {
      return null;
    }
  }, []);
  const getCheckoutPromoCode = useCallback(
    () => queryPromoCode ?? readStoredPromoCode(),
    [queryPromoCode, readStoredPromoCode]
  );
  const getCheckoutReferralCode = useCallback(
    () => queryReferralCode ?? readStoredReferralCode(),
    [queryReferralCode]
  );
  const getPreviewSource = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = sessionStorage.getItem("preview_source");
      return stored?.trim() || null;
    } catch {
      return null;
    }
  }, []);

  const trackPaywallOpenedEvent = useCallback(
    (intent: PaywallIntent, trigger?: string) => {
      track("paywall_opened", {
        visualMode: renderOptions.visualMode,
        experiment: PAYWALL_COPY_EXPERIMENT,
        variant: paywallVariant,
        intent,
        source: getPreviewSource() ?? "editor",
        ...(trigger ? { trigger } : {}),
      });
    },
    [getPreviewSource, paywallVariant, renderOptions.visualMode],
  );

  useEffect(() => {
    if (!queryPromoCode || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PROMO_CODE_KEY, queryPromoCode);
    } catch {
      // ignore storage errors
    }
  }, [queryPromoCode]);

  useEffect(() => {
    if (!paywallOpen) return;
    trackExperimentExposure(PAYWALL_COPY_EXPERIMENT, paywallVariant, { source: "editor" });
  }, [paywallOpen, paywallVariant]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

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

  const [showAdvancedState, setShowAdvancedState] = useState(!isQuick);
  const shippingDisclosure = getPrintShippingDisclosure();
  const posterShippingFootnote = useMemo(
    () => formatPosterShippingFootnote(printShippingCountry),
    [printShippingCountry],
  );
  const printCheckoutRows = useMemo(
    () => getPaywallPrintCheckoutPresentation(printShippingCountry),
    [printShippingCountry],
  );
  const activeMapLookTier = useMemo(
    () => resolveMapLookTier(renderOptions, selectedStyle),
    [renderOptions, selectedStyle],
  );
  const posterAspectMismatch = aspectRatio !== "square";
  const allowAdvanced = !isQuick || allowAdvancedInQuick;
  const showAdvanced = allowAdvanced ? showAdvancedState : false;
  const previewRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const presetRailRef = useRef<HTMLDivElement>(null);
  const dateLocationRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  // Wrap hook's applyPreset to scroll to dateLocationRef
  const applyPreset = useCallback(
    (id: string) => {
      hookApplyPreset(id, dateLocationRef.current);
    },
    [hookApplyPreset]
  );

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
  useEffect(() => {
    if (selectedOccasion) {
      setShowOccasionPresets(true);
    }
  }, [selectedOccasion]);
  const handleEditScroll = useCallback(() => {
    inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
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
    [selectedOccasion, setCustomOccasion, setDateTime, setSelectedOccasion]
  );

  const handleLocationChange = useCallback(() => {
    setCustomOccasion(true);
    if (selectedOccasion) {
      setSelectedOccasion(null);
    }
  }, [selectedOccasion, setCustomOccasion, setSelectedOccasion]);

  const refreshPaidStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/premium", { cache: "no-store" });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        paid?: boolean;
        creditsRemaining?: number | null;
        plan?: CheckoutPlan | null;
      };
      const nextPaid = Boolean(data.paid);
      setPaid(nextPaid);
      setCreditsRemaining(
        nextPaid && typeof data.creditsRemaining === "number" ? data.creditsRemaining : null,
      );
      setCurrentPlan(
        data.plan === "single" || data.plan === "pack3" || data.plan === "subscription" ? data.plan : null
      );
      return nextPaid;
    } catch {
      return false;
    }
  }, [setPaid]);

  const consumeHdCredit = useCallback(async (tokenOverride?: string) => {
    if (consumePromiseRef.current) return consumePromiseRef.current;
    const promise = (async () => {
      try {
        const consumeToken = tokenOverride ?? createHdConsumeToken();
        const data = await postHdCreditConsume(consumeToken);
        if (!data) return false;
        if (typeof data.creditsRemaining === "number") {
          setCreditsRemaining(data.creditsRemaining);
        } else if (data.plan === "subscription") {
          setCreditsRemaining(null);
          setPaid(true);
        }
        return true;
      } catch {
        return false;
      } finally {
        consumePromiseRef.current = null;
      }
    })();
    consumePromiseRef.current = promise;
    return promise;
  }, [setPaid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
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
        } catch {
          // ignore bad drafts
        }
      }
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
    try {
      const revealedFlag = localStorage.getItem(REVEALED_FLAG);
      if (revealedFlag === "true") {
        setRevealed(true);
      }
      const autoFlag = localStorage.getItem(AUTO_EXPORT_KEY);
      if (autoFlag === "hd") {
        setAutoExportPending(true);
      }
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
    setRestored(true);
    void refreshPaidStatus();
  }, [
    setDateTime,
    setLocation,
    setRenderOptions,
    setRevealed,
    setCustomOccasion,
    setSelectedOccasion,
    setStyle,
    setTextBoxes,
    setAspectRatio,
    setShape,
    refreshPaidStatus,
  ]);

  useEffect(() => {
    if (!restored || prefillAppliedRef.current) return;
    const sourceParam = searchParams.get("source");
    const dateParam = searchParams.get("date");
    const locationParam = searchParams.get("location");
    const checkoutParam = searchParams.get("checkout");
    const utmCampaignParam = searchParams.get("utm_campaign");
    const printVariantParam = parsePrintVariantParam(searchParams.get("print_variant"));
    const includeDigitalAddOnParam = searchParams.get("include_digital_addon");
    const shippingCountryParam = parseShippingCountryParam(searchParams.get("shipping_country"));
    if (
      !dateParam &&
      !locationParam &&
      !sourceParam &&
      !checkoutParam &&
      !printVariantParam &&
      !shippingCountryParam &&
      !utmCampaignParam
    ) {
      return;
    }

    let hasValidDate = false;
    if (dateParam) {
      const parsedISO = parseDateParamToIso(dateParam);
      if (parsedISO) {
        setDateTime(parsedISO);
        hasValidDate = true;
      }
    }

    let hasLocation = false;
    if (locationParam && locationParam.trim()) {
      setLocation({ name: locationParam.trim() });
      hasLocation = true;
    }

    if (hasValidDate && hasLocation) {
      setRevealed(true);
    }

    const giftTraffic = resolveEditorGiftTrafficIntent({
      source: sourceParam,
      checkoutParam,
      printVariantParam,
      utmCampaign: utmCampaignParam,
      explicitIncludeDigitalAddOn: /^(1|true|yes)$/i.test(includeDigitalAddOnParam ?? ""),
    });

    if (printVariantParam) {
      setPreferredPrintVariant(printVariantParam);
    } else if (giftTraffic.paywallIntent === "print") {
      setPreferredPrintVariant(giftTraffic.preferredPrintVariant);
    }

    if (/^(1|true|yes)$/i.test(includeDigitalAddOnParam ?? "")) {
      setPreferredIncludeDigitalAddOn(true);
    } else if (giftTraffic.preferredIncludeDigitalAddOn) {
      setPreferredIncludeDigitalAddOn(true);
    }

    if (shippingCountryParam && printShippingCountries.includes(shippingCountryParam)) {
      setPrintShippingCountryValue(shippingCountryParam, "query-param");
    }
    if (shouldAutoOpenEditorDigitalPaywall(sourceParam, checkoutParam)) {
      setPaywallIntent("digital");
    } else if (giftTraffic.paywallIntent === "print") {
      setPaywallIntent("print");
    }

    trackFunnelStep("preview_started", {
      source: sourceParam ?? "editor-direct",
      hasDate: hasValidDate,
      hasLocation,
    });
    try {
      if (sourceParam) {
        sessionStorage.setItem("preview_source", sourceParam);
      }
    } catch {
      // ignore storage errors
    }

    prefillAppliedRef.current = true;
  }, [
    printShippingCountries,
    restored,
    searchParams,
    setDateTime,
    setLocation,
    setPrintShippingCountryValue,
    setRevealed,
  ]);

  const applyHydratedMapRecipe = useCallback(
    (recipe: HydratableMapRecipe) => {
      if (recipe.datetimeISO) setDateTime(recipe.datetimeISO);
      if (recipe.location) setLocation(normalizeHydratedLocation(recipe.location));
      if (recipe.textBoxes?.length) setTextBoxes(recipe.textBoxes);
      if (recipe.selectedStyle) setStyle(recipe.selectedStyle);
      const aspect = resolveRecipeAspectRatio(recipe);
      if (aspect) setAspectRatio(aspect);
      const shapeValue = resolveRecipeShape(recipe);
      if (shapeValue) setShape(shapeValue);
      if (recipe.renderOptions) setRenderOptions(recipe.renderOptions);
      if (recipe.selectedOccasion) {
        setSelectedOccasion(recipe.selectedOccasion);
        setCustomOccasion(false);
      } else if (recipe.location?.name) {
        setCustomOccasion(true);
      }
      if (recipe.location?.name) {
        setRevealed(true);
      }
    },
    [
      setAspectRatio,
      setCustomOccasion,
      setDateTime,
      setLocation,
      setRenderOptions,
      setRevealed,
      setSelectedOccasion,
      setShape,
      setStyle,
      setTextBoxes,
    ],
  );

  useEffect(() => {
    if (!restored || mapFromUrlHandledRef.current || !mapIdFromQuery) return;
    mapFromUrlHandledRef.current = true;

    void (async () => {
      try {
        const res = await fetch(`/api/maps?id=${encodeURIComponent(mapIdFromQuery)}`);
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        if (!isHydratableMapRecipe(data)) return;

        applyHydratedMapRecipe(data);
        loadedMapIdRef.current = mapIdFromQuery;
        loadedMapFingerprintRef.current = stableMapRecipeFingerprint(
          buildRecipeFromState({
            dateTime: data.datetimeISO,
            location: normalizeHydratedLocation(data.location),
            textBoxes: data.textBoxes ?? [],
            selectedStyle: data.selectedStyle ?? selectedStyle,
            aspectRatio: resolveRecipeAspectRatio(data) ?? aspectRatio,
            shape: resolveRecipeShape(data) ?? shape,
            renderOptions: data.renderOptions ?? renderOptions,
          }),
        );

        try {
          localStorage.setItem(CHECKOUT_MAP_KEY, mapIdFromQuery);
        } catch {
          // ignore storage errors
        }

        trackFunnelStep("preview_started", {
          source: "map-hub",
          hasDate: true,
          hasLocation: Boolean(data.location?.name),
        });
      } catch {
        // ignore failed hydration; editor still works from draft
      }
    })();
  }, [
    applyHydratedMapRecipe,
    aspectRatio,
    mapIdFromQuery,
    renderOptions,
    restored,
    selectedStyle,
    shape,
  ]);

  useEffect(() => {
    if (!restored || !revealed || paid || digitalIntentHandledRef.current) return;
    const checkoutParam = searchParams.get("checkout");
    const sourceParam = searchParams.get("source");
    if (!shouldAutoOpenEditorDigitalPaywall(sourceParam, checkoutParam)) return;

    digitalIntentHandledRef.current = true;
    setPaywallIntent("digital");
    setPaywallOpen(true);
    setCheckoutError(null);
    trackPaywallOpenedEvent("digital", "checkout_param");
  }, [paid, paywallVariant, renderOptions.visualMode, restored, revealed, searchParams, trackPaywallOpenedEvent]);

  useEffect(() => {
    if (!restored || !revealed || paid || !printCheckoutEnabled || printIntentHandledRef.current) return;
    const sourceParam = searchParams.get("source");
    const checkoutParam = searchParams.get("checkout");
    const utmCampaignParam = searchParams.get("utm_campaign");
    const printVariantParam = parsePrintVariantParam(searchParams.get("print_variant"));
    const includeDigitalAddOnParam = searchParams.get("include_digital_addon");
    const giftTraffic = resolveEditorGiftTrafficIntent({
      source: sourceParam,
      checkoutParam,
      printVariantParam,
      utmCampaign: utmCampaignParam,
      explicitIncludeDigitalAddOn: /^(1|true|yes)$/i.test(includeDigitalAddOnParam ?? ""),
    });
    if (!giftTraffic.autoOpenPaywall) {
      return;
    }
    if (shouldAutoOpenEditorDigitalPaywall(sourceParam, checkoutParam)) {
      return;
    }

    printIntentHandledRef.current = true;
    setPaywallIntent("print");
    if (giftTraffic.preferredIncludeDigitalAddOn) {
      setPreferredIncludeDigitalAddOn(true);
    }
    setPaywallOpen(true);
    setCheckoutError(null);
    trackPaywallOpenedEvent("print", "gift_traffic_auto");
  }, [paid, paywallVariant, printCheckoutEnabled, renderOptions.visualMode, restored, revealed, searchParams, trackPaywallOpenedEvent]);

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
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setLastDraftSavedAt(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  }, [
    aspectRatio,
    dateTime,
    location,
    renderOptions,
    restored,
    selectedOccasion,
    selectedStyle,
    shape,
    textBoxes,
  ]);

  const toggleCard = (id: string) =>
    setCollapsedCards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));

  const setCardState = (updates: Record<string, boolean>) =>
    setCollapsedCards((prev) => ({ ...prev, ...updates }));

  const handleReveal = useCallback(() => {
    if (isRevealing) return;
    if (!canReveal || !hasDate) {
      inputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const revealStartedAt = Date.now();
    setRevealStageIndex(0);
    setIsRevealing(true);
    track("preview_reveal_animation_started", {
      source: getPreviewSource() ?? "editor",
      visualMode: renderOptions.visualMode,
    });
    if (typeof window !== "undefined" && revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    revealTimerRef.current = window.setTimeout(() => {
      setRevealed(true);
      setIsRevealing(false);
      setRevealStageIndex(0);
      revealTimerRef.current = null;
      // Shift into edit mode with a compact default panel state.
      setCollapsedCards((prev) => ({
        ...prev,
        dateLocation: true,
        textStyling: true,
        style: true,
        shape: true,
        frame: true,
        advanced: true,
      }));
      track("reveal_map", { visualMode: renderOptions.visualMode, isPaid: paid });
      track("preview_reveal_animation_completed", {
        source: getPreviewSource() ?? "editor",
        durationMs: Math.max(0, Date.now() - revealStartedAt),
      });
      trackFunnelStep("editor_reveal", { source: getPreviewSource() ?? "editor" });
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(REVEALED_FLAG, "true");
        } catch {
          // ignore storage errors (e.g. private browsing)
        }
      }
      requestAnimationFrame(() => {
        previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, REVEAL_ANIMATION_MS);
  }, [canReveal, getPreviewSource, hasDate, isRevealing, paid, renderOptions.visualMode, setRevealed]);

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

  const applySampleMoment = useCallback(() => {
    const preset = occasionPresets.find((item) => item.id === "wedding") ?? occasionPresets[0];
    if (!preset) return;
    applyPreset(preset.id);
    track("sample_moment_applied", { preset: preset.id });
    dateLocationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [applyPreset]);

  const renderExportFile = useCallback(
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
        // Keep free preview exports visually aligned with paid HD output (only resolution/watermark differ).
        quality: "export",
        premium,
      });

      const blob = await canvasToPngBlob(canvas);
      const filename = buildStarMapDownloadFilename({
        recipe,
        mode: mode === "hd" ? "hd" : "preview",
      });
      return { blob, filename };
    },
    [aspectRatio, dateTime, location, paid, renderOptions, selectedStyle, shape, textBoxes]
  );

  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const result = triggerBlobDownload(blob, filename);
    if (result.ok) {
      setDownloadHint(getDownloadLocationHint());
    }
    return result;
  }, []);

  useEffect(() => {
    if (!downloadHint) return;
    const timeout = window.setTimeout(() => setDownloadHint(null), 12000);
    return () => window.clearTimeout(timeout);
  }, [downloadHint]);

  useEffect(() => {
    if (!restored || !autoExportPending || !paid) return;
    setRevealed(true);
  }, [autoExportPending, paid, restored, setRevealed]);

  // Intentionally no auto-scroll on auto-export to avoid unexpected page jumps.

  useEffect(() => {
    if (!autoExportPending || !canvasReady || !paid) return;

    let mounted = true;
    const id = requestAnimationFrame(() => {
      if (hdExportInFlightRef.current) return;
      hdExportInFlightRef.current = true;
      setHdExportInFlight(true);
      renderExportFile("hd", true)
        .then(async (rendered) => {
          const triggered = triggerDownload(rendered.blob, rendered.filename);
          if (!triggered.ok) {
            setCheckoutError(formatHdExportFailedMessage(true));
            return;
          }
          const consumed = await consumeHdCredit();
          if (!consumed) {
            setCheckoutError(formatHdExportConsumeFailedMessage());
          }
        })
        .catch(() => {
          setCheckoutError(formatHdExportFailedMessage(true));
        })
        .finally(() => {
          hdExportInFlightRef.current = false;
          setHdExportInFlight(false);
          if (mounted) {
            try {
              localStorage.removeItem(AUTO_EXPORT_KEY);
            } catch {
              // ignore storage errors (e.g. private browsing)
            }
            setAutoExportPending(false);
          }
        });
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(id);
    };
  }, [autoExportPending, canvasReady, consumeHdCredit, paid, renderExportFile, triggerDownload]);

  const handleExport = useCallback(
    async (mode: "preview" | "hd") => {
      const isHd = mode === "hd";
      if (isHd) {
        if (hdExportInFlightRef.current) return;
        hdExportInFlightRef.current = true;
        setHdExportInFlight(true);
      }
      let hasAccess = paid;
      if (isHd && !paid) {
        hasAccess = await refreshPaidStatus();
        if (!hasAccess) {
          setPendingExport(mode);
          setPaywallIntent("digital");
          setPaywallOpen(true);
          setCheckoutError(null);
          track("paywall_view", {
            visualMode: renderOptions.visualMode,
            experiment: PAYWALL_COPY_EXPERIMENT,
            variant: paywallVariant,
          });
          trackPaywallOpenedEvent("digital", "hd_export_gate");
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(AUTO_EXPORT_KEY, mode);
              if (revealed) localStorage.setItem(REVEALED_FLAG, "true");
            } catch {
              // ignore storage errors (e.g. private browsing)
            }
          }
          return;
        }
      }
      try {
        if (isHd) {
          const rendered = await renderExportFile("hd", true);
          const triggered = triggerDownload(rendered.blob, rendered.filename);
          if (!triggered.ok) {
            setCheckoutError(formatHdExportFailedMessage(true));
            return;
          }
          const consumed = await consumeHdCredit();
          if (!consumed) {
            setCheckoutError(formatHdExportConsumeFailedMessage());
            return;
          }
          track("export_hd_clicked", {
            isPaid: hasAccess,
            visualMode: renderOptions.visualMode,
            exportResolution: 6000,
          });
          trackFunnelStep("download_started", { source: "editor" });
          track("export_download", { type: "hd" });
          trackFunnelStep("download_completed", { source: "editor" });
          return;
        }
        track("export_free_clicked", {
          isPaid: hasAccess,
          visualMode: renderOptions.visualMode,
          exportResolution: 1200,
        });
        track("export_download", { type: "preview" });
        const renderedPreview = await renderExportFile("preview", hasAccess);
        triggerDownload(renderedPreview.blob, renderedPreview.filename);
      } catch (error) {
        console.error("Export failed", error);
        if (isHd) {
          setCheckoutError(formatHdExportFailedMessage(true));
        }
      } finally {
        if (isHd) {
          hdExportInFlightRef.current = false;
          setHdExportInFlight(false);
        }
      }
    },
    [
      consumeHdCredit,
      paid,
      paywallVariant,
      refreshPaidStatus,
      renderExportFile,
      renderOptions.visualMode,
      revealed,
      triggerDownload,
    ]
  );

  const startCheckout = useCallback(
    async (
      plan: CheckoutPlan,
      options?: {
        orderType?: CheckoutOrderType;
        printVariant?: PrintVariant;
        merchFamily?: MerchFamilyId;
        merchOptions?: { size?: string; color?: string };
        includeDigitalAddOn?: boolean;
        includeCardAddOn?: boolean;
      },
    ) => {
      if (checkoutInFlightRef.current) return;
      const previewSource = getPreviewSource() ?? "editor";
      const promoCode = getCheckoutPromoCode();
      const referralCode = getCheckoutReferralCode();
      const orderType = options?.orderType === "print" ? "print" : "digital";
      const merchFamily = typeof options?.merchFamily === "string" ? options.merchFamily : undefined;
      const merchOptions =
        options?.merchOptions && typeof options.merchOptions === "object"
          ? {
              size: typeof options.merchOptions.size === "string" ? options.merchOptions.size : undefined,
              color: typeof options.merchOptions.color === "string" ? options.merchOptions.color : undefined,
            }
          : undefined;
      const printVariant = parsePrintVariant(
        orderType === "print" ? options?.printVariant : undefined,
        "poster_framed",
      );
      const includeDigitalAddOn = Boolean(options?.includeDigitalAddOn);
      const includeCardAddOn = Boolean(options?.includeCardAddOn);
      const recipeForCheckout = buildRecipeFromState({
        dateTime,
        location,
        textBoxes,
        selectedStyle,
        aspectRatio,
        shape,
        renderOptions,
      });
      let checkoutApiResponseReceived = false;
      try {
        checkoutInFlightRef.current = true;
        setCheckoutInFlight(true);
        setCheckoutError(null);
        track("checkout_started", {
          visualMode: renderOptions.visualMode,
          plan,
          orderType,
          printVariant: orderType === "print" ? printVariant : undefined,
          includeDigitalAddOn: orderType === "print" ? includeDigitalAddOn : undefined,
          includeCardAddOn: orderType === "print" ? includeCardAddOn : undefined,
          promoApplied: Boolean(promoCode),
          referralApplied: Boolean(referralCode),
        });
        let mapId: string | null = null;
        let mapSaveError: string | null = null;
        const recipeFingerprint = stableMapRecipeFingerprint(recipeForCheckout);
        if (
          loadedMapIdRef.current &&
          loadedMapFingerprintRef.current &&
          loadedMapFingerprintRef.current === recipeFingerprint
        ) {
          mapId = loadedMapIdRef.current;
          try {
            localStorage.setItem(CHECKOUT_MAP_KEY, mapId);
          } catch {
            // ignore storage errors
          }
        } else {
          try {
            const mapRes = await fetch("/api/maps", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(recipeForCheckout),
            });
            if (mapRes.ok) {
              const data = (await mapRes.json()) as { id?: string };
              if (typeof data.id === "string" && data.id.trim()) {
                mapId = data.id.trim();
                loadedMapIdRef.current = mapId;
                loadedMapFingerprintRef.current = recipeFingerprint;
                try {
                  localStorage.setItem(CHECKOUT_MAP_KEY, mapId);
                } catch {
                  // ignore storage errors (e.g. private browsing)
                }
              }
            } else {
              mapSaveError = `save_failed_${mapRes.status}`;
            }
          } catch {
            mapSaveError = "save_failed_network";
          }
        }
        if (!mapId) {
          throw new Error(mapSaveError ?? "map_save_failed");
        }

        const checkoutPayload: {
          mapId?: string;
          plan: CheckoutPlan;
          promoCode?: string;
          orderType?: CheckoutOrderType;
          printVariant?: PrintVariant;
          merchFamily?: MerchFamilyId;
          merchOptions?: { size?: string; color?: string };
          includeDigitalAddOn?: boolean;
          includeCardAddOn?: boolean;
          printAssetId?: string;
          cardPrintAssetId?: string;
          recipeFingerprint?: string;
          shippingCountry?: string;
          referralCode?: string;
        } = { plan };
        if (mapId) checkoutPayload.mapId = mapId;
        if (promoCode) checkoutPayload.promoCode = promoCode;
        if (referralCode) checkoutPayload.referralCode = referralCode;
        if (orderType === "print") {
          if (!printShippingCountry) {
            throw new Error("missing_shipping_country");
          }
          if (merchFamily) {
            checkoutPayload.merchFamily = merchFamily;
            if (merchOptions) checkoutPayload.merchOptions = merchOptions;
          }
          const recipeFingerprint = stableMapRecipeFingerprint(recipeForCheckout);
          checkoutPayload.recipeFingerprint = recipeFingerprint;
          if (typeof document !== "undefined" && document.fonts) {
            await document.fonts.ready;
          }
          const shapeData = await getShapeData(recipeForCheckout.shape).catch(() => null);
          const ratio =
            shapeData && shapeData.viewBox.height > 0
              ? shapeData.viewBox.width / shapeData.viewBox.height
              : aspectRatioToNumber(recipeForCheckout.aspectRatio);
          // Use JPEG for print asset upload to stay under API payload limits while preserving high quality.
          // Retry quality first, then a smaller export size if still too large for API transport.
          let uploadedAssetId: string | null = null;
          let lastAssetError: string | null = null;
          if (mapId) {
            try {
              const resolveRes = await fetch(
                `/api/print/assets/resolve?map_id=${encodeURIComponent(mapId)}&fingerprint=${encodeURIComponent(recipeFingerprint)}`,
              );
              if (resolveRes.ok) {
                const resolveData = (await resolveRes.json().catch(() => null)) as { assetId?: string } | null;
                if (typeof resolveData?.assetId === "string" && resolveData.assetId.trim()) {
                  uploadedAssetId = resolveData.assetId.trim();
                }
              }
            } catch {
              // fall through to render + upload
            }
          }
          const lowMemoryDevice = isLikelyLowMemoryDevice();
          const exportWidths =
            printVariant === "poster_framed"
              ? lowMemoryDevice
                ? [3200, 2800, 2400, 2000, 1700]
                : [4200, 3800, 3400, 3000, 2600]
              : lowMemoryDevice
                ? [3600, 3200, 2800, 2400, 2000, 1700]
                : [5400, 5000, 4600, 4200, 3800, 3400];
          const uploadQualities = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44];
          for (const exportWidth of exportWidths) {
            if (uploadedAssetId) break;
            const exportHeight = Math.max(1, Math.round(exportWidth / ratio));
            const printCanvas = document.createElement("canvas");
            try {
              await renderStarMap({
                recipe: recipeForCheckout,
                canvas: printCanvas,
                width: exportWidth,
                height: exportHeight,
                watermark: false,
                quality: "export",
                premium: true,
                matPurpose: "print",
              });
            } catch {
              lastAssetError = "print_render_failed";
              continue;
            }
            for (let index = 0; index < uploadQualities.length; index += 1) {
              const quality = uploadQualities[index];
              let dataUrl = "";
              try {
                dataUrl = printCanvas.toDataURL("image/jpeg", quality);
              } catch {
                lastAssetError = "print_asset_generation_failed";
                continue;
              }
              if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
                lastAssetError = "print_asset_generation_failed";
                continue;
              }
              if (estimateDataUrlBytes(dataUrl) > MAX_PRINT_ASSET_BYTES) {
                lastAssetError = "print_asset_too_large";
                continue;
              }
              const printAssetRes = await fetch("/api/print/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  mapId: mapId ?? undefined,
                  dataUrl,
                  source: "editor",
                  recipeFingerprint,
                }),
              });
              const printAssetData = (await printAssetRes.json().catch(() => null)) as
                | { assetId?: string; error?: string }
                | null;
              if (printAssetRes.ok && printAssetData?.assetId) {
                uploadedAssetId = printAssetData.assetId;
                break;
              }
              if (typeof printAssetData?.error === "string") {
                lastAssetError = printAssetData.error;
              }
              const shouldRetryForSize =
                index < uploadQualities.length - 1 &&
                typeof printAssetData?.error === "string" &&
                /16MB|base64|Invalid print asset/i.test(printAssetData.error);
              if (!shouldRetryForSize) break;
            }
          }
          if (!uploadedAssetId) {
            track("print_asset_generation_failed", {
              source: "editor_checkout",
              reason: lastAssetError ?? "unknown",
              printVariant,
              lowMemoryDevice,
              shippingCountry: printShippingCountry,
            });
            if (lastAssetError === "print_asset_too_large") {
              throw new Error("print_asset_too_large");
            }
            if (lastAssetError === "print_render_failed") {
              throw new Error("print_render_failed");
            }
            throw new Error("print_asset_failed");
          }

          let uploadedCardAssetId: string | null = null;
          let lastCardAssetError: string | null = null;
          if (includeCardAddOn && printVariant === "poster_framed" && !includeDigitalAddOn) {
            const cardFingerprint = cardRecipeFingerprintSuffix(recipeFingerprint);
            if (mapId) {
              try {
                const resolveCardRes = await fetch(
                  `/api/print/assets/resolve?map_id=${encodeURIComponent(mapId)}&fingerprint=${encodeURIComponent(cardFingerprint)}`,
                );
                if (resolveCardRes.ok) {
                  const resolveCardData = (await resolveCardRes.json().catch(() => null)) as { assetId?: string } | null;
                  if (typeof resolveCardData?.assetId === "string" && resolveCardData.assetId.trim()) {
                    uploadedCardAssetId = resolveCardData.assetId.trim();
                  }
                }
              } catch {
                // fall through to render + upload
              }
            }
            const cardExportWidths = lowMemoryDevice ? [2100, 1800, 1500] : [2700, 2400, 2100, 1800];
            for (const cardBaseWidth of cardExportWidths) {
              if (uploadedCardAssetId) break;
              const { width: cardWidth, height: cardHeight } = getCard4x6ExportDimensions(cardBaseWidth);
              const cardCanvas = document.createElement("canvas");
              try {
                await renderStarMap({
                  recipe: recipeForCheckout,
                  canvas: cardCanvas,
                  width: cardWidth,
                  height: cardHeight,
                  watermark: false,
                  quality: "export",
                  premium: true,
                  matPurpose: "print",
                });
              } catch {
                lastCardAssetError = "card_print_render_failed";
                continue;
              }
              for (let index = 0; index < uploadQualities.length; index += 1) {
                const quality = uploadQualities[index];
                let dataUrl = "";
                try {
                  dataUrl = cardCanvas.toDataURL("image/jpeg", quality);
                } catch {
                  lastCardAssetError = "card_print_asset_generation_failed";
                  continue;
                }
                if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
                  lastCardAssetError = "card_print_asset_generation_failed";
                  continue;
                }
                if (estimateDataUrlBytes(dataUrl) > MAX_PRINT_ASSET_BYTES) {
                  lastCardAssetError = "card_print_asset_too_large";
                  continue;
                }
                const cardAssetRes = await fetch("/api/print/assets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    mapId: mapId ?? undefined,
                    dataUrl,
                    source: "editor",
                    recipeFingerprint: cardFingerprint,
                  }),
                });
                const cardAssetData = (await cardAssetRes.json().catch(() => null)) as
                  | { assetId?: string; error?: string }
                  | null;
                if (cardAssetRes.ok && cardAssetData?.assetId) {
                  uploadedCardAssetId = cardAssetData.assetId;
                  break;
                }
                if (typeof cardAssetData?.error === "string") {
                  lastCardAssetError = cardAssetData.error;
                }
                const shouldRetryForSize =
                  index < uploadQualities.length - 1 &&
                  typeof cardAssetData?.error === "string" &&
                  /16MB|base64|Invalid print asset/i.test(cardAssetData.error);
                if (!shouldRetryForSize) break;
              }
            }
            if (!uploadedCardAssetId) {
              track("print_asset_generation_failed", {
                source: "editor_checkout_card",
                reason: lastCardAssetError ?? "unknown",
                printVariant,
                shippingCountry: printShippingCountry,
              });
              throw new Error("card_print_asset_failed");
            }
          }

          checkoutPayload.orderType = "print";
          checkoutPayload.printVariant = printVariant;
          checkoutPayload.includeDigitalAddOn = includeDigitalAddOn;
          checkoutPayload.includeCardAddOn = includeCardAddOn;
          checkoutPayload.printAssetId = uploadedAssetId;
          if (uploadedCardAssetId) checkoutPayload.cardPrintAssetId = uploadedCardAssetId;
          checkoutPayload.shippingCountry = printShippingCountry;
        }
        const checkoutInit: RequestInit = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(checkoutPayload),
        };

        // Record checkout start right before the checkout API handoff so
        // checkout_started -> checkout_request_received reflects real handoff quality.
        trackFunnelStep("checkout_started", {
          source: previewSource,
          plan: orderType === "print" ? printVariant : plan,
          experiment: PAYWALL_COPY_EXPERIMENT,
          variant: paywallVariant,
        });
        trackBeginCheckout({
          source: previewSource,
          plan,
          orderType,
          printVariant: orderType === "print" ? printVariant : undefined,
          includeDigitalAddOn: orderType === "print" ? includeDigitalAddOn : undefined,
          includeCardAddOn: orderType === "print" ? includeCardAddOn : undefined,
        });

        const res = await fetch("/api/checkout", checkoutInit);
        checkoutApiResponseReceived = true;
        const data = (await res.json().catch(() => null)) as {
          url?: string;
          error?: string;
          code?: string;
          promoApplied?: boolean;
          referralOfferApplied?: boolean;
          discountRejected?: boolean;
        } | null;
        if (!res.ok) {
          if (data?.code === "invalid_promotion_code") {
            throw new Error("invalid_promotion_code");
          }
          if (data?.code === "promotion_not_applicable") {
            throw new Error("promotion_not_applicable");
          }
          if (data?.code === "promotion_lookup_failed") {
            throw new Error("promotion_lookup_failed");
          }
          if (data?.code === "print_checkout_disabled") {
            throw new Error("print_checkout_disabled");
          }
          if (data?.code === "print_shipping_country_invalid") {
            throw new Error("print_shipping_country_invalid");
          }
          if (data?.code === "print_margin_guard_blocked") {
            throw new Error("print_margin_guard_blocked");
          }
          if (data?.code === "print_promotion_margin_blocked") {
            throw new Error("print_promotion_margin_blocked");
          }
          if (data?.code === "missing_shipping_country") {
            throw new Error("missing_shipping_country");
          }
          if (data?.code === "map_required") {
            throw new Error("map_required");
          }
          if (data?.code === "map_not_found") {
            throw new Error("map_not_found");
          }
          throw new Error(data?.code ?? data?.error ?? "checkout_failed");
        }
        if (data?.url) {
          const promoApplied = Boolean(data.promoApplied);
          const referralOfferApplied = Boolean(data.referralOfferApplied);
          track("checkout_redirected", {
            source: previewSource,
            plan,
            orderType,
            promoApplied,
            referralOfferApplied,
            discountRejected: Boolean(data.discountRejected),
            promotionSource: referralOfferApplied ? "referral_auto" : promoApplied ? "manual" : data.discountRejected ? "referral_no_discount" : "none",
            referralApplied: Boolean(referralCode),
            experiment: PAYWALL_COPY_EXPERIMENT,
            variant: paywallVariant,
          });
          if (data.discountRejected) {
            setCheckoutError(
              "We couldn't apply your discount automatically. You can still enter a promo code on the payment page.",
            );
            await new Promise((resolve) => setTimeout(resolve, 2200));
          }
          window.location.href = data.url;
          return;
        }
        throw new Error("no url");
      } catch (err) {
        console.error(err);
        const reason = (err as Error)?.message ?? "unknown";
        if (!checkoutApiResponseReceived) {
          trackCheckoutClientDiagnostic({
            reason,
            source: previewSource,
            plan: orderType === "print" ? printVariant : plan,
            orderType,
            printVariant: orderType === "print" ? printVariant : undefined,
            includeDigitalAddOn: orderType === "print" ? includeDigitalAddOn : undefined,
          });
        }
        const checkoutErrorMessage =
          reason === "invalid_promotion_code"
            ? "That promo code is invalid or expired. Try another code."
            : reason === "promotion_not_applicable"
              ? "That promo code does not apply to this order."
            : reason === "promotion_lookup_failed"
              ? "We couldn't verify your promo code right now. Please try again in a moment."
              : reason === "print_asset_failed"
                ? "We couldn't prepare your print file. Please try again."
              : reason === "print_asset_too_large"
                ? "This map export is too large for print checkout right now. Try a simpler style or contact support."
                : reason === "print_render_failed"
                  ? "We couldn't render a high-res print on this device. Try again or use desktop for print checkout."
                : reason === "card_print_asset_failed"
                  ? "We couldn't prepare the greeting card artwork. Please try checkout again."
                : reason === "missing_card_print_asset"
                  ? "Greeting card artwork is missing. Please reopen checkout and try again."
                : reason === "missing_shipping_country"
                  ? "Select your shipping country to continue with print checkout."
                : reason === "print_shipping_country_invalid"
                  ? "Shipping isn’t available for that country yet. Please select another."
                  : reason === "print_promotion_margin_blocked"
                    ? "That promo code would make this print order unavailable for the selected route or country."
                  : reason === "print_margin_guard_blocked"
                    ? "That print option is temporarily unavailable for the selected country. Try another format or country."
                : reason === "print_checkout_disabled"
                  ? "Print checkout is not live yet."
                : reason === "map_required"
                  ? "Generate your map preview before checkout."
                : reason === "map_not_found"
                  ? "We couldn't find that map. Refresh preview and try checkout again."
                : reason.startsWith("save_failed_") || reason === "map_save_failed"
                  ? "We couldn't save this map yet. Please retry in a moment."
              : reason === "unknown_error"
                ? "We couldn't start checkout right now. Please try again shortly."
              : "Checkout is unavailable right now. Please try again shortly.";
        setCheckoutError(checkoutErrorMessage);
        track("checkout_failed", {
          source: previewSource,
          reason,
          plan,
          orderType,
          printVariant: orderType === "print" ? printVariant : undefined,
          includeDigitalAddOn: orderType === "print" ? includeDigitalAddOn : undefined,
          promoApplied: Boolean(promoCode),
          referralApplied: Boolean(referralCode),
          experiment: PAYWALL_COPY_EXPERIMENT,
          variant: paywallVariant,
        });
        checkoutInFlightRef.current = false;
        setCheckoutInFlight(false);
      }
    },
    [
      aspectRatio,
      dateTime,
      location,
      getPreviewSource,
      getCheckoutPromoCode,
      getCheckoutReferralCode,
      printShippingCountry,
      renderOptions,
      selectedStyle,
      shape,
      textBoxes,
      paywallVariant,
    ]
  );

  const startPrintCheckout = useCallback(
    (options: {
      variant: PrintVariant;
      includeDigitalAddOn: boolean;
      includeCardAddOn?: boolean;
      source: "editor_print_panel" | "paywall_modal" | "mobile_preview" | "preview_primary_print_cta";
    }) => {
      setPreferredPrintVariant(options.variant);
      track("print_option_clicked", {
        source: options.source,
        variant: options.variant,
        includeDigitalAddOn: options.includeDigitalAddOn,
        includeCardAddOn: options.includeCardAddOn,
      });
      void startCheckout("single", {
        orderType: "print",
        printVariant: options.variant,
        includeDigitalAddOn: options.includeDigitalAddOn,
        includeCardAddOn: options.includeCardAddOn,
      });
    },
    [startCheckout],
  );

  const startMerchCheckout = useCallback(
    (options: { family: MerchFamilyId; size?: string; color?: string }) => {
      track("print_option_clicked", {
        source: "editor_merch_panel",
        family: options.family,
        size: options.size,
        color: options.color,
      });
      void startCheckout("single", {
        orderType: "print",
        // keep a stable printVariant for legacy paths; backend switches to merch via merchFamily.
        printVariant: "poster_framed",
        includeDigitalAddOn: false,
        merchFamily: options.family,
        merchOptions: { size: options.size, color: options.color },
      });
    },
    [startCheckout],
  );

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
      quality: "export",
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
    if (isQuick && !allowAdvancedInQuick) {
      router.push("/editor");
      return;
    }
    setShowAdvancedState(true);
    requestAnimationFrame(() => handleEditScroll());
  }, [handleEditScroll, isQuick, router, allowAdvancedInQuick]);

  const handleLessOptions = useCallback(() => {
    if (!allowAdvanced) return;
    setShowAdvancedState(false);
    requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [allowAdvanced]);

  const showGuidedForm = !revealed;
  const showEditor = revealed && showAdvanced;
  const showSetupPanels = !revealed || showEditor;
  const visibleTextBoxes = showGuidedForm ? textBoxes.slice(0, 1) : textBoxes;
  const cardIds = ["dateLocation", "textStyling", "style", "shape", "frame", "advanced"] as const;
  const allCardsCollapsed = cardIds.every((id) => collapsedCards[id]);

  return (
    <>
      <section
        ref={editorSectionRef}
        id="editor"
        className="mx-auto w-full max-w-7xl py-12 sm:py-14 lg:max-w-none lg:py-12"
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
            <div className="space-y-4 text-[13px] font-[var(--font-montserrat)] text-neutral-100 lg:h-full">
              {/* Header section - above the grid */}
              {showSetupPanels && (
                <div ref={inputsRef} className="space-y-3">
                  <div className="space-y-2">
                    {!revealed ? (
                      <>
                        <p className="text-xs font-semibold tracking-[0.25em] text-[#d7b56c] uppercase">
                          Create your star map
                        </p>
                        <h2 className="text-3xl font-[var(--font-playfair)] font-semibold tracking-tight text-white sm:text-4xl">
                          Start with the moment, then preview
                        </h2>
                        <p className="text-base text-neutral-200 sm:text-lg">
                          Add the date, location, and words that matter, then generate a free preview before opening
                          any extra controls.
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
                        <p className="text-xs text-neutral-300">
                          Advanced controls stay tucked away until you want them.
                        </p>
                        <p className="text-[11px] text-neutral-400">
                          {lastDraftSavedAt
                            ? `Draft autosaved on this device at ${lastDraftSavedAt}.`
                            : "Draft autosaves on this device."}
                        </p>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div>
                          <p className="text-[10px] font-semibold tracking-[0.22em] text-amber-200/80 uppercase">
                            Editing mode
                          </p>
                          <p className="text-sm font-semibold text-white">Refine your map</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isQuick && allowAdvancedInQuick ? (
                            <button
                              type="button"
                              onClick={handleLessOptions}
                              className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/15"
                            >
                              Back to preview
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={handleStartScratch}
                            className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/15"
                          >
                            Start over
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    ref={presetRailRef}
                    className="hidden rounded-2xl border border-[#d7b56c]/15 bg-[#0b1024]/85 p-3 shadow-lg ring-1 ring-white/5 backdrop-blur-sm lg:block"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-neutral-300">Occasion presets (optional)</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowOccasionPresets((prev) => !prev)}
                          className="rounded-full border border-white/15 bg-white/8 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-200 uppercase transition hover:border-white/25 hover:bg-white/12"
                        >
                          {showOccasionPresets ? "Hide presets" : "Show presets"}
                        </button>
                        {customOccasion && (
                          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-200 uppercase">
                            Custom
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {showOccasionPresets ? (
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
                                } ${selectedOccasion === preset.id ? "btn-selection-pulse btn-selected-glow ring-2 ring-amber-300/70" : ""}`}
                              >
                                {occasionEmojis[preset.id as keyof typeof occasionEmojis]} {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-neutral-300">
                          Keep this hidden if you already know the exact date and place.
                        </p>
                      )}
                      {showEditor && (
                        <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-[10px] font-semibold tracking-[0.18em] text-neutral-200 uppercase">
                              Render mode
                            </p>
                            <p className="text-[10px] text-neutral-300">Tune the map mood</p>
                          </div>
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
                                  if (!paid && mode.premium) {
                                    setPaywallIntent("digital");
                                    setPaywallOpen(true);
                                    trackPaywallOpenedEvent("digital", "premium_render_mode");
                                  }
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
                                    ? "!text-midnight btn-selection-pulse btn-selected-glow border-amber-400 bg-amber-200"
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
                        </div>
                      )}
                    </div>
                    {showOccasionPresets && presetHint && <p className="mt-2 text-xs text-amber-100/80">{presetHint}</p>}

                    {showEditor && (
                      <div className="mt-2 rounded-xl border border-white/15 bg-white/5 px-2.5 py-2 shadow-inner shadow-black/30 backdrop-blur-sm">
                        <label className="flex items-center justify-between text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
                          <span>Intensity</span>
                          <span className="text-[10px] font-semibold text-amber-200/70">
                            {intensityDisplay}%
                          </span>
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
                              setPaywallIntent("digital");
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
                  showSetupPanels ? "lg:grid-cols-[3fr_2fr] lg:items-start" : "lg:grid-cols-1"
                }`}
              >
                {showSetupPanels && (
                  <div className="w-full">
                    <div className="space-y-2">
                      {/* Date & Location - FIRST (required input) */}
                      <section
                        ref={dateLocationRef}
                        className="hidden rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-sm shadow-black/30 backdrop-blur-sm lg:block"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCard("dateLocation")}
                          aria-expanded={!collapsedCards.dateLocation}
                          className="mb-1.5 flex w-full items-center justify-between text-left"
                        >
                          <h3 className="text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
                            Date & Location
                          </h3>
                          <span className="text-[11px] font-semibold text-amber-100">
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

                      {/* Pro Presets - SECOND (optional styling) */}
                      <section className="hidden rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-sm shadow-black/30 backdrop-blur-sm lg:block">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
                            Pro Presets
                          </h3>
                          <button
                            type="button"
                            onClick={() => setShowProPresets((prev) => !prev)}
                            className="text-[11px] font-semibold text-amber-100 transition hover:text-amber-50"
                          >
                            {showProPresets ? "Hide" : "Show"}
                          </button>
                        </div>
                        {showProPresets ? (
                          <div className="mt-2">
                            <ProPresetsPanel selectedOccasion={selectedOccasion} onSelect={applyProPreset} />
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-neutral-300">
                            Open this only when you want a curated style shortcut.
                          </p>
                        )}
                      </section>
                    </div>

                    {/* Your Message + Editor sections */}
                    <div className="mt-2 space-y-2">
                        {showGuidedForm && (
                          <div className="space-y-2">
                            <section className="rounded-xl border border-white/15 bg-white/5 p-2.5 shadow-sm shadow-black/30 backdrop-blur-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <span className="text-amber-300">✎</span>
                                <h3 className="text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
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
                                      className="h-10 w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 transition outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
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
                                disabled={!canReveal || isRevealing}
                                aria-label={
                                  isRevealing
                                    ? "Revealing your sky"
                                    : canReveal
                                      ? "Generate preview"
                                      : previewUnlockButtonLabel
                                }
                                className={`text-midnight focus:ring-gold inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0b1a30] focus:outline-none ${
                                  canReveal && !isRevealing
                                    ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400"
                                    : "cursor-not-allowed bg-neutral-400/60 text-neutral-700 shadow-none"
                                }`}
                              >
                                {isRevealing
                                  ? "Revealing your sky..."
                                  : canReveal
                                    ? "Generate preview"
                                    : previewUnlockButtonLabel}
                              </button>
                            )}
                            {!revealed && (
                              <div className="space-y-1 text-xs text-neutral-400">
                                <p>
                                  {isRevealing
                                    ? "Aligning constellations for your selected moment..."
                                    : canReveal
                                      ? previewReadyMessage
                                      : previewLockedMessage}
                                </p>
                                <p className="text-[11px] text-neutral-500">
                                  {canReveal
                                    ? "Free preview, HD optional."
                                    : "Free preview, HD optional after you add date + place."}
                                </p>
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

                            <div className="flex w-full flex-col gap-2">
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
                                      <h3 className="text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
                                        Text Styling
                                      </h3>
                                      <span className="text-[11px] font-semibold text-amber-100">
                                        {collapsedCards.textStyling ? "Show" : "Hide"}
                                      </span>
                                    </button>
                                    {!collapsedCards.textStyling && (
                                      <div className="mt-2 space-y-3">
                                        {textBoxes.map((box) => {
                                          const isCollapsed = collapsedTextBoxes[box.id] ?? false;

                                          return (
                                            <div
                                              key={box.id}
                                              className="space-y-2 rounded-lg border border-white/15 bg-white/5 p-3 backdrop-blur-sm"
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-semibold text-white">
                                                  {box.label}
                                                </span>
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
                                                    onChange={(e) =>
                                                      updateTextBox(box.id, { text: e.target.value })
                                                    }
                                                    className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-xs text-white shadow-inner shadow-black/20 transition outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
                                                    placeholder={`Enter ${box.label.toLowerCase()}...`}
                                                  />
                                                  <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                      <label className="text-[10px] text-neutral-300">
                                                        Font
                                                      </label>
                                                      <select
                                                        value={box.fontFamily}
                                                        onChange={(e) => {
                                                          const next = e.target
                                                            .value as TextBox["fontFamily"];
                                                          const fontMeta = fontOptions.find(
                                                            (opt) => opt.id === next
                                                          );
                                                          if (fontMeta?.premium && !paid) {
                                                            setPaywallIntent("digital");
                                                            setPaywallOpen(true);
                                                            trackPaywallOpenedEvent("digital", "premium_font");
                                                            return;
                                                          }
                                                          updateTextBox(box.id, { fontFamily: next });
                                                        }}
                                                        className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                                                        style={{ color: "white" }}
                                                      >
                                                        {fontOptions.map((opt) => (
                                                          <option
                                                            key={opt.id}
                                                            value={opt.id}
                                                            style={{ color: "#111827" }}
                                                          >
                                                            {opt.premium ? `🔒 ${opt.label}` : opt.label}
                                                          </option>
                                                        ))}
                                                      </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                      <label className="text-[10px] text-neutral-300">
                                                        Size
                                                      </label>
                                                      <input
                                                        type="number"
                                                        min={10}
                                                        max={64}
                                                        value={box.size}
                                                        onChange={(e) =>
                                                          updateTextBox(box.id, {
                                                            size: Number(e.target.value),
                                                          })
                                                        }
                                                        className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                                                      />
                                                    </div>
                                                  </div>
                                                  <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                      <label className="text-[10px] text-neutral-300">
                                                        Color
                                                      </label>
                                                      <input
                                                        type="color"
                                                        value={box.color}
                                                        onChange={(e) =>
                                                          updateTextBox(box.id, { color: e.target.value })
                                                        }
                                                        className="h-8 w-full cursor-pointer rounded-md border border-white/15 bg-white/10"
                                                      />
                                                    </div>
                                                    <div className="space-y-1">
                                                      <label className="text-[10px] text-neutral-300">
                                                        Align
                                                      </label>
                                                      <select
                                                        value={box.align}
                                                        onChange={(e) =>
                                                          updateTextBox(box.id, {
                                                            align: e.target.value as TextBox["align"],
                                                          })
                                                        }
                                                        className="w-full rounded-md border border-white/15 bg-white/10 px-2 py-1.5 text-xs text-white"
                                                        style={{ color: "white" }}
                                                      >
                                                        <option value="left" style={{ color: "#111827" }}>
                                                          Left
                                                        </option>
                                                        <option value="center" style={{ color: "#111827" }}>
                                                          Center
                                                        </option>
                                                        <option value="right" style={{ color: "#111827" }}>
                                                          Right
                                                        </option>
                                                      </select>
                                                    </div>
                                                  </div>
                                                  <div className="flex gap-2">
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        updateTextBox(box.id, { textShadow: !box.textShadow })
                                                      }
                                                      className={`flex-1 rounded-md border px-3 py-1.5 text-[10px] font-semibold transition ${
                                                        box.textShadow
                                                          ? "!text-midnight border-amber-300 bg-amber-100"
                                                          : "border-white/15 bg-white/10 text-white"
                                                      }`}
                                                    >
                                                      Shadow
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        updateTextBox(box.id, { textGlow: !box.textGlow })
                                                      }
                                                      className={`flex-1 rounded-md border px-3 py-1.5 text-[10px] font-semibold transition ${
                                                        box.textGlow
                                                          ? "!text-midnight border-amber-300 bg-amber-100"
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
                                          className="w-full rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
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
                                      <h3 className="text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
                                        Style
                                      </h3>
                                      <span className="text-[11px] font-semibold text-amber-100">
                                        {collapsedCards.style ? "Show" : "Hide"}
                                      </span>
                                    </button>
                                    {!collapsedCards.style && (
                                      <div className="mt-2 space-y-3">
                                        <div className="space-y-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <p
                                              id="map-look-tier-label"
                                              className="text-[10px] font-semibold tracking-[0.14em] text-neutral-300 uppercase"
                                            >
                                              Map look
                                            </p>
                                            {resolveMapLookTier(renderOptions, selectedStyle) !== "custom" && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const tier = resolveMapLookTier(renderOptions, selectedStyle);
                                                  setTextBoxes(applyTierTypography(tier, selectedStyle, textBoxes));
                                                }}
                                                className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-amber-100/90 transition hover:border-amber-300/40 hover:bg-white/10"
                                              >
                                                Reset typography
                                              </button>
                                            )}
                                          </div>
                                          <div
                                            role="radiogroup"
                                            aria-labelledby="map-look-tier-label"
                                            className="grid grid-cols-3 gap-1.5"
                                          >
                                            {mapLookTiers.map((tier) => {
                                              const activeTier = resolveMapLookTier(renderOptions, selectedStyle);
                                              return (
                                                <button
                                                  key={tier.id}
                                                  type="button"
                                                  role="radio"
                                                  aria-checked={activeTier === tier.id}
                                                  aria-label={`${tier.label}: ${tier.description}`}
                                                  onClick={() => {
                                                    const tierOptions = applyMapLookTier(tier.id, selectedStyle);
                                                    setRenderOptions(tierOptions);
                                                    setTextBoxes(applyTierTypography(tier.id, selectedStyle, textBoxes));
                                                  }}
                                                  onKeyDown={(event) => {
                                                    const tierIndex = mapLookTiers.findIndex((item) => item.id === tier.id);
                                                    if (tierIndex < 0) return;
                                                    let nextIndex: number | null = null;
                                                    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                                                      nextIndex = (tierIndex + 1) % mapLookTiers.length;
                                                    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                                                      nextIndex = (tierIndex - 1 + mapLookTiers.length) % mapLookTiers.length;
                                                    }
                                                    if (nextIndex === null) return;
                                                    event.preventDefault();
                                                    const nextTier = mapLookTiers[nextIndex];
                                                    if (!nextTier) return;
                                                    const tierOptions = applyMapLookTier(nextTier.id, selectedStyle);
                                                    setRenderOptions(tierOptions);
                                                    setTextBoxes(
                                                      applyTierTypography(nextTier.id, selectedStyle, textBoxes),
                                                    );
                                                  }}
                                                  className={`min-h-[3.25rem] rounded-md border px-2 py-2 text-left transition ${
                                                    activeTier === tier.id
                                                      ? "!text-midnight border-amber-300 bg-amber-100"
                                                      : "border-white/15 bg-white/10 text-white hover:border-amber-400/40"
                                                  }`}
                                                >
                                                  <div className="text-[11px] font-semibold">{tier.label}</div>
                                                  <div className="mt-0.5 text-[9px] leading-snug opacity-80">
                                                    {tier.description}
                                                  </div>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
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
                                              onClick={() => {
                                                setStyle(style.id);
                                                const tier: MapLookTier =
                                                  renderOptions.mapLookTier ?? resolveMapLookTier(renderOptions, selectedStyle);
                                                const tierOptions =
                                                  tier === "custom"
                                                    ? {}
                                                    : applyMapLookTier(tier, style.id);
                                                const defaults = applyStyleDefaults(style.id, textBoxes);
                                                const mergedOptions = {
                                                  ...defaults.renderOptions,
                                                  ...tierOptions,
                                                };
                                                if (Object.keys(mergedOptions).length) {
                                                  setRenderOptions(mergedOptions);
                                                }
                                                const nextText =
                                                  tier === "custom"
                                                    ? defaults.textBoxes
                                                    : applyTierTypography(tier, style.id, defaults.textBoxes);
                                                if (nextText !== textBoxes) {
                                                  setTextBoxes(nextText);
                                                }
                                              }}
                                              className={`flex h-full flex-col justify-center rounded-lg border px-3 py-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:scale-[0.98] ${
                                                styleClasses[style.id as keyof typeof styleClasses]
                                              } ${selectedStyle === style.id ? "btn-selection-pulse" : ""}`}
                                            >
                                              <div className="text-sm font-semibold">{style.name}</div>
                                              <div className="mt-1 text-xs opacity-80">{style.note}</div>
                                            </button>
                                          );
                                        })}
                                        </div>
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
                                      <h3 className="text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
                                        Shape
                                      </h3>
                                      <span className="text-[11px] font-semibold text-amber-100">
                                        {collapsedCards.shape ? "Show" : "Hide"}
                                      </span>
                                    </button>
                                    {!collapsedCards.shape && (
                                      <>
                                        <div className="mt-2 grid grid-cols-4 gap-2">
                                          {shapes.map((shapeOption) => {
                                            const isPremium =
                                              shapeOption.id !== "rectangle" && shapeOption.id !== "circle";
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
                                                    ? "!text-midnight border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 shadow-amber-500/20"
                                                    : "border-white/15 bg-white/5 text-white hover:border-amber-400/50"
                                                }`}
                                              >
                                                <span
                                                  className="mb-1 text-2xl"
                                                  style={{ transform: shapeSymbolScale[shapeOption.id] }}
                                                >
                                                  {shapeSymbols[shapeOption.id]}
                                                </span>
                                                <span className="text-[10px]">{shapeOption.label}</span>
                                                {isPremium && (
                                                  <span className="mt-0.5 text-[9px] text-amber-400">
                                                    HD only
                                                  </span>
                                                )}
                                              </button>
                                            );
                                          })}
                                        </div>
                                        {shape !== "rectangle" && (
                                          <div className="mt-2 space-y-1">
                                            <label className="text-[10px] text-neutral-300">
                                              Background Color
                                            </label>
                                            <input
                                              type="color"
                                              value={renderOptions.backgroundColor || "#0b1a30"}
                                              onChange={(e) =>
                                                setRenderOptions({ backgroundColor: e.target.value })
                                              }
                                              className="h-8 w-full cursor-pointer rounded-md border border-white/15 bg-white/10"
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
                                      <h3 className="text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
                                        Frame
                                      </h3>
                                      <span className="text-[11px] font-semibold text-amber-100">
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
                                                    ? "!text-midnight border-amber-400 bg-gradient-to-br from-amber-500/20 to-amber-600/20 shadow-amber-500/20"
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
                                          onClick={() =>
                                            setRenderOptions({ frameEnabled: !renderOptions.frameEnabled })
                                          }
                                          className={`mt-2 w-full rounded-md border px-3 py-2 text-xs font-semibold transition ${
                                            renderOptions.frameEnabled
                                              ? "!text-midnight border-amber-300 bg-amber-100"
                                              : "border-white/15 bg-white/10 text-white"
                                          }`}
                                        >
                                          {renderOptions.frameEnabled
                                            ? "Frame Border On"
                                            : "Frame Border Off"}
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
                                  <h3 className="text-xs font-semibold tracking-[0.2em] text-amber-200/90 uppercase">
                                    Advanced
                                  </h3>
                                  <span className="rounded-full border border-amber-200/35 bg-amber-100/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                                    {collapsedCards.advanced ? "Open" : "Hide"}
                                  </span>
                                </button>
                                <p className="mt-1 text-[11px] text-neutral-200">
                                  Fine-tune realism, line behavior, and premium preview controls.
                                </p>
                                {!collapsedCards.advanced && (
                                  <AdvancedPanel
                                    selectedStyle={selectedStyle}
                                    renderOptions={renderOptions}
                                    setRenderOptions={setRenderOptions}
                                    textBoxes={textBoxes}
                                    setTextBoxes={setTextBoxes}
                                    previewFidelity={previewFidelity}
                                    setPreviewFidelity={setPreviewFidelity}
                                    paid={paid}
                                    onPremiumPreview={(feature, level) =>
                                      track("premium_preview_enabled", { feature, level })
                                    }
                                  />
                                )}
                              </section>
                            </div>
                          </div>
                        )}
                      </div>
                  </div>
                )}

                <div
                  ref={previewRef}
                  id="preview"
                  className="order-1 flex w-full flex-col gap-3 pb-4 lg:order-2 lg:pb-0"
                >
                  <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0b0f24]/90 p-3 shadow-xl shadow-black/30 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Preview</h3>
                      {revealed && (
                        <div className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white uppercase shadow-sm">
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
                                "url('/ribbon-overlay.webp'), radial-gradient(circle at 50% 65%, rgba(28, 34, 94, 0.55), rgba(7, 9, 26, 0.98))",
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
                            <div className="absolute top-[62%] left-1/2 flex w-full max-w-[320px] -translate-x-1/2 flex-col items-center gap-2 px-4 text-center">
                              {canReveal ? (
                                isRevealing ? (
                                  <div className="reveal-loader-card w-full rounded-xl px-4 py-3 text-center">
                                    <div className="reveal-glow reveal-glow-left" aria-hidden="true" />
                                    <div className="reveal-glow reveal-glow-right" aria-hidden="true" />
                                    <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100/75">
                                      <span>Free preview</span>
                                      <span>{revealProgress}</span>
                                    </div>
                                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-amber-200/60 bg-amber-100/10">
                                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-amber-200/70 border-t-transparent" />
                                    </div>
                                    <p className="text-[10px] font-semibold tracking-[0.24em] text-amber-100/80 uppercase">
                                      Revealing your sky
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-amber-50">{revealStage.title}</p>
                                    <p className="mt-1 text-[11px] leading-5 text-neutral-200">{revealStage.description}</p>
                                    <div className="mt-3 reveal-star-row">
                                      <span className="reveal-star-dot" />
                                      <span className="reveal-star-dot" />
                                      <span className="reveal-star-dot" />
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-[9px] font-semibold tracking-[0.22em] text-neutral-300 uppercase">
                                      {REVEAL_STAGES.map((stage, index) => {
                                        const isActive = index === revealStageIndex;
                                        const isComplete = index < revealStageIndex;
                                        return (
                                          <span
                                            key={stage.label}
                                            className={`rounded-full border px-2 py-1 ${
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
                                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                      <div
                                        className="reveal-progress-fill h-full rounded-full bg-gradient-to-r from-amber-300 via-amber-100 to-amber-300 transition-[width] duration-200"
                                        style={{ width: revealProgress }}
                                      />
                                    </div>
                                    <p className="mt-2 text-[10px] text-neutral-300">
                                      Usually takes about a second. No charge yet — HD and print options come after this.
                                    </p>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={handleReveal}
                                    aria-label="Generate preview"
                                    className="text-midnight focus:ring-gold inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold shadow-lg transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0b1a30] focus:outline-none"
                                  >
                                    Generate preview
                                  </button>
                                )
                              ) : (
                                <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-neutral-200 shadow-sm backdrop-blur">
                                  {previewLockedMessage}
                                </div>
                              )}
                              {canReveal && (
                                <p className="text-[11px] text-neutral-300">
                                  {isRevealing
                                    ? "This usually takes about a second."
                                    : "Free preview, HD optional."}
                                </p>
                              )}
                              {canReveal && printCheckoutEnabled && (
                                <p className="text-[11px] text-amber-100/90">
                                  Printed and framed options unlock after preview.
                                </p>
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
                                <div className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white uppercase shadow-sm backdrop-blur">
                                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                                  Rendering sky…
                                </div>
                                <div
                                  className="pointer-events-none absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0)_100%)] bg-[length:200%_100%] opacity-60"
                                  style={{ animationDuration: "1.5s" }}
                                />
                              </div>
                            )}
                            <div className="pointer-events-none absolute top-3 right-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white uppercase shadow-sm backdrop-blur">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                              {isUpdating ? "Rendering…" : "Updated ✓"}
                            </div>
                            <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5" />
                            <button
                              type="button"
                              onClick={() => setIsFullscreen(true)}
                              className="focus:ring-gold absolute right-3 bottom-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg text-white shadow-md backdrop-blur transition hover:-translate-y-[1px] hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:outline-none"
                              aria-label="Open fullscreen"
                            >
                              ⤢
                            </button>
                            {showEditor && (
                              <button
                                type="button"
                                onClick={handleEditScroll}
                                className="focus:ring-gold absolute top-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:ring-2 focus:ring-offset-2 focus:outline-none"
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
                            className="focus:ring-gold inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:ring-2 focus:ring-offset-2 focus:outline-none"
                          >
                            Free preview
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExport("hd")}
                            aria-label="HD export"
                            disabled={hdExportInFlight}
                            className="text-midnight focus:ring-gold inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-xs font-semibold shadow-md transition hover:-translate-y-[1px] hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                            title="Unlock to export HD without watermark; preview stays free."
                          >
                            {hdExportInFlight ? "Preparing..." : paid ? "HD download" : "Unlock HD"}
                          </button>
                          {printCheckoutEnabled && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaywallIntent("print");
                                setPaywallOpen(true);
                                setCheckoutError(null);
                                trackPaywallOpenedEvent("print", "preview_primary_print_cta");
                                track("print_option_clicked", {
                                  source: "preview_primary_print_cta",
                                  variant: preferredPrintVariant,
                                  includeDigitalAddOn: false,
                                });
                              }}
                              className="focus:ring-gold inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/70 bg-amber-300/25 px-4 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-300/35 focus:ring-2 focus:ring-offset-2 focus:outline-none"
                              title="Buy a printed star map with framing options."
                            >
                              Print & frame
                            </button>
                          )}
                          {!showEditor && (
                            <button
                              type="button"
                              onClick={handleCustomizeMore}
                              className="text-midnight focus:ring-gold inline-flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-400 px-3 py-2 text-xs font-semibold shadow-md transition hover:-translate-y-[1px] hover:bg-amber-300 hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:outline-none"
                            >
                              Customize more
                            </button>
                          )}
                          {hdCreditLabel && (
                            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80">
                              {hdCreditLabel}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={handleShareImage}
                            className="focus:ring-gold inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:ring-2 focus:ring-offset-2 focus:outline-none"
                          >
                            🔗 Share
                          </button>
                          {showEditor && (
                            <button
                              type="button"
                              onClick={handleShare}
                              className="focus:ring-gold inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow focus:ring-2 focus:ring-offset-2 focus:outline-none"
                            >
                              💾 Save & Remix
                            </button>
                          )}
                        </div>
                        {printCheckoutEnabled && posterAspectMismatch && (
                          <PrintAspectMismatchNotice aspectRatio={aspectRatio} className="mt-2" />
                        )}
                        {paid &&
                          (currentPlan === "subscription" ||
                            (typeof creditsRemaining === "number" && creditsRemaining > 0)) && (
                          <p className="mt-2 text-[11px] text-neutral-300">
                            {currentPlan === "subscription"
                              ? "Unlimited HD exports on your active subscription."
                              : `${creditsRemaining} HD export credit${creditsRemaining === 1 ? "" : "s"} remaining.`}
                          </p>
                        )}
                        {currentPlan !== "subscription" && (
                          <p className="mt-1 text-[11px] text-neutral-300/95">
                            Pack reminder: each HD click exports the <span className="font-semibold text-white">current map only</span>.
                            For multiple files, create or edit the next map before each download.
                          </p>
                        )}
                        {downloadHint && (
                          <div className="mt-2 rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-3 py-2">
                            <p className="text-[11px] text-emerald-100">{downloadHint}</p>
                            <a
                              href="/my-downloads"
                              className="mt-1 inline-flex text-[11px] font-semibold text-emerald-50 underline underline-offset-2 hover:text-white"
                            >
                              Open my downloads
                            </a>
                          </div>
                        )}
                        {printCheckoutEnabled && (
                          <div className="mt-3 rounded-xl border border-amber-300/35 bg-amber-300/10 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-amber-100">Buy a physical gift from this exact preview</p>
                              <span className="rounded-full border border-amber-300/40 bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                                Framed + HD recommended
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-amber-100/85">
                              Secure Stripe checkout. Shipping is shown before payment, and your print order draft is
                              created right after payment for manual review. Apple Pay, Google Pay, and Link show when
                              available. {shippingDisclosure}
                            </p>
                            {activeMapLookTier === "minimal" && (
                              <p className="mt-2 rounded-lg border border-amber-200/30 bg-black/15 px-3 py-2 text-[11px] text-amber-50/90">
                                Print preview note: your editor uses a transparent mat on Minimal. The print file adds a
                                filled border so fulfillment has no transparent edges.
                              </p>
                            )}
                            {posterAspectMismatch && (
                              <PrintAspectMismatchNotice aspectRatio={aspectRatio} className="mt-2" />
                            )}
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <div className="rounded-xl border border-amber-300/25 bg-black/15 px-3 py-2 text-[11px] text-amber-100/90">
                                <p className="font-semibold text-amber-100">Fastest</p>
                                <p className="mt-1">Digital only. Instant access after payment.</p>
                              </div>
                              <div className="rounded-xl border border-amber-300/35 bg-black/20 px-3 py-2 text-[11px] text-amber-100/90">
                                <p className="font-semibold text-amber-100">Best gift</p>
                                <p className="mt-1">Framed print. Easiest premium route.</p>
                              </div>
                              <div className="rounded-xl border border-amber-300/25 bg-black/15 px-3 py-2 text-[11px] text-amber-100/90">
                                <p className="font-semibold text-amber-100">Lower total</p>
                                <p className="mt-1">Unframed poster if you already have a frame plan.</p>
                              </div>
                            </div>
                            <div className="mt-3">
                              <label className="text-[11px] font-semibold text-amber-100/80">Shipping country</label>
                              <select
                                value={printShippingCountry ?? ""}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setPrintShippingCountryValue(next, "editor-panel");
                                }}
                                className="print-country-select mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-xs text-midnight"
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
                                  Estimated shipping to {getPrintShippingCountryLabel(printShippingCountry)}:{" "}
                                  {posterShippingFootnote}
                                </p>
                              ) : null}
                              <PrintGiftDecisionPanel
                                printShippingCountry={printShippingCountry}
                                sizingVariant={preferredPrintVariant}
                                compact
                              />
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {printCheckoutRows.map((row) => (
                                <button
                                  key={paywallPrintCheckoutRowKey(row)}
                                  type="button"
                                  onClick={() =>
                                    startPrintCheckout({
                                      source: "editor_print_panel",
                                      variant: row.variant,
                                      includeDigitalAddOn: row.includeDigitalAddOn,
                                      includeCardAddOn: row.includeCardAddOn,
                                    })
                                  }
                                  disabled={checkoutInFlight || !printShippingCountry}
                                  className={paywallPrintSkuButtonClassesEditorPanel(
                                    row,
                                    preferredPrintVariant,
                                    preferredIncludeDigitalAddOn,
                                  )}
                                >
                                  {checkoutInFlight ? (
                                    "Opening secure checkout..."
                                  ) : (
                                    <span className="text-center leading-tight">
                                      <span className="block text-[11px] font-semibold">{row.headline}</span>
                                      <span className="block text-[10px] text-amber-100/95">{row.secondaryLine}</span>
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                            {!printShippingCountry && (
                              <p className="mt-2 text-[11px] font-semibold text-amber-100/80">
                                Choose a shipping country to unlock print checkout.
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                              <a
                                href="/star-map-gift-formats"
                                className="font-semibold text-amber-100 underline decoration-amber-300/60 underline-offset-2 hover:text-white"
                              >
                                Compare formats
                              </a>
                              <a
                                href="/shipping"
                                className="font-semibold text-amber-100 underline decoration-amber-300/60 underline-offset-2 hover:text-white"
                              >
                                Shipping details
                              </a>
                            </div>
                            {enabledMerchFamilies.length ? (
                              <div className="mt-4 rounded-xl border border-amber-200/25 bg-white/10 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-semibold text-amber-100">Merch (beta)</p>
                                  <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                                    New
                                  </span>
                                </div>
                                <p className="mt-1 text-[10px] text-amber-100/80">
                                  Choose a product and options. Shipping is shown in Stripe before payment.
                                </p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <label className="text-[10px] font-semibold text-amber-100/80">Product</label>
                                    <select
                                      value={selectedMerchFamily}
                                      onChange={(event) => {
                                        const next = event.target.value as MerchFamilyId;
                                        setSelectedMerchFamily(next);
                                        const nextFamily = enabledMerchFamilies.find((f) => f.id === next);
                                        setSelectedMerchSize(nextFamily?.options.size?.[0] ?? "");
                                        setSelectedMerchColor(nextFamily?.options.color?.[0] ?? "");
                                      }}
                                      className="print-country-select mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-[11px] text-midnight"
                                      style={{ color: "#111827", WebkitTextFillColor: "#111827", colorScheme: "light" }}
                                    >
                                      {enabledMerchFamilies.map((family) => (
                                        <option key={family.id} value={family.id}>
                                          {family.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  {(() => {
                                    const family = enabledMerchFamilies.find((f) => f.id === selectedMerchFamily);
                                    if (!family) return null;
                                    return (
                                      <>
                                        {family.options.color?.length ? (
                                          <div>
                                            <label className="text-[10px] font-semibold text-amber-100/80">Color</label>
                                            <select
                                              value={selectedMerchColor || family.options.color[0] || ""}
                                              onChange={(event) => setSelectedMerchColor(event.target.value)}
                                              className="print-country-select mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-[11px] text-midnight"
                                              style={{ color: "#111827", WebkitTextFillColor: "#111827", colorScheme: "light" }}
                                            >
                                              <option value="">Select…</option>
                                              {family.options.color.map((c) => (
                                                <option key={c} value={c}>
                                                  {c}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        ) : null}
                                        {family.options.size?.length ? (
                                          <div className={family.options.color?.length ? "sm:col-span-2" : undefined}>
                                            <label className="text-[10px] font-semibold text-amber-100/80">Size</label>
                                            <select
                                              value={selectedMerchSize || family.options.size[0] || ""}
                                              onChange={(event) => setSelectedMerchSize(event.target.value)}
                                              className="print-country-select mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-[11px] text-midnight"
                                              style={{ color: "#111827", WebkitTextFillColor: "#111827", colorScheme: "light" }}
                                            >
                                              <option value="">Select…</option>
                                              {family.options.size.map((s) => (
                                                <option key={s} value={s}>
                                                  {s}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        ) : null}
                                      </>
                                    );
                                  })()}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    startMerchCheckout({
                                      family: selectedMerchFamily,
                                      size:
                                        selectedMerchSize ||
                                        enabledMerchFamilies.find((f) => f.id === selectedMerchFamily)?.options.size?.[0] ||
                                        undefined,
                                      color:
                                        selectedMerchColor ||
                                        enabledMerchFamilies.find((f) => f.id === selectedMerchFamily)?.options.color?.[0] ||
                                        undefined,
                                    })
                                  }
                                  disabled={checkoutInFlight || !printShippingCountry}
                                  className="mt-3 w-full rounded-full border border-amber-200/70 bg-amber-400/25 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:bg-amber-400/35 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {checkoutInFlight ? "Opening secure checkout..." : "Checkout selected merch"}
                                </button>
                              </div>
                            ) : null}
                            {checkoutError && (
                              <p className="mt-2 text-[11px] font-semibold text-rose-200">{checkoutError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
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
              onCanvasReady={() => {
                setCanvasReady(true);
                setIsUpdating(false);
              }}
              variant={variant}
              allowAdvancedInQuick={allowAdvancedInQuick}
              onCustomizeMore={handleCustomizeMore}
              creditsRemaining={creditsRemaining}
              currentPlan={currentPlan}
              printCheckoutEnabled={printCheckoutEnabled}
              preferredPrintVariant={preferredPrintVariant}
              preferredIncludeDigitalAddOn={preferredIncludeDigitalAddOn}
              printShippingCountry={printShippingCountry}
              printShippingCountries={printShippingCountries}
              printCheckoutInFlight={checkoutInFlight}
              onPrintShippingCountryChange={(country) => {
                setPrintShippingCountryValue(country, "mobile-preview");
              }}
              onStartPrintCheckout={
                printCheckoutEnabled
                  ? (options) => {
                      startPrintCheckout({
                        source: "mobile_preview",
                        variant: options.variant,
                        includeDigitalAddOn: options.includeDigitalAddOn,
                        includeCardAddOn: options.includeCardAddOn,
                      });
                    }
                  : undefined
              }
            />
          </div>
        )}
      </section>
      {paywallOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <PaywallModal
              checkoutInFlight={checkoutInFlight}
              checkoutError={checkoutError}
              priceLabels={priceLabels}
              printShippingCountry={printShippingCountry}
              printShippingCountries={printShippingCountries}
              onPrintShippingCountryChange={(country) => {
                setPrintShippingCountryValue(country, "paywall-modal");
              }}
              variant={paywallVariant}
              purchaseIntent={paywallIntent}
              preferredPrintVariant={preferredPrintVariant}
              preferredIncludeDigitalAddOn={preferredIncludeDigitalAddOn}
              giftPaywallContext={isWeddingCommerceContext(searchParams.get("source")) ? "wedding" : undefined}
              showReferralHint={Boolean(getCheckoutReferralCode())}
              onStartCheckout={(plan) => {
                setPaywallIntent("digital");
                void startCheckout(plan);
              }}
              onStartPrintCheckout={
                printCheckoutEnabled
                  ? (options) => {
                      startPrintCheckout({
                        source: "paywall_modal",
                        variant: options.variant,
                        includeDigitalAddOn: options.includeDigitalAddOn,
                        includeCardAddOn: options.includeCardAddOn,
                      });
                    }
                  : undefined
              }
              onClose={() => {
                setPaywallOpen(false);
                setPendingExport(null);
                setCheckoutError(null);
              }}
            />,
            document.body
          )
        : null}
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
            className="focus:ring-gold absolute top-4 left-4 z-10 rounded-full border border-amber-200 bg-[rgba(247,241,227,0.95)] px-4 py-2 text-sm font-semibold text-neutral-800 shadow transition hover:-translate-y-[1px] hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0b1a30] focus:outline-none sm:top-6 sm:left-6"
            aria-label="Exit fullscreen"
          >
            ⤡ Exit fullscreen
          </button>
          <div className="relative flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] items-center justify-center">
            <PreviewCanvas fullscreen />
          </div>
        </div>
      )}
    </>
  );
}
