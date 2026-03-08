"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aspectRatioToNumber, buildRecipeFromState, renderStarMap, type MapRecipe } from "@/lib/renderSky";
import { FONT_STACKS } from "@/lib/fonts";
import { getShapeData } from "@/lib/shapeUtils";
import type { Shape } from "@/lib/types";
import { track, trackBeginCheckout, trackFunnelStep } from "@/lib/analytics";
import {
  formatPrice,
  getPrintPricingTiers,
  type CheckoutPlan,
  type PrintVariant,
} from "@/lib/pricing";
import EditorFontShell from "@/components/EditorFontShell";

const DRAFT_KEY = "star-map-draft";
const LEGACY_SIMPLIFIED_DRAFT_KEY = "starmap-simplified-draft";
const AUTO_EXPORT_KEY = "star-map-auto-export";
const CHECKOUT_MAP_KEY = "star-map-checkout-id";
const LEGACY_CHECKOUT_MAP_KEY = "checkout-map-id";

type Status = "checking" | "ready" | "downloading" | "error" | "no-draft" | "not-paid";
type PreviewStatus = "idle" | "rendering" | "ready" | "error";
type ReferralStatus = "idle" | "loading" | "ready" | "error";
type ReferralSummary = {
  visits: number;
  conversions: number;
  rewardsGranted: number;
  lastConvertedAt: number | null;
};

