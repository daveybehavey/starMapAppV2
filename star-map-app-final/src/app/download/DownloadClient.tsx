"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap, type MapRecipe } from "@/lib/renderSky";
import { FONT_STACKS } from "@/lib/fonts";
import { getShapeData } from "@/lib/shapeUtils";
import { buildStarMapDownloadFilename } from "@/lib/downloadFilename";
import type { Shape } from "@/lib/types";
import {
  track,
  trackBeginCheckout,
  trackCheckoutClientDiagnostic,
  trackFunnelStep,
  trackSelectItem,
  trackViewItemList,
} from "@/lib/analytics";
import {
  formatPrice,
  getPrintPricingTiers,
  type CheckoutPlan,
  type PrintVariant,
} from "@/lib/pricing";
import { getPrintAllowedCountries, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { isPrintVariant, PAYWALL_PRINT_VARIANT_ORDER } from "@/lib/printCatalog";
import { listDownloadPrintUpsellCards } from "@/lib/downloadPrintUpsellCatalog";
import { getDefaultMerchEditorHref } from "@/lib/merchCatalog";
import { formatPosterShippingFootnote } from "@/lib/paywallPrintCheckout";
import {
  formatPrintShippingEstimate,
  getPrintShippingCountryLabel,
  getPrintShippingCountryOptions,
  readStoredPrintShippingCountry,
  storePrintShippingCountry,
} from "@/lib/printfulShipping";
import {
  buildReferralShareUrl,
  getReferralFriendOfferLabel,
  getReferralShareMessage,
} from "@/lib/referralShare";
import EditorFontShell from "@/components/EditorFontShell";
import PostPurchaseProofRequest from "@/components/PostPurchaseProofRequest";
import ResilientImage from "@/components/ResilientImage";
import {
  createHdConsumeToken,
  formatHdExportConsumeFailedMessage,
  formatHdExportFailedMessage,
  postHdCreditCompensate,
  postHdCreditConsume,
  triggerBlobDownload,
  verifyStripeSessionForDownload,
} from "@/lib/hdExportFulfillment";

const DRAFT_KEY = "star-map-draft";
const LEGACY_SIMPLIFIED_DRAFT_KEY = "starmap-simplified-draft";
const AUTO_EXPORT_KEY = "star-map-auto-export";
const CHECKOUT_MAP_KEY = "star-map-checkout-id";
const LEGACY_CHECKOUT_MAP_KEY = "checkout-map-id";

type Status = "checking" | "ready" | "downloading" | "error" | "no-draft" | "not-paid";
type PreviewStatus = "idle" | "rendering" | "ready" | "error";
type ReferralStatus = "idle" | "loading" | "ready" | "error";
type ReferralSourceSummary = {
  source: string;
  visits: number;
};
type ReferralCountSummary = {
  value: string;
  count: number;
};
type ReferralSummary = {
  visits: number;
  conversions: number;
  rewardsGranted: number;
  lastConvertedAt: number | null;
  topVisitSources: ReferralSourceSummary[];
  topConversionSources: ReferralSourceSummary[];
  topRewardSkipReasons: ReferralCountSummary[];
  topOfferVariants: ReferralCountSummary[];
  rewardReversals: number;
  conversionReversals: number;
};

const PREVIEW_BASE_WIDTH = 1200;
const PREVIEW_MAX_DIM = 2200;
const PREVIEW_MAX_DPR = 2;
const MAX_PRINT_ASSET_BYTES = 16 * 1024 * 1024;
const printCheckoutEnabled = /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim());
const printShippingDisclosure = getPrintShippingDisclosure();
const merchDownloadEditorHref = getDefaultMerchEditorHref("download-merch-teaser");
const referralRewardCredits = (() => {
  const raw = process.env.NEXT_PUBLIC_REFERRAL_REWARD_CREDITS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
})();
const referralRewardCreditsLabel = `${referralRewardCredits} bonus HD credit${referralRewardCredits === 1 ? "" : "s"}`;
const referralFriendOfferLabel = getReferralFriendOfferLabel();
const referralShareMessage = getReferralShareMessage();
const supportEmail = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@starmapco.com").trim() || "support@starmapco.com";
const downloadArchiveEnabled = /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_DOWNLOAD_ARCHIVE_ENABLED || "").trim());
const DEFAULT_REFERRAL_SUMMARY: ReferralSummary = {
  visits: 0,
  conversions: 0,
  rewardsGranted: 0,
  lastConvertedAt: null,
  topVisitSources: [],
  topConversionSources: [],
  topRewardSkipReasons: [],
  topOfferVariants: [],
  rewardReversals: 0,
  conversionReversals: 0,
};

function getPreviewSource() {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem("preview_source");
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

function getDeviceDownloadLocationHint() {
  if (typeof navigator === "undefined") return "Check your browser download history if it doesn't open.";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "On iPhone/iPad, open Files app -> Browse -> Downloads.";
  }
  if (/Android/i.test(ua)) {
    return "On Android, open Files/My Files -> Downloads.";
  }
  return "Check your Downloads folder if it doesn't open.";
}

function formatDownloadStartedMessage({
  plan,
  remaining,
}: {
  plan?: CheckoutPlan | null;
  remaining: number | null;
}) {
  const locationHint = getDeviceDownloadLocationHint();
  if (plan === "subscription") {
    return `Download started. Unlimited HD exports active. ${locationHint}`;
  }
  if (remaining === 0) {
    return `Download started. That was your last HD export credit. ${locationHint}`;
  }
  if (typeof remaining === "number") {
    if (plan === "pack3") {
      return `Download started. ${remaining} HD export credit${remaining === 1 ? "" : "s"} remaining. Create/edit another map, then download again for your next file. ${locationHint}`;
    }
    return `Download started. ${remaining} HD export credit${remaining === 1 ? "" : "s"} remaining. ${locationHint}`;
  }
  return `Download started. ${locationHint}`;
}

function getPreviewPixelRatio(width: number, height: number) {
  if (typeof window === "undefined") return 1;
  const deviceRatio = Math.min(PREVIEW_MAX_DPR, window.devicePixelRatio || 1);
  const maxScale = PREVIEW_MAX_DIM / Math.max(width, height);
  return Math.max(1, Math.min(deviceRatio, maxScale));
}

function getPreviewRenderSize(ratio: number) {
  const baseWidth = PREVIEW_BASE_WIDTH;
  const baseHeight = Math.max(1, Math.round(baseWidth / ratio));
  const pixelRatio = getPreviewPixelRatio(baseWidth, baseHeight);
  return {
    baseWidth,
    baseHeight,
    pixelRatio,
    width: Math.round(baseWidth * pixelRatio),
    height: Math.max(1, Math.round(baseHeight * pixelRatio)),
  };
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

function normalizeRecipe(recipe: MapRecipe): MapRecipe {
  return buildRecipeFromState({
    dateTime: recipe.datetimeISO,
    location: recipe.location,
    textBoxes: recipe.textBoxes,
    selectedStyle: recipe.selectedStyle,
    aspectRatio: recipe.aspectRatio,
    shape: recipe.shape,
    renderOptions: recipe.renderOptions,
    seed: recipe.seed,
  });
}

async function ensureFontsLoaded(recipe: MapRecipe | null) {
  if (!recipe || typeof document === "undefined" || !document.fonts) return;
  const stacks = new Set<string>();
  for (const box of recipe.textBoxes ?? []) {
    const stack = FONT_STACKS[box.fontFamily as keyof typeof FONT_STACKS];
    if (stack) stacks.add(stack);
  }
  const loads = Array.from(stacks, (stack) => document.fonts.load(`600 32px ${stack}`));
  if (loads.length) {
    await Promise.all(loads);
  }
  await document.fonts.ready;
}

function readDraft(): MapRecipe | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DRAFT_KEY) || localStorage.getItem(LEGACY_SIMPLIFIED_DRAFT_KEY);
  } catch {
    return null;
  }
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
      return normalizeRecipe(parsed as MapRecipe);
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

function readStoredMapId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(CHECKOUT_MAP_KEY) || localStorage.getItem(LEGACY_CHECKOUT_MAP_KEY);
    return value ? value.trim() : null;
  } catch {
    return null;
  }
}