const PREVIEW_BASE_WIDTH = 1200;
const PREVIEW_MAX_DIM = 2200;
const PREVIEW_MAX_DPR = 2;
const MAX_PRINT_ASSET_BYTES = 16 * 1024 * 1024;
const printCheckoutEnabled = /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim());
const DEFAULT_REFERRAL_SUMMARY: ReferralSummary = {
  visits: 0,
  conversions: 0,
  rewardsGranted: 0,
  lastConvertedAt: null,
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
  const mapIdFromUrl = searchParams.get("map_id")?.trim() || null;
  const tokenFromUrl = searchParams.get("token")?.trim() || null;
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [accessLinkStatus, setAccessLinkStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const accessLinkStatusRef = useRef<"idle" | "loading" | "ready" | "error">("idle");
  const accessLinkInitRef = useRef(false);
  const initCompletedRef = useRef(false);
  const [accessLinkCopied, setAccessLinkCopied] = useState(false);
  const consumePromiseRef = useRef<
    Promise<false | { creditsRemaining?: number | null; plan?: CheckoutPlan | null }> | null
  >(null);
  const [downloadInFlight, setDownloadInFlight] = useState(false);
  const downloadInFlightRef = useRef(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [printCheckoutLoading, setPrintCheckoutLoading] = useState(false);
  const [printCheckoutError, setPrintCheckoutError] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus>("idle");
  const [referralSummary, setReferralSummary] = useState<ReferralSummary>(DEFAULT_REFERRAL_SUMMARY);

  const printPriceLabels = useMemo(() => {
    const printTiers = getPrintPricingTiers();
    return {
      unframed: formatPrice(printTiers.poster_unframed.amountCents, printTiers.poster_unframed.currency),
      framed: formatPrice(printTiers.poster_framed.amountCents, printTiers.poster_framed.currency),
    };
  }, []);

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

  const consumeHdCredit = useCallback(async () => {
    if (consumePromiseRef.current) return consumePromiseRef.current;
    const promise = (async () => {
      try {
        const token =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const res = await fetch("/api/entitlements/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { creditsRemaining?: number | null; plan?: CheckoutPlan | null };
        if (typeof data.creditsRemaining === "number") {
          setCreditsRemaining(data.creditsRemaining);
          // Don't set paid=false when credits depleted - user still paid, just used all credits
          // The subsequent refreshPaidStatus call will set the correct state
        } else if (data.plan === "subscription") {
          setCreditsRemaining(null);
          setPaidState(true);
        }
        return data;
      } catch {
        return false;
      } finally {
        consumePromiseRef.current = null;
      }
    })();
    consumePromiseRef.current = promise;
    return promise;
  }, [setPaidState]);

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

        const consumed = await consumeHdCredit();
        if (!consumed) {
          setStatus("not-paid");
          setMessage("You have no HD downloads remaining. Choose a new pack or subscription to continue.");
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
        const remaining =
          typeof consumed.creditsRemaining === "number" ? consumed.creditsRemaining : null;
        if (consumed.plan === "subscription") {
          setMessage("Download started. Unlimited HD downloads active.");
        } else if (remaining === 0) {
          setMessage("Download started. That was your last HD download.");
        } else if (typeof remaining === "number") {
          setMessage(`Download started. ${remaining} HD download${remaining === 1 ? "" : "s"} remaining.`);
        } else {
          setMessage("Download started. Check your downloads folder.");
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
        setMessage("We couldn't start the download. Please try again.");
        if (!previewGeneratedRef.current) {
          setPreviewStatus("error");
        }
      } finally {
        downloadInFlightRef.current = false;
        setDownloadInFlight(false);
      }
    },
    [consumeHdCredit, currentPlan, recipe, refreshPaidStatus, resolveShapeAndRatio, setPreviewFromCanvas],
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

  useEffect(() => {
    initCompletedRef.current = false;
    let active = true;
    const init = async () => {
      // Prevent re-running init if it already completed successfully
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
      if (!active) return;
      if (!paidResult.paid) {
        setStatus("not-paid");
        setMessage(
          tokenInvalid
            ? "This access link has expired or was replaced. Open your original device to generate a new link."
            : typeof paidResult.creditsRemaining === "number"
            ? "You have no HD downloads remaining. Choose a new pack or subscription to continue."
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
    claimAccessToken,
    createAccessLink,
    fetchMapRecipe,
    mapIdFromUrl,
    refreshPaidStatus,
    startDownload,
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

  const handleCopyAccessLink = useCallback(async () => {
    if (!accessLink) return;
    try {
      await navigator.clipboard.writeText(accessLink);
      setAccessLinkCopied(true);
      window.setTimeout(() => setAccessLinkCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  }, [accessLink]);

  const handleEmailAccessLink = useCallback(() => {
    if (!accessLink) return;
    const subject = encodeURIComponent("Your StarMapCo access link");
    const body = encodeURIComponent(
      `Here’s your private access link:\\n\\n${accessLink}\\n\\nUse this link on any device to restore your downloads.`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [accessLink]);

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

  const handlePrintCheckout = useCallback(
    async (variant: PrintVariant) => {
      if (printCheckoutLoading) return;
      if (!printCheckoutEnabled) {
        setPrintCheckoutError("Print checkout is not live yet.");
        return;
      }
      setPrintCheckoutLoading(true);
      setPrintCheckoutError(null);
      try {
        const mapId = mapIdFromUrl || readStoredMapId();
        const activeRecipe = recipe ?? readDraft();
        if (!activeRecipe) {
          throw new Error("missing_recipe");
        }
        await ensureFontsLoaded(activeRecipe);
        const { shape, ratio } = await resolveShapeAndRatio(activeRecipe);
        let uploadedAssetId: string | null = null;
        let lastAssetError: string | null = null;
        const exportWidths = [6000, 5200];
        const uploadQualities = [0.9, 0.8, 0.7, 0.6, 0.5];
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
          }),
        });
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
          throw new Error(data?.error ?? "checkout_failed");
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
        const messageByReason =
          reason === "missing_recipe"
            ? "We couldn't find your saved map. Open the editor once, then try print checkout again."
            : reason === "asset_upload_failed"
              ? "We couldn't prepare your print file. Please try again."
              : reason === "print_asset_too_large"
                ? "This map export is too large for print checkout right now. Try a simpler style or contact support."
              : reason === "missing_print_asset"
                ? "Could not attach your print file. Please retry print checkout."
                : reason === "print_checkout_disabled"
                  ? "Print checkout is not live yet."
                  : "Print checkout is unavailable right now. Please try again.";
        setPrintCheckoutError(messageByReason);
        setPrintCheckoutLoading(false);
      }
    },
    [mapIdFromUrl, printCheckoutLoading, recipe, resolveShapeAndRatio],
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
      await navigator.clipboard.writeText(referralLink);
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
      track("referral_link_copied", { source: "download" });
    } catch {
      // ignore clipboard failures
    }
  }, [referralLink]);

  const handleShareReferralLink = useCallback(
    async (platform: "x" | "facebook" | "pinterest" | "native") => {
      if (!referralLink) return;
      if (platform === "native" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: "Create your custom star map",
            text: "Create your custom star map with StarMapCo. Free preview, HD download in seconds.",
            url: referralLink,
          });
          track("referral_link_shared", { source: "download", platform: "native" });
          return;
        } catch {
          // Fall through to web share URLs.
        }
      }
      const encodedUrl = encodeURIComponent(referralLink);
      const encodedText = encodeURIComponent(
        "Create your custom star map with StarMapCo. Free preview, HD download in seconds.",
      );
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

  const statusLabel = (() => {
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
        return "Download ready";
    }
  })();

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
                  Your download is ready
                </h1>
                <p className="max-w-2xl text-sm text-amber-100/90 sm:text-base">
                  Your access is unlocked. Download the HD print file now, or jump back into the editor to tweak details.
                </p>
                <div className="text-xs text-amber-100/80">
                  {paid
                    ? currentPlan === "subscription"
                      ? "Unlimited HD downloads active."
                      : typeof creditsRemaining === "number"
                        ? `${creditsRemaining} HD download${creditsRemaining === 1 ? "" : "s"} remaining.`
                        : "HD download access is active."
                    : "Payment verification pending."}
                </div>
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
                  disabled={status === "downloading" || downloadInFlight || !paid}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2.5 text-sm font-semibold text-[#201a0c] shadow-lg transition disabled:cursor-not-allowed disabled:opacity-70 hover:-translate-y-[1px] hover:shadow-[0_12px_35px_rgba(215,181,108,0.45)] focus:outline-none focus:ring-2 focus:ring-[#d7b56c]/70 focus:ring-offset-2"
                >
                  {paid ? "Download HD file" : status === "checking" ? "Checking access..." : "Download locked"}
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
                  <Image
                    src={previewUrl}
                    alt="Star map preview"
                    fill
                    unoptimized
                    className="object-contain"
                    sizes="(max-width: 1024px) 100vw, 55vw"
                  />
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

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Download details</h3>
              <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                Instant access
              </span>
            </div>
            <div className="mt-4 divide-y divide-white/10">
              {[
                {
                  title: "Print-ready quality",
                  desc: "6000×6000px PNG sized for crisp framing and posters.",
                },
                {
                  title: "No watermark",
                  desc: "Your premium file is clean, high-resolution, and ready to gift.",
                },
                currentPlan === "subscription"
                  ? {
                      title: "Unlimited access",
                      desc: "Your subscription lets you export unlimited HD files while active.",
                    }
                  : {
                      title: "Download credits",
                      desc:
                        typeof creditsRemaining === "number"
                          ? `${creditsRemaining} HD download${creditsRemaining === 1 ? "" : "s"} remaining on this pack.`
                          : "Use a 3-pack or subscription for multiple downloads.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-amber-300 shadow-[0_0_12px_rgba(215,181,108,0.6)]" />
                  <div>
                    <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                    <p className="mt-1 text-xs text-neutral-200">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            {printCheckoutEnabled ? (
              <div className="mt-4 rounded-2xl border border-amber-200/35 bg-amber-400/10 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-white">Want a physical print shipped to you?</h4>
                  <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                    Print add-on
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-200">
                  Start print checkout with your current map already attached.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handlePrintCheckout("poster_framed")}
                    disabled={printCheckoutLoading}
                    className="rounded-full border border-amber-200/60 bg-amber-400/20 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:border-amber-200 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Framed print (recommended) • {printPriceLabels.framed}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePrintCheckout("poster_unframed")}
                    disabled={printCheckoutLoading}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Unframed • {printPriceLabels.unframed}
                  </button>
                </div>
                {printCheckoutError && <p className="mt-2 text-xs text-rose-200">{printCheckoutError}</p>}
              </div>
            ) : null}
            {paid ? (
              <div className="mt-4 rounded-2xl border border-white/12 bg-white/6 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-white">Share and earn bonus HD credits</h4>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                    Referral
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-200">
                  Share your referral link. Each paid checkout through your link adds 1 bonus HD credit.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-amber-100/70">Visits</p>
                    <p className="mt-1 text-sm font-semibold text-white">{referralSummary.visits}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-amber-100/70">Conversions</p>
                    <p className="mt-1 text-sm font-semibold text-white">{referralSummary.conversions}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-amber-100/70">Bonus credits</p>
                    <p className="mt-1 text-sm font-semibold text-white">{referralSummary.rewardsGranted}</p>
                  </div>
                </div>
                {referralSummary.lastConvertedAt ? (
                  <p className="mt-2 text-[11px] text-amber-100/70">
                    Last reward: {new Date(referralSummary.lastConvertedAt).toLocaleDateString()}
                  </p>
                ) : null}
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
                        {referralCopied ? "Copied" : "Copy link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleShareReferralLink("native")}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15"
                      >
                        Share link
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareReferralLink("x")}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15"
                      >
                        Share on X
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareReferralLink("facebook")}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15"
                      >
                        Share on Facebook
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareReferralLink("pinterest")}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15"
                      >
                        Share on Pinterest
                      </button>
                    </>
                  ) : null}
                </div>
                {referralLink ? (
                  <p className="mt-2 break-all text-[11px] text-amber-100/80">{referralLink}</p>
                ) : (
                  <p className="mt-2 text-[11px] text-amber-100/70">
                    Create your referral link once and use it everywhere.
                  </p>
                )}
                {referralStatus === "loading" && (
                  <p className="mt-2 text-[11px] text-amber-100/70">Loading referral stats...</p>
                )}
                {referralStatus === "error" && (
                  <p className="mt-2 text-xs text-rose-200">Couldn't load referral stats. You can still create a link.</p>
                )}
                {referralError && <p className="mt-2 text-xs text-rose-200">{referralError}</p>}
              </div>
            ) : null}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-white">Use this on another device</h4>
                  <p className="mt-1 text-xs text-neutral-200">
                    Copy a private access link to restore your download on any device.
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                      onClick={handleEmailAccessLink}
                      className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-amber-100/80 transition hover:border-white/40 hover:text-amber-100"
                    >
                      Email link
                    </button>
                  )}
                  {accessLink && accessLinkStatus === "ready" && (
                    <button
                      type="button"
                      onClick={() => void createAccessLink(true)}
                      className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-amber-100/80 transition hover:border-white/40 hover:text-amber-100"
                    >
                      New link
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-amber-100/70">
                Keep this link private — anyone with it can access your downloads.
              </p>
              {accessLinkStatus === "error" && (
                <p className="mt-2 text-xs text-rose-200">We couldn't generate a link yet. Please refresh and try again.</p>
              )}
            </div>
            {currentPlan === "subscription" && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
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
          </div>
        </section>
      </div>
      </main>
    </EditorFontShell>
  );
}