export default function DownloadClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<MapRecipe | null>(null);
  const [paid, setPaid] = useState(false);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [currentPlan, setCurrentPlan] = useState<CheckoutPlan | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewAspect, setPreviewAspect] = useState<string>("1 / 1");
  const previewGeneratedRef = useRef(false);
  const paidRef = useRef(false);
  const printUpsellTrackedRef = useRef(false);
  const mapIdFromUrl = searchParams.get("map_id")?.trim() || null;
  const sessionIdFromUrl = searchParams.get("session_id")?.trim() || null;
  const tokenFromUrl = searchParams.get("token")?.trim() || null;
  const upsellRaw = searchParams.get("upsell")?.trim();
  const upsellIntent = isPrintVariant(upsellRaw) ? upsellRaw : null;
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [accessLinkStatus, setAccessLinkStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const accessLinkStatusRef = useRef<"idle" | "loading" | "ready" | "error">("idle");
  const accessLinkInitRef = useRef(false);
  const initCompletedRef = useRef(false);
  const lastAccessInitKeyRef = useRef<string | null>(null);
  const [accessLinkCopied, setAccessLinkCopied] = useState(false);
  const [accessEmailStatus, setAccessEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [accessEmailMessage, setAccessEmailMessage] = useState<string | null>(null);
  const consumePromiseRef = useRef<
    Promise<false | { creditsRemaining?: number | null; plan?: CheckoutPlan | null; consumeToken?: string }> | null
  >(null);
  const [downloadInFlight, setDownloadInFlight] = useState(false);
  const downloadInFlightRef = useRef(false);
  const [restoreCreditToken, setRestoreCreditToken] = useState<string | null>(null);
  const [restoreCreditStatus, setRestoreCreditStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const statusTrackedRef = useRef<Record<Status, boolean>>({
    checking: false,
    ready: false,
    downloading: false,
    error: false,
    "no-draft": false,
    "not-paid": false,
  });
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [printCheckoutLoading, setPrintCheckoutLoading] = useState(false);
  const printCheckoutInFlightRef = useRef(false);
  const [printCheckoutError, setPrintCheckoutError] = useState<string | null>(null);
  const printUpsellRef = useRef<HTMLDivElement | null>(null);
  const printUpsellFocusedRef = useRef(false);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralPostCopied, setReferralPostCopied] = useState(false);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus>("idle");
  const [referralSummary, setReferralSummary] = useState<ReferralSummary>(DEFAULT_REFERRAL_SUMMARY);
  const printShippingCountries = useMemo(() => getPrintAllowedCountries(), []);
  const printShippingCountryOptions = useMemo(
    () => getPrintShippingCountryOptions(printShippingCountries),
    [printShippingCountries],
  );
  const [printShippingCountry, setPrintShippingCountry] = useState<string>(
    printShippingCountryOptions[0]?.code ?? "US",
  );

  const printTiers = useMemo(() => getPrintPricingTiers(), []);
  const posterShippingFootnote = useMemo(() => formatPosterShippingFootnote(printShippingCountry), [printShippingCountry]);
  const downloadPrintOptions = useMemo(() => {
    return listDownloadPrintUpsellCards().map((card) => {
      const tier = printTiers[card.variant];
      const ship = formatPrintShippingEstimate(card.variant, printShippingCountry, "shipping");
      return {
        ...card,
        label: tier.label,
        priceLine: `${formatPrice(tier.amountCents, tier.currency)} + ${ship}`,
      };
    });
  }, [printShippingCountry, printTiers]);
  const recommendedPrintOption = useMemo(
    () => downloadPrintOptions.find((option) => option.variant === "poster_framed") ?? downloadPrintOptions[0],
    [downloadPrintOptions],
  );
  const secondaryPrintOptions = useMemo(
    () => downloadPrintOptions.filter((option) => option.variant !== recommendedPrintOption?.variant),
    [downloadPrintOptions, recommendedPrintOption],
  );
  const unframedPrintOption = useMemo(
    () => downloadPrintOptions.find((option) => option.variant === "poster_unframed") ?? null,
    [downloadPrintOptions],
  );
  const morePrintOptions = useMemo(
    () => secondaryPrintOptions.filter((option) => option.variant !== "poster_unframed"),
    [secondaryPrintOptions],
  );
  const shippingCountryLabel = useMemo(
    () => getPrintShippingCountryLabel(printShippingCountry),
    [printShippingCountry],
  );
  const isIosDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }, []);
  const isAndroidDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /Android/i.test(navigator.userAgent || "");
  }, []);

  useEffect(() => {
    if (!printCheckoutEnabled) return;
    const stored = readStoredPrintShippingCountry();
    if (stored && printShippingCountries.includes(stored)) {
      setPrintShippingCountry(stored);
      return;
    }
    if (printShippingCountryOptions[0]?.code) {
      const fallback = printShippingCountryOptions[0].code;
      setPrintShippingCountry(fallback);
      storePrintShippingCountry(fallback);
    }
  }, [printShippingCountries, printShippingCountryOptions]);

  useEffect(() => {
    if (!printCheckoutEnabled || status !== "ready" || !paid) return;
    if (!printUpsellTrackedRef.current) {
      printUpsellTrackedRef.current = true;
      track("print_upsell_viewed", { source: "download", variant: upsellIntent ?? "default" });
      trackViewItemList({
        itemListId: "download_print_upsell",
        itemListName: "Download print upsell",
        items: PAYWALL_PRINT_VARIANT_ORDER.map((variant, index) => ({
          plan: "single",
          orderType: "print" as const,
          printVariant: variant,
          index,
        })),
      });
    }
    if (!upsellIntent || printUpsellFocusedRef.current) return;
    printUpsellFocusedRef.current = true;
    window.requestAnimationFrame(() => {
      printUpsellRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [paid, status, upsellIntent]);

  const setPaidState = useCallback((value: boolean) => {
    paidRef.current = value;
    setPaid(value);
  }, []);

  const refreshPaidStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/premium", { cache: "no-store" });
      if (!res.ok) return { paid: false };
      const data = (await res.json()) as {
        paid?: boolean;
        creditsRemaining?: number | null;
        plan?: CheckoutPlan | null;
      };
      // If user has credits, treat as paid regardless of API paid field (defense in depth)
      const nextPaid = Boolean(data.paid) || (typeof data.creditsRemaining === "number" && data.creditsRemaining > 0);
      setPaidState(nextPaid);
      setCreditsRemaining(typeof data.creditsRemaining === "number" ? data.creditsRemaining : null);
      setCurrentPlan(
        data.plan === "single" || data.plan === "pack3" || data.plan === "subscription" ? data.plan : null,
      );
      return {
        paid: nextPaid,
        creditsRemaining: typeof data.creditsRemaining === "number" ? data.creditsRemaining : null,
        plan:
          data.plan === "single" || data.plan === "pack3" || data.plan === "subscription" ? data.plan : null,
      };
    } catch {
      return { paid: false };
    }
  }, [setPaidState]);

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
          setPaidState(true);
        }
        return {
          creditsRemaining: data.creditsRemaining ?? null,
          plan: data.plan ?? null,
          consumeToken: data.consumeToken,
        };
      } catch {
        return false;
      } finally {
        consumePromiseRef.current = null;
      }
    })();
    consumePromiseRef.current = promise;
    return promise;
  }, [setPaidState]);

  const restoreFailedDownloadCredit = useCallback(async () => {
    if (!restoreCreditToken || restoreCreditStatus === "loading") return;
    setRestoreCreditStatus("loading");
    const result = await postHdCreditCompensate(restoreCreditToken);
    if (!result.ok) {
      setRestoreCreditStatus("error");
      setMessage("We couldn't restore your credit automatically. Please contact support with your receipt.");
      return;
    }
    if (typeof result.creditsRemaining === "number") {
      setCreditsRemaining(result.creditsRemaining);
    }
    setPaidState(true);
    setRestoreCreditToken(null);
    setRestoreCreditStatus("done");
    setStatus("ready");
    setMessage("Credit restored. Please try Download HD file again.");
    void refreshPaidStatus();
  }, [refreshPaidStatus, restoreCreditStatus, restoreCreditToken, setPaidState]);

  const claimAccessToken = useCallback(
    async (token: string) => {
      try {
        const res = await fetch(`/api/entitlements/claim?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          paid?: boolean;
          mapId?: string | null;
          plan?: CheckoutPlan | null;
          creditsRemaining?: number | null;
          subscriptionActive?: boolean | null;
        };
        // If user has credits, treat as paid regardless of API paid field (defense in depth)
        const nextPaid = Boolean(data.paid) || (typeof data.creditsRemaining === "number" && data.creditsRemaining > 0);
        setPaidState(nextPaid);
        setCreditsRemaining(typeof data.creditsRemaining === "number" ? data.creditsRemaining : null);
        setCurrentPlan(
          data.plan === "single" || data.plan === "pack3" || data.plan === "subscription" ? data.plan : null,
        );
        return typeof data.mapId === "string" && data.mapId.trim() ? data.mapId.trim() : null;
      } catch {
        return null;
      }
    },
    [setPaidState],
  );

  const createAccessLink = useCallback(async (force = false) => {
    if (accessLinkStatusRef.current === "loading") return;
    accessLinkStatusRef.current = "loading";
    setAccessLinkStatus("loading");
    try {
      const res = await fetch("/api/entitlements/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: force ? JSON.stringify({ force: true }) : undefined,
      });
      if (!res.ok) throw new Error("link failed");
      const data = (await res.json()) as { url?: string };
      if (typeof data.url === "string" && data.url.trim()) {
        setAccessLink(data.url.trim());
        accessLinkStatusRef.current = "ready";
        setAccessLinkStatus("ready");
        return;
      }
      throw new Error("missing url");
    } catch {
      accessLinkStatusRef.current = "error";
      setAccessLinkStatus("error");
    }
  }, []);

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

  const fetchMapRecipe = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/maps?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as MapRecipe;
      if (!data?.datetimeISO || !data?.location || !data?.textBoxes || !data?.selectedStyle) {
        return null;
      }
      return normalizeRecipe(data);
    } catch {
      return null;
    }
  }, []);

  const updatePreviewAspect = useCallback(
    async (activeRecipe: MapRecipe) => {
      const { ratio } = await resolveShapeAndRatio(activeRecipe);
      setPreviewAspect(`${ratio} / 1`);
    },
    [resolveShapeAndRatio],
  );

  const setPreviewFromCanvas = useCallback((sourceCanvas: HTMLCanvasElement, ratio: number) => {
    const { width, height } = getPreviewRenderSize(ratio);
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = width;
    previewCanvas.height = height;
    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
    const url = previewCanvas.toDataURL("image/png");
    setPreviewUrl(url);
    setPreviewStatus("ready");
    previewGeneratedRef.current = true;
    return true;
  }, []);

  const startDownload = useCallback(
    async (recipeOverride?: MapRecipe, source: "auto" | "manual" = "manual") => {
      if (downloadInFlightRef.current) return;
      downloadInFlightRef.current = true;
      setDownloadInFlight(true);
      const activeRecipe = recipeOverride ?? recipe;
      try {
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

        if (!previewGeneratedRef.current) {
          setPreviewStatus("rendering");
        }

        setStatus("downloading");
        setMessage(source === "auto" ? "Preparing your HD file..." : null);
        const previewSource = getPreviewSource() ?? "download";
        trackFunnelStep("download_started", {
          source: previewSource,
          plan: currentPlan ?? undefined,
        });

        await ensureFontsLoaded(activeRecipe);

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

        if (!previewGeneratedRef.current) {
          const previewOk = setPreviewFromCanvas(canvas, ratio);
          if (!previewOk) {
            setPreviewStatus("error");
          }
        }

        const blob = await canvasToPngBlob(canvas);
        const mapIdForFile = mapIdFromUrl || readStoredMapId();
        const downloadFileName = buildStarMapDownloadFilename({
          recipe: activeRecipe,
          mode: "hd",
          mapId: mapIdForFile,
        });

        const triggered = triggerBlobDownload(blob, downloadFileName);
        if (!triggered.ok) {
          setStatus("error");
          setMessage(formatHdExportFailedMessage(true));
          trackFunnelStep("download_failed", {
            source: previewSource,
            plan: currentPlan ?? undefined,
            reason: "trigger_failed",
          });
          return;
        }

        const consumeToken = createHdConsumeToken();
        const consumed = await consumeHdCredit(consumeToken);
        if (!consumed) {
          setStatus("error");
          setMessage(formatHdExportConsumeFailedMessage());
          void refreshPaidStatus();
          return;
        }

        // Best-effort archival so support can resend the exact paid-for file later.
        if (downloadArchiveEnabled && tokenFromUrl) {
          void fetch(`/api/download/archive?token=${encodeURIComponent(tokenFromUrl)}`, {
            method: "POST",
            headers: { "content-type": "image/png" },
            body: blob,
          }).catch(() => {
            // Ignore archival failures (download already succeeded).
          });
        }

        try {
          localStorage.removeItem(AUTO_EXPORT_KEY);
        } catch {
          // ignore storage errors
        }

        setStatus("ready");
        const remaining =
          typeof consumed.creditsRemaining === "number" ? consumed.creditsRemaining : null;
        setMessage(formatDownloadStartedMessage({ plan: consumed.plan ?? currentPlan, remaining }));
        if (consumed.consumeToken) {
          setRestoreCreditToken(consumed.consumeToken);
          setRestoreCreditStatus("idle");
        }
        track("export_download", { type: "hd", source });
        trackFunnelStep("download_completed", {
          source: previewSource,
          plan: currentPlan ?? undefined,
        });
        // Refresh paid status to keep verification badge in sync
        void refreshPaidStatus();
      } catch (err) {
        console.error("Download failed", err);
        setStatus("error");
        setMessage(formatHdExportFailedMessage(true));
        if (!previewGeneratedRef.current) {
          setPreviewStatus("error");
        }
        trackFunnelStep("download_failed", {
          source: getPreviewSource() ?? "download",
          plan: currentPlan ?? undefined,
          reason: "render_failed",
        });
      } finally {
        downloadInFlightRef.current = false;
        setDownloadInFlight(false);
      }
    },
    [
      consumeHdCredit,
      currentPlan,
      mapIdFromUrl,
      recipe,
      refreshPaidStatus,
      resolveShapeAndRatio,
      setPreviewFromCanvas,
      tokenFromUrl,
    ],
  );

  const renderPreview = useCallback(
    async (activeRecipe: MapRecipe) => {
      if (!paidRef.current) return;
      if (previewStatus === "rendering") return;
      setPreviewStatus("rendering");

      try {
        await ensureFontsLoaded(activeRecipe);

        const { shape, ratio } = await resolveShapeAndRatio(activeRecipe);
        setPreviewAspect(`${ratio} / 1`);
        const { baseWidth, baseHeight, pixelRatio } = getPreviewRenderSize(ratio);
        const canvas = document.createElement("canvas");

        await renderStarMap({
          recipe: { ...activeRecipe, shape },
          canvas,
          width: baseWidth,
          height: baseHeight,
          watermark: false,
          // Match export styling as closely as possible (lower resolution only).
          quality: "export",
          premium: true,
          pixelRatio,
        });

        const url = canvas.toDataURL("image/png");
        setPreviewUrl(url);
        setPreviewStatus("ready");
        previewGeneratedRef.current = true;
      } catch {
        setPreviewStatus("error");
      }
    },
    [previewStatus, resolveShapeAndRatio],
  );

  const accessInitKey = useMemo(
    () => `${tokenFromUrl ?? ""}|${sessionIdFromUrl ?? ""}|${mapIdFromUrl ?? ""}`,
    [mapIdFromUrl, sessionIdFromUrl, tokenFromUrl],
  );

  useEffect(() => {
    if (lastAccessInitKeyRef.current === accessInitKey && initCompletedRef.current) {
      return;
    }
    if (lastAccessInitKeyRef.current !== accessInitKey) {
      lastAccessInitKeyRef.current = accessInitKey;
      initCompletedRef.current = false;
    }

    let active = true;
    const init = async () => {
      if (initCompletedRef.current) return;

      setStatus("checking");
      setMessage("Checking access...");
      let claimedMapId: string | null = null;
      let tokenInvalid = false;
      if (tokenFromUrl) {
        claimedMapId = await claimAccessToken(tokenFromUrl);
        if (!claimedMapId) {
          tokenInvalid = true;
        }
        if (claimedMapId) {
          try {
            localStorage.setItem(CHECKOUT_MAP_KEY, claimedMapId);
          } catch {
            // ignore storage errors
          }
        }
      }
      const paidResult = await refreshPaidStatus();
      let accessResult = paidResult;
      if (!accessResult.paid && sessionIdFromUrl) {
        const verified = await verifyStripeSessionForDownload(sessionIdFromUrl);
        if (verified.ok) {
          setPaidState(true);
          if (typeof verified.creditsRemaining === "number") {
            setCreditsRemaining(verified.creditsRemaining);
          }
          if (
            verified.plan === "single" ||
            verified.plan === "pack3" ||
            verified.plan === "subscription"
          ) {
            setCurrentPlan(verified.plan);
          }
          accessResult = {
            paid: true,
            creditsRemaining:
              typeof verified.creditsRemaining === "number" ? verified.creditsRemaining : null,
            plan:
              verified.plan === "single" ||
              verified.plan === "pack3" ||
              verified.plan === "subscription"
                ? verified.plan
                : null,
          };
        }
      }
      if (!active) return;
      if (!accessResult.paid) {
        setStatus("not-paid");
        setMessage(
          tokenInvalid
            ? "This access link has expired or was replaced. Open your original device to generate a new link."
            : typeof accessResult.creditsRemaining === "number" && accessResult.creditsRemaining <= 0
            ? "You have no HD export credits remaining. Choose a new pack or subscription to continue."
            : sessionIdFromUrl
              ? "We couldn't verify your payment yet. Refresh this page or reopen your success link."
              : "Payment verification is still pending. Please refresh in a moment.",
        );
        return;
      }

      if (mapIdFromUrl) {
        try {
          localStorage.setItem(CHECKOUT_MAP_KEY, mapIdFromUrl);
        } catch {
          // ignore storage errors (e.g. private browsing)
        }
      }

      let draft = readDraft();
      const fallbackMapId = mapIdFromUrl || claimedMapId || readStoredMapId();
      if (!draft && fallbackMapId) {
        const fetched = await fetchMapRecipe(fallbackMapId);
        if (fetched) {
          draft = fetched;
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(fetched));
          } catch {
            // ignore storage errors (e.g. private browsing)
          }
        }
      }

      if (!draft) {
        setStatus("no-draft");
        setMessage(
          fallbackMapId
            ? "We couldn't load your saved map. Please refresh or open the editor to rebuild it."
            : "We couldn't find your saved map in this browser (incognito/private windows can clear it). Open the editor to rebuild it, then download.",
        );
        track("download_missing_map", { hasMapId: Boolean(fallbackMapId) });
        return;
      }

      setRecipe(draft);
      setStatus("ready");
      setMessage("Your HD file is ready.");
      initCompletedRef.current = true;
      void updatePreviewAspect(draft);
      if (!accessLinkInitRef.current) {
        accessLinkInitRef.current = true;
        void createAccessLink();
      }

      // Do not auto-download; let the user click the button for the download.
    };

    void init();
    return () => {
      active = false;
    };
  }, [
    accessInitKey,
    claimAccessToken,
    createAccessLink,
    fetchMapRecipe,
    mapIdFromUrl,
    refreshPaidStatus,
    sessionIdFromUrl,
    tokenFromUrl,
    updatePreviewAspect,
  ]);

  useEffect(() => {
    if (!recipe || !paid) return;
    if (previewUrl || previewStatus !== "idle") return;
    const timer = window.setTimeout(() => {
      void renderPreview(recipe);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [paid, previewStatus, previewUrl, recipe, renderPreview]);

  useEffect(() => {
    if (statusTrackedRef.current[status]) return;
    statusTrackedRef.current[status] = true;
    track("download_state_seen", {
      state: status,
      plan: currentPlan ?? undefined,
      has_map_id: Boolean(mapIdFromUrl || readStoredMapId()),
      credits_remaining: typeof creditsRemaining === "number" ? creditsRemaining : undefined,
    });
  }, [creditsRemaining, currentPlan, mapIdFromUrl, status]);

  const handleCopyAccessLink = useCallback(async () => {
    if (!accessLink) return;
    try {
      await navigator.clipboard.writeText(accessLink);
      setAccessLinkCopied(true);
      window.setTimeout(() => setAccessLinkCopied(false), 2000);
      track("download_recovery_action", { action: "copy_access_link", source: "access_panel" });
    } catch {
      // ignore clipboard errors
    }
  }, [accessLink]);

  const handleSendAccessEmail = useCallback(async () => {
    setAccessEmailStatus("sending");
    setAccessEmailMessage(null);
    try {
      const res = await fetch("/api/account/access-email", { method: "POST" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string; supportEmail?: string } | null;
        if (res.status === 401 || res.status === 403) {
          setAccessEmailStatus("error");
          setAccessEmailMessage("Access isn't verified on this device yet. Reopen your secure link and retry.");
          track("access_link_email_requested", { source: "download", outcome: "unauthorized" });
          return;
        }
        if (payload?.error === "missing_customer_email") {
          const contact = payload.supportEmail || supportEmail;
          setAccessEmailStatus("error");
          setAccessEmailMessage(`No checkout email is attached to this order. Contact ${contact}.`);
          track("access_link_email_requested", { source: "download", outcome: "missing_email" });
          return;
        }
        if (payload?.error === "account_access_email_not_configured") {
          const contact = payload.supportEmail || supportEmail;
          setAccessEmailStatus("error");
          setAccessEmailMessage(`Email delivery is unavailable right now. Contact ${contact}.`);
          track("access_link_email_requested", { source: "download", outcome: "not_configured" });
          return;
        }
        throw new Error(payload?.error ?? "request_failed");
      }
      setAccessEmailStatus("sent");
      setAccessEmailMessage("Sent. Check your email to open all downloads in My Downloads.");
      track("access_link_email_requested", { source: "download", outcome: "sent" });
    } catch {
      setAccessEmailStatus("error");
      setAccessEmailMessage(`Couldn't send the email yet. Please retry or contact ${supportEmail}.`);
      track("access_link_email_requested", { source: "download", outcome: "error" });
    }
  }, []);

  const handleOpenAccessLink = useCallback(() => {
    if (!accessLink) return;
    track("download_recovery_action", { action: "open_access_link", source: "access_panel" });
    window.open(accessLink, "_blank", "noopener,noreferrer");
  }, [accessLink]);

  const handleSendRecoveryEmail = useCallback(async () => {
    const email = recoveryEmail.trim().toLowerCase();
    if (!email) {
      setRecoveryStatus("error");
      setRecoveryMessage("Enter the checkout email used for your purchase.");
      return;
    }
    setRecoveryStatus("sending");
    setRecoveryMessage(null);
    try {
      const res = await fetch("/api/account/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          setRecoveryStatus("error");
          setRecoveryMessage("Too many attempts. Please wait a bit before trying again.");
          track("account_recovery_requested", { source: "download", outcome: "rate_limited" });
          return;
        }
        const payload = (await res.json().catch(() => null)) as { error?: string; supportEmail?: string } | null;
        if (payload?.error === "recovery_email_not_configured") {
          const contact = payload.supportEmail || supportEmail;
          setRecoveryStatus("error");
          setRecoveryMessage(`Recovery email is unavailable right now. Contact ${contact} and we can restore access.`);
          track("account_recovery_requested", { source: "download", outcome: "not_configured" });
          return;
        }
        if (res.status === 400) {
          setRecoveryStatus("error");
          setRecoveryMessage("Use a valid email address.");
          track("account_recovery_requested", { source: "download", outcome: "invalid_email" });
          return;
        }
        throw new Error("request_failed");
      }
      setRecoveryStatus("sent");
      setRecoveryMessage("If that email matches a paid order, we sent fresh recovery links.");
      track("account_recovery_requested", { source: "download", outcome: "accepted" });
    } catch {
      setRecoveryStatus("error");
      setRecoveryMessage(`Couldn't send recovery links yet. Please retry or contact ${supportEmail}.`);
      track("account_recovery_requested", { source: "download", outcome: "error" });
    }
  }, [recoveryEmail]);

  const handleManageBilling = useCallback(async () => {
    if (portalLoading) return;
    setPortalLoading(true);
    setPortalError(null);
    track("billing_portal_opened", { source: "download" });
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) throw new Error("portal_failed");
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error("missing_url");
      window.location.assign(data.url);
    } catch {
      setPortalError("Unable to open billing settings right now.");
      setPortalLoading(false);
    }
  }, [portalLoading]);

  const handleRetryVerification = useCallback(() => {
    window.location.reload();
  }, []);

  const handlePrintCheckout = useCallback(
    async (variant: PrintVariant) => {
      if (printCheckoutInFlightRef.current) return;
      if (!printCheckoutEnabled) {
        setPrintCheckoutError("Print checkout is not live yet.");
        return;
      }
      printCheckoutInFlightRef.current = true;
      trackSelectItem({
        itemListId: "download_print_upsell",
        itemListName: "Download print upsell",
        item: {
          plan: "single",
          orderType: "print",
          printVariant: variant,
          index: PAYWALL_PRINT_VARIANT_ORDER.indexOf(variant),
        },
      });
      setPrintCheckoutLoading(true);
      setPrintCheckoutError(null);
      let checkoutApiResponseReceived = false;
      let checkoutStartedTracked = false;
      try {
        const shippingCountry = printShippingCountry?.trim().toUpperCase() || readStoredPrintShippingCountry();
        if (!shippingCountry) {
          throw new Error("missing_shipping_country");
        }
        const mapId = mapIdFromUrl || readStoredMapId();
        const activeRecipe = recipe ?? readDraft();
        if (!activeRecipe) {
          throw new Error("missing_recipe");
        }
        await ensureFontsLoaded(activeRecipe);
        const { shape, ratio } = await resolveShapeAndRatio(activeRecipe);
        let uploadedAssetId: string | null = null;
        let lastAssetError: string | null = null;
        const exportWidths = [6000, 5400, 5000, 4600, 4200];
        const uploadQualities = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44];
        for (const exportWidth of exportWidths) {
          if (uploadedAssetId) break;
          const exportHeight = Math.max(1, Math.round(exportWidth / ratio));
          const canvas = document.createElement("canvas");
          await renderStarMap({
            recipe: { ...activeRecipe, shape },
            canvas,
            width: exportWidth,
            height: exportHeight,
            watermark: false,
            quality: "export",
            premium: true,
            matPurpose: "print",
          });
          for (let index = 0; index < uploadQualities.length; index += 1) {
            const quality = uploadQualities[index];
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            if (estimateDataUrlBytes(dataUrl) > MAX_PRINT_ASSET_BYTES) {
              lastAssetError = "print_asset_too_large";
              continue;
            }
            const assetRes = await fetch("/api/print/assets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mapId: mapId ?? undefined,
                dataUrl,
                source: "download",
              }),
            });
            const assetData = (await assetRes.json().catch(() => null)) as
              | { assetId?: string; error?: string }
              | null;
            if (assetRes.ok && assetData?.assetId) {
              uploadedAssetId = assetData.assetId;
              break;
            }
            if (typeof assetData?.error === "string") {
              lastAssetError = assetData.error;
            }
            const shouldRetryForSize =
              index < uploadQualities.length - 1 &&
              typeof assetData?.error === "string" &&
              /16MB|base64|Invalid print asset/i.test(assetData.error);
            if (!shouldRetryForSize) break;
          }
        }
        if (!uploadedAssetId) {
          if (lastAssetError === "print_asset_too_large") {
            throw new Error("print_asset_too_large");
          }
          throw new Error("asset_upload_failed");
        }
        trackFunnelStep("checkout_started", {
          source: "download",
          plan: variant,
        });
        checkoutStartedTracked = true;
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: "single",
            orderType: "print",
            printVariant: variant,
            includeDigitalAddOn: false,
            printAssetId: uploadedAssetId,
            mapId: mapId ?? undefined,
            shippingCountry,
          }),
        });
        checkoutApiResponseReceived = true;
        const data = (await res.json().catch(() => null)) as
          | { url?: string; error?: string; code?: string }
          | null;
        if (!res.ok || !data?.url) {
          if (data?.code === "print_checkout_disabled") {
            throw new Error("print_checkout_disabled");
          }
          if (data?.code === "missing_print_asset") {
            throw new Error("missing_print_asset");
          }
          if (data?.code === "print_shipping_country_invalid") {
            throw new Error("print_shipping_country_invalid");
          }
          if (data?.code === "missing_shipping_country") {
            throw new Error("missing_shipping_country");
          }
          throw new Error(data?.code ?? data?.error ?? "checkout_failed");
        }
        track("print_checkout_started", {
          source: "download",
          variant,
          hasMapId: Boolean(mapId),
        });
        trackBeginCheckout({
          source: "download",
          plan: "single",
          orderType: "print",
          printVariant: variant,
          includeDigitalAddOn: false,
        });
        window.location.assign(data.url);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "checkout_failed";
        if (checkoutStartedTracked && !checkoutApiResponseReceived) {
          trackCheckoutClientDiagnostic({
            reason,
            source: "download",
            plan: variant,
            orderType: "print",
            printVariant: variant,
            includeDigitalAddOn: false,
          });
        }
        const messageByReason =
          reason === "missing_recipe"
            ? "We couldn't find your saved map. Open the editor once, then try print checkout again."
            : reason === "asset_upload_failed"
              ? "We couldn't prepare your print file. Please try again."
              : reason === "print_asset_too_large"
                ? "This map export is too large for print checkout right now. Try a simpler style or contact support."
              : reason === "missing_shipping_country"
                ? "Select a shipping country in the editor before starting print checkout."
              : reason === "print_shipping_country_invalid"
                ? "Shipping isn’t available for that country yet. Please select another."
              : reason === "missing_print_asset"
                ? "Could not attach your print file. Please retry print checkout."
                : reason === "print_checkout_disabled"
                  ? "Print checkout is not live yet."
                  : reason === "unknown_error"
                    ? "We couldn't start checkout right now. Please try again shortly."
                  : "Print checkout is unavailable right now. Please try again.";
        setPrintCheckoutError(messageByReason);
        printCheckoutInFlightRef.current = false;
        setPrintCheckoutLoading(false);
      }
    },
    [mapIdFromUrl, printShippingCountry, recipe, resolveShapeAndRatio],
  );

  const loadReferralStatus = useCallback(async () => {
    if (!paidRef.current) return;
    setReferralStatus("loading");
    try {
      const res = await fetch("/api/referrals/status", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            url?: string | null;
            visits?: number;
            conversions?: number;
            rewardsGranted?: number;
            lastConvertedAt?: number | null;
            topVisitSources?: Array<{ source?: unknown; visits?: unknown }>;
            topConversionSources?: Array<{ source?: unknown; conversions?: unknown }>;
            topRewardSkipReasons?: Array<{ value?: unknown; count?: unknown }>;
            topOfferVariants?: Array<{ value?: unknown; count?: unknown }>;
            rewardReversals?: number;
            conversionReversals?: number;
          }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error("status_failed");
      }
      setReferralLink(typeof data.url === "string" && data.url.trim() ? data.url.trim() : null);
      setReferralSummary({
        visits: typeof data.visits === "number" ? Math.max(0, data.visits) : 0,
        conversions: typeof data.conversions === "number" ? Math.max(0, data.conversions) : 0,
        rewardsGranted: typeof data.rewardsGranted === "number" ? Math.max(0, data.rewardsGranted) : 0,
        lastConvertedAt:
          typeof data.lastConvertedAt === "number" && Number.isFinite(data.lastConvertedAt)
            ? data.lastConvertedAt
            : null,
        topVisitSources: Array.isArray(data.topVisitSources)
          ? data.topVisitSources
              .map((entry) => ({
                source: typeof entry?.source === "string" ? entry.source.trim().toLowerCase() : "",
                visits:
                  typeof entry?.visits === "number" && Number.isFinite(entry.visits)
                    ? Math.max(0, Math.floor(entry.visits))
                    : 0,
              }))
              .filter((entry) => entry.source && entry.visits > 0)
              .slice(0, 3)
          : [],
        topConversionSources: Array.isArray(data.topConversionSources)
          ? data.topConversionSources
              .map((entry) => ({
                source: typeof entry?.source === "string" ? entry.source.trim().toLowerCase() : "",
                visits:
                  typeof entry?.conversions === "number" && Number.isFinite(entry.conversions)
                    ? Math.max(0, Math.floor(entry.conversions))
                    : 0,
              }))
              .filter((entry) => entry.source && entry.visits > 0)
              .slice(0, 3)
          : [],
        topRewardSkipReasons: Array.isArray(data.topRewardSkipReasons)
          ? data.topRewardSkipReasons
              .map((entry) => ({
                value: typeof entry?.value === "string" ? entry.value.trim().toLowerCase() : "",
                count:
                  typeof entry?.count === "number" && Number.isFinite(entry.count)
                    ? Math.max(0, Math.floor(entry.count))
                    : 0,
              }))
              .filter((entry) => entry.value && entry.count > 0)
              .slice(0, 3)
          : [],
        topOfferVariants: Array.isArray(data.topOfferVariants)
          ? data.topOfferVariants
              .map((entry) => ({
                value: typeof entry?.value === "string" ? entry.value.trim().toLowerCase() : "",
                count:
                  typeof entry?.count === "number" && Number.isFinite(entry.count)
                    ? Math.max(0, Math.floor(entry.count))
                    : 0,
              }))
              .filter((entry) => entry.value && entry.count > 0)
              .slice(0, 3)
          : [],
        rewardReversals:
          typeof data.rewardReversals === "number" && Number.isFinite(data.rewardReversals)
            ? Math.max(0, Math.floor(data.rewardReversals))
            : 0,
        conversionReversals:
          typeof data.conversionReversals === "number" && Number.isFinite(data.conversionReversals)
            ? Math.max(0, Math.floor(data.conversionReversals))
            : 0,
      });
      setReferralStatus("ready");
    } catch {
      setReferralStatus("error");
    }
  }, []);

  const createReferralLink = useCallback(async (source: "manual" | "auto") => {
    setReferralLoading(true);
    if (source === "manual") setReferralError(null);
    try {
      const res = await fetch("/api/referrals/link", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "referral_failed");
      }
      setReferralLink(data.url);
      track("referral_link_created", { source: "download", trigger: source });
      await loadReferralStatus();
    } catch {
      if (source === "manual") {
        setReferralError("Couldn't create referral link right now. Please try again.");
      }
    } finally {
      setReferralLoading(false);
    }
  }, [loadReferralStatus]);

  const handleCreateReferralLink = useCallback(async () => {
    if (referralLoading) return;
    await createReferralLink("manual");
  }, [createReferralLink, referralLoading]);

  const handleCopyReferralLink = useCallback(async () => {
    if (!referralLink) return;
    try {
      const shareUrl = buildReferralShareUrl({
        referralUrl: referralLink,
        platform: "copy",
        surface: "download",
      });
      await navigator.clipboard.writeText(shareUrl);
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
      track("referral_link_copied", { source: "download" });
    } catch {
      // ignore clipboard failures
    }
  }, [referralLink]);

  const handleCopyReferralPost = useCallback(async () => {
    if (!referralLink) return;
    try {
      const shareUrl = buildReferralShareUrl({
        referralUrl: referralLink,
        platform: "copy",
        surface: "download",
      });
      await navigator.clipboard.writeText(`${referralShareMessage} ${shareUrl}`);
      setReferralPostCopied(true);
      window.setTimeout(() => setReferralPostCopied(false), 2000);
      track("referral_post_template_copied", { source: "download" });
    } catch {
      // ignore clipboard failures
    }
  }, [referralLink]);

  const handleShareReferralLink = useCallback(
    async (platform: "x" | "facebook" | "pinterest" | "native") => {
      if (!referralLink) return;
      const shareUrlValue = buildReferralShareUrl({
        referralUrl: referralLink,
        platform,
        surface: "download",
      });
      if (platform === "native" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: "Create your custom star map",
            text: referralShareMessage,
            url: shareUrlValue,
          });
          track("referral_link_shared", { source: "download", platform: "native" });
          return;
        } catch {
          // Fall through to web share URLs.
        }
      }
      const encodedUrl = encodeURIComponent(shareUrlValue);
      const encodedText = encodeURIComponent(referralShareMessage);
      const shareUrl = (() => {
        if (platform === "x" || platform === "native") {
          return `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
        }
        if (platform === "pinterest") {
          return `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedText}`;
        }
        return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      })();
      window.open(shareUrl, "_blank", "noopener,noreferrer");
      track("referral_link_shared", { source: "download", platform });
    },
    [referralLink],
  );

  useEffect(() => {
    if (!paid) return;
    void loadReferralStatus();
  }, [loadReferralStatus, paid]);

  useEffect(() => {
    if (!paid || referralStatus !== "ready" || referralLink || referralLoading) return;
    void createReferralLink("auto");
  }, [createReferralLink, paid, referralLink, referralLoading, referralStatus]);

  const singleCreditExhausted =
    paid &&
    currentPlan === "single" &&
    typeof creditsRemaining === "number" &&
    creditsRemaining === 0 &&
    status !== "checking" &&
    status !== "not-paid" &&
    status !== "no-draft";

  const showTrustStrip =
    paid && status !== "not-paid" && status !== "no-draft" && status !== "checking";

  const canDownloadHd =
    paid &&
    !singleCreditExhausted &&
    status !== "downloading" &&
    !downloadInFlight &&
    status !== "no-draft" &&
    status !== "not-paid";

  const statusLabel = (() => {
    if (singleCreditExhausted && status !== "downloading" && status !== "error") {
      return "Download started";
    }
    switch (status) {
      case "checking":
        return "Checking access";
      case "downloading":
        return "Preparing download";
      case "no-draft":
        return "Map not found";
      case "not-paid":
        return "NOT VERIFIED";
      case "error":
        return "Download issue";
      default:
        return "Ready to download";
    }
  })();

  const heroTitle =
    status === "no-draft"
      ? "Create your map first"
      : status === "not-paid"
        ? "Confirm your access"
        : singleCreditExhausted
          ? "Download started"
          : "Your HD star map is ready";

  const heroDescription =
    status === "no-draft"
      ? "Your HD export credits are active, but this browser has no saved map yet. Open the editor to create or reload your map, then return here to export."
      : status === "not-paid"
        ? "We could not verify your access yet. Reopen your secure success link and return to this page."
        : singleCreditExhausted
          ? "Check your Downloads folder for starmap-*.png. Your HD credit has been used."
          : currentPlan === "pack3" && typeof creditsRemaining === "number"
            ? `Payment confirmed. You have ${creditsRemaining} HD export credit${creditsRemaining === 1 ? "" : "s"} left — this download uses 1 credit for the map below.`
            : currentPlan === "subscription"
              ? "Payment confirmed. Download your print-ready PNG — unlimited HD exports while your subscription is active."
              : "Payment confirmed. Download your print-ready PNG — no watermark, full resolution.";

  return (
    <EditorFontShell>
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
                  {heroTitle}
                </h1>
                <p className="max-w-2xl text-sm text-amber-100/90 sm:text-base">
                  {heroDescription}
                </p>
                {showTrustStrip && !singleCreditExhausted && (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-amber-100/85">
                    <li className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-amber-300" />
                      No watermark
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-amber-300" />
                      6000×6000 print-ready
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-amber-300" />
                      Credit used only after download starts
                    </li>
                  </ul>
                )}
                {!singleCreditExhausted && paid && currentPlan !== "subscription" && typeof creditsRemaining === "number" && (
                  <div className="text-xs text-amber-100/80">
                    {creditsRemaining} HD export credit{creditsRemaining === 1 ? "" : "s"} remaining.
                  </div>
                )}
                {!singleCreditExhausted && paid && currentPlan === "subscription" && (
                  <div className="text-xs text-amber-100/80">Unlimited HD exports active.</div>
                )}
                {!paid && status !== "not-paid" && status !== "no-draft" && (
                  <div className="text-xs text-amber-100/80">Payment verification pending.</div>
                )}
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                    singleCreditExhausted || status === "ready"
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
                {status === "ready" && currentPlan === "pack3" && !singleCreditExhausted && (
                  <div className="max-w-2xl rounded-xl border border-amber-200/35 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100/90">
                    Pack tip: each download uses <strong>one credit</strong> for the map shown below. Edit or create
                    another map in the editor to use your remaining credits.
                  </div>
                )}
              </div>

              <div className="grid w-full gap-3 md:max-w-[280px]">
                {status === "no-draft" ? (
                  <Link
                    href="/editor?mode=quick&source=download-create-first"
                    onClick={() => {
                      track("download_recovery_action", { action: "open_editor_create_map", source: "hero" });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-3 text-sm font-semibold text-[#201a0c] shadow-lg transition hover:-translate-y-[1px] hover:shadow-[0_12px_35px_rgba(215,181,108,0.45)] focus:outline-none focus:ring-2 focus:ring-[#d7b56c]/70 focus:ring-offset-2"
                  >
                    Open editor to create map
                  </Link>
                ) : status === "not-paid" ? (
                  <button
                    type="button"
                    onClick={handleRetryVerification}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-3 text-sm font-semibold text-[#201a0c] shadow-lg transition hover:-translate-y-[1px] hover:shadow-[0_12px_35px_rgba(215,181,108,0.45)] focus:outline-none focus:ring-2 focus:ring-[#d7b56c]/70 focus:ring-offset-2"
                  >
                    Retry verification
                  </button>
                ) : singleCreditExhausted ? (
                  <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-center text-xs text-emerald-100">
                    HD credit used. Your file should be in Downloads as <code className="text-emerald-50">starmap-*.png</code>.
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startDownload(undefined, "manual")}
                    disabled={!canDownloadHd}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-3 text-sm font-semibold text-[#201a0c] shadow-lg transition disabled:cursor-not-allowed disabled:opacity-70 hover:-translate-y-[1px] hover:shadow-[0_12px_35px_rgba(215,181,108,0.45)] focus:outline-none focus:ring-2 focus:ring-[#d7b56c]/70 focus:ring-offset-2"
                  >
                    {!paid
                      ? status === "checking"
                        ? "Checking access..."
                        : "Download locked"
                      : currentPlan === "pack3"
                        ? "Download HD file (uses 1 credit)"
                        : "Download HD file"}
                  </button>
                )}
                <Link
                  href="/editor"
                  onClick={() => {
                    track("download_recovery_action", { action: "open_editor_keep_editing", source: "hero" });
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2"
                >
                  Keep editing
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/15 bg-white/[0.07] p-5 shadow-xl shadow-black/30 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white sm:text-xl">Your star map</h2>
              <p className="mt-1 text-xs text-neutral-300">This preview matches your final HD file.</p>
            </div>
            <span className="rounded-full border border-emerald-300/50 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
              HD ready
            </span>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/12 bg-[#0b0f24]/95 shadow-inner">
            <div className="relative w-full" style={{ aspectRatio: previewAspect }}>
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="Star map preview"
                  fill
                  unoptimized
                  className="object-contain p-2"
                  sizes="(max-width: 1024px) 100vw, 768px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-xs text-neutral-300">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
                    <span>
                      {previewStatus === "error" ? "Preview unavailable" : "Rendering your preview..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-300">
            Adjust details in the editor before downloading if anything looks off.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-100">Your HD file</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "Print-ready quality",
                desc: "6000×6000 PNG for crisp framing and posters.",
              },
              {
                title: "No watermark",
                desc: "Clean, high-resolution file ready to gift.",
              },
              {
                title: "Instant filename",
                desc: "Saved as starmap-*.png in your Downloads folder.",
              },
            ].map((item) => (
              <li key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-xs text-neutral-300">{item.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {printCheckoutEnabled && paid && (status === "ready" || singleCreditExhausted) ? (
          <section
            id="print-addons"
            ref={printUpsellRef}
            className={`rounded-3xl border p-5 shadow-xl sm:p-6 ${
              upsellIntent
                ? "border-amber-200/60 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]"
                : "border-amber-200/35 bg-white/[0.06]"
            }`}
          >
            <h2 className="text-xl font-semibold text-white font-[var(--font-playfair)]">Want this as a gift?</h2>
            <p className="mt-2 max-w-2xl text-sm text-neutral-200">
              Turn your digital star map into a physical print — same design, delivered to your door.
              {printShippingDisclosure ? ` ${printShippingDisclosure}` : ""}
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {recommendedPrintOption ? (
                <div className="flex flex-col rounded-2xl border border-amber-200/50 bg-white/10 p-4">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                    <div className={recommendedPrintOption.sceneClass}>
                      <ResilientImage
                        src={recommendedPrintOption.imageSrc}
                        fallbackSrc={recommendedPrintOption.fallbackSrc}
                        alt={recommendedPrintOption.label}
                        fill
                        sizes="(max-width: 768px) 100vw, 400px"
                        className={recommendedPrintOption.imageClass}
                      />
                    </div>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">{recommendedPrintOption.label}</h3>
                  <p className="mt-1 text-xs text-neutral-300">
                    Wall-ready gift — we print and ship your exact map
                  </p>
                  <p className="mt-2 text-sm font-semibold text-amber-100">{recommendedPrintOption.priceLine}</p>
                  <button
                    type="button"
                    onClick={() => void handlePrintCheckout(recommendedPrintOption.variant)}
                    disabled={printCheckoutLoading}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-amber-100 bg-amber-300 px-4 py-2.5 text-sm font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Order framed print
                  </button>
                </div>
              ) : null}
              {unframedPrintOption ? (
                <div className="flex flex-col rounded-2xl border border-white/15 bg-white/5 p-4">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                    <div className={unframedPrintOption.sceneClass}>
                      <ResilientImage
                        src={unframedPrintOption.imageSrc}
                        fallbackSrc={unframedPrintOption.fallbackSrc}
                        alt={unframedPrintOption.label}
                        fill
                        sizes="(max-width: 768px) 100vw, 400px"
                        className={unframedPrintOption.imageClass}
                      />
                    </div>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">{unframedPrintOption.label}</h3>
                  <p className="mt-1 text-xs text-neutral-300">
                    Lower-cost option if you&apos;ll frame it yourself
                  </p>
                  <p className="mt-2 text-sm font-semibold text-amber-100">{unframedPrintOption.priceLine}</p>
                  <button
                    type="button"
                    onClick={() => void handlePrintCheckout(unframedPrintOption.variant)}
                    disabled={printCheckoutLoading}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Order unframed poster
                  </button>
                </div>
              ) : null}
            </div>
            {printShippingCountryOptions.length > 0 ? (
              <div className="mt-4 max-w-md rounded-xl border border-white/10 bg-white/5 p-3">
                <label htmlFor="print-shipping-country" className="text-[11px] font-semibold text-amber-100/80">
                  Shipping country
                </label>
                <select
                  id="print-shipping-country"
                  value={printShippingCountry}
                  onChange={(event) => {
                    const next = event.target.value;
                    setPrintShippingCountry(next);
                    storePrintShippingCountry(next);
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
                {posterShippingFootnote ? (
                  <p className="mt-2 text-[11px] text-neutral-300">
                    Estimated shipping to {shippingCountryLabel}: {posterShippingFootnote}
                  </p>
                ) : null}
              </div>
            ) : null}
            {morePrintOptions.length > 0 ? (
              <details className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-white/90">More print formats</summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {morePrintOptions.map((option) => (
                    <button
                      key={`btn-${option.variant}`}
                      type="button"
                      onClick={() => void handlePrintCheckout(option.variant)}
                      disabled={printCheckoutLoading}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-left text-xs transition hover:-translate-y-[1px] hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{option.label}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-300">{option.bestFor}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold text-amber-100">{option.priceLine}</span>
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
            <p className="mt-4 text-xs text-amber-100/75">Keep digital only — your HD file is already yours.</p>
            {printCheckoutError && <p className="mt-2 text-xs text-rose-200">{printCheckoutError}</p>}
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-100">Need help?</h2>
          <p className="mt-2 text-sm text-neutral-200">
            If the export fails before your file saves, your credit is <strong>not</strong> used. You can try again or
            restore your credit below.
          </p>
          {restoreCreditToken && status !== "downloading" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void restoreFailedDownloadCredit();
                }}
                disabled={restoreCreditStatus === "loading" || restoreCreditStatus === "done"}
                className="rounded-full border border-amber-200/50 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:border-amber-200/80 hover:bg-white/15 disabled:opacity-60"
              >
                {restoreCreditStatus === "loading"
                  ? "Restoring credit..."
                  : restoreCreditStatus === "done"
                    ? "Credit restored"
                    : "Download didn't start? Restore my credit"}
              </button>
              <span className="text-[10px] text-amber-100/70">
                Use only if the HD file is not in your Downloads folder.
              </span>
            </div>
          )}
          <div className="mt-4 space-y-2 text-sm text-neutral-200">
            {isIosDevice ? (
              <p>
                On iPhone, check <strong>Files → Browse → Downloads</strong> for{" "}
                <code className="text-amber-100">starmap-*.png</code>.
              </p>
            ) : isAndroidDevice ? (
              <p>
                On Android, check <strong>Files → Downloads</strong> or your browser download history for{" "}
                <code className="text-amber-100">starmap-*.png</code>.
              </p>
            ) : (
              <p>
                Your file usually saves to <strong>Downloads</strong> as{" "}
                <code className="text-amber-100">starmap-*.png</code>.
              </p>
            )}
            {!singleCreditExhausted && (
              <p className="text-xs text-amber-100/80">
                You can re-download from this page while credits remain.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/my-downloads"
              onClick={() => {
                track("download_recovery_action", { action: "open_my_downloads", source: "help_panel" });
              }}
              className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-amber-100 transition hover:border-white/40 hover:bg-white/15"
            >
              Open My Downloads
            </Link>
            <a
              href={`mailto:${supportEmail}`}
              className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-amber-100 transition hover:border-white/40 hover:bg-white/15"
            >
              Email {supportEmail}
            </a>
          </div>
          <form
            className="mt-4 flex max-w-lg flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSendRecoveryEmail();
            }}
          >
            <input
              type="email"
              value={recoveryEmail}
              onChange={(event) => {
                setRecoveryEmail(event.target.value);
                if (recoveryStatus !== "idle") {
                  setRecoveryStatus("idle");
                  setRecoveryMessage(null);
                }
              }}
              placeholder="Email recovery links to you@email.com"
              autoComplete="email"
              className="min-w-0 flex-1 rounded-full border border-white/20 bg-white px-3 py-2 text-xs text-midnight placeholder:text-neutral-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/50"
            />
            <button
              type="submit"
              disabled={recoveryStatus === "sending"}
              className="rounded-full border border-amber-200 bg-amber-400/20 px-3 py-2 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recoveryStatus === "sending" ? "Sending..." : "Send recovery links"}
            </button>
          </form>
          {recoveryMessage && (
            <p className={`mt-2 text-[11px] ${recoveryStatus === "sent" ? "text-emerald-200" : "text-rose-200"}`}>
              {recoveryMessage}
            </p>
          )}
        </section>

        {paid ? (
          <details className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <summary className="cursor-pointer text-sm font-semibold text-white">More options</summary>
            <div className="mt-4 space-y-4">
              <div id="access-link-panel" className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="text-sm font-semibold text-white">Use this on another device</h4>
                <p className="mt-1 text-xs text-neutral-200">
                  Copy a private access link to restore your download on any device.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAccessLink}
                    disabled={!accessLink || accessLinkStatus === "loading"}
                    className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-400/20 px-4 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {accessLinkStatus === "loading"
                      ? "Generating..."
                      : accessLinkCopied
                        ? "Link copied"
                        : "Copy access link"}
                  </button>
                  {accessLink && accessLinkStatus === "ready" && (
                    <button
                      type="button"
                      onClick={() => void handleSendAccessEmail()}
                      disabled={accessEmailStatus === "sending"}
                      className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-amber-100/80 transition hover:border-white/40 hover:text-amber-100"
                    >
                      {accessEmailStatus === "sending" ? "Sending..." : "Email me link"}
                    </button>
                  )}
                  {accessLink && accessLinkStatus === "ready" && (
                    <button
                      type="button"
                      onClick={handleOpenAccessLink}
                      className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-amber-100/80 transition hover:border-white/40 hover:text-amber-100"
                    >
                      Open link
                    </button>
                  )}
                  {accessLink && accessLinkStatus === "ready" && (
                    <button
                      type="button"
                      onClick={() => {
                        track("download_recovery_action", { action: "new_access_link", source: "access_panel" });
                        void createAccessLink(true);
                      }}
                      className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-amber-100/80 transition hover:border-white/40 hover:text-amber-100"
                    >
                      New link
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-amber-100/70">
                  Keep this link private — anyone with it can access your downloads.
                </p>
                {accessLink && accessLinkStatus === "ready" && (
                  <p className="mt-1 break-all text-[11px] text-amber-100/85">{accessLink}</p>
                )}
                {accessLinkStatus === "error" && (
                  <p className="mt-2 text-xs text-rose-200">We couldn&apos;t generate a link yet. Please refresh and try again.</p>
                )}
                {accessEmailMessage && (
                  <p className={`mt-2 text-xs ${accessEmailStatus === "sent" ? "text-emerald-200" : "text-rose-200"}`}>
                    {accessEmailMessage}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-amber-300/40 bg-amber-400/10 p-4">
                <p className="text-sm font-semibold text-amber-100">Share & earn {referralRewardCreditsLabel}</p>
                <p className="mt-2 text-xs text-amber-50/90">
                  Send your link to friends planning a wedding or anniversary gift. They get {referralFriendOfferLabel}; you
                  earn {referralRewardCreditsLabel} on each paid checkout.
                </p>
                <p className="mt-2 text-[11px] text-amber-100/70">
                  Referral credits earned so far: {referralSummary.rewardsGranted}.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateReferralLink()}
                    disabled={referralLoading}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {referralLoading ? "Generating..." : referralLink ? "Refresh referral link" : "Create referral link"}
                  </button>
                  {referralLink ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleCopyReferralLink()}
                        className="rounded-full border border-amber-200 bg-amber-400/20 px-3 py-2 text-[11px] font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-400/30"
                      >
                        {referralCopied ? "Copied" : "Copy social link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyReferralPost()}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15"
                      >
                        {referralPostCopied ? "Post text copied" : "Copy post text"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleShareReferralLink("native")}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15"
                      >
                        Share link
                      </button>
                    </>
                  ) : null}
                </div>
                {referralLink ? <p className="mt-2 break-all text-[11px] text-amber-100/80">{referralLink}</p> : null}
                {referralStatus === "loading" && (
                  <p className="mt-2 text-[11px] text-amber-100/70">Loading referral stats...</p>
                )}
                {referralStatus === "error" && (
                  <p className="mt-2 text-xs text-rose-200">Couldn&apos;t load referral stats. You can still create a link.</p>
                )}
                {referralError && <p className="mt-2 text-xs text-rose-200">{referralError}</p>}
              </div>

              {merchDownloadEditorHref && status === "ready" ? (
                <div className="rounded-2xl border border-violet-200/35 bg-violet-950/35 p-4">
                  <h4 className="text-sm font-semibold text-white">Stickers &amp; apparel</h4>
                  <p className="mt-1 text-xs text-neutral-200">
                    Ship the same constellation art on stickers, magnets, pins, or DTG shirts.
                  </p>
                  <Link
                    href={merchDownloadEditorHref}
                    prefetch={false}
                    onClick={() => track("download_merch_teaser_clicked", { destination: "editor" })}
                    className="mt-3 inline-flex rounded-full bg-violet-400 px-4 py-2 text-xs font-semibold text-midnight shadow transition hover:-translate-y-[1px] hover:bg-violet-300"
                  >
                    Customize merch
                  </Link>
                </div>
              ) : null}

              <PostPurchaseProofRequest source="download" orderType="digital" plan={currentPlan} />

              {currentPlan === "subscription" && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h4 className="text-sm font-semibold text-white">Manage subscription</h4>
                  <p className="mt-1 text-xs text-neutral-200">
                    Update payment details or cancel anytime in Stripe billing settings.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleManageBilling()}
                    disabled={portalLoading}
                    className="mt-3 inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {portalLoading ? "Opening billing..." : "Manage subscription"}
                  </button>
                  {portalError && <p className="mt-2 text-xs text-rose-200">{portalError}</p>}
                </div>
              )}

              <Link
                href="/"
                onClick={() => {
                  track("download_recovery_action", { action: "back_home", source: "more_options" });
                }}
                className="inline-flex text-xs font-semibold text-amber-200/80 transition hover:text-amber-100"
              >
                Back to homepage
              </Link>
            </div>
          </details>
        ) : null}
      </div>
      </main>
    </EditorFontShell>
  );
}
