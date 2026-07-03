"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  createCheckoutHandoffToken,
  track,
  trackBeginCheckout,
  trackCheckoutClientDiagnostic,
  trackFunnelStep,
  trackPurchaseCompleted,
  trackSelectItem,
  trackViewItemList,
} from "@/lib/analytics";
import {
  formatPrice,
  getPricingTiers,
  getPrintPricingTiers,
  type CheckoutOrderType,
  type CheckoutPlan,
  type PrintVariant,
} from "@/lib/pricing";
import { getPrintFulfillmentProgressSteps, getPrintOrderIncludesDigitalNote } from "@/lib/commerceFacts";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import {
  buildReferralShareUrl,
  getReferralFriendOfferLabel,
  getReferralShareMessage,
} from "@/lib/referralShare";
import ResilientImage from "@/components/ResilientImage";
import PostPurchaseProofRequest from "@/components/PostPurchaseProofRequest";
import { PAYWALL_PRINT_VARIANT_ORDER, isPrintVariant } from "@/lib/printCatalog";
import { listDownloadPrintUpsellCards } from "@/lib/downloadPrintUpsellCatalog";
import { getDefaultMerchEditorHref } from "@/lib/merchCatalog";
import { buildDownloadPath } from "@/lib/stripeCheckoutNavigation";

const CHECKOUT_MAP_KEY = "star-map-checkout-id";
type ReferralStatus = "idle" | "loading" | "ready" | "error";
type ReferralSourceSummary = {
  source: string;
  visits: number;
};
type ReferralSummary = {
  visits: number;
  conversions: number;
  rewardsGranted: number;
  lastConvertedAt: number | null;
  topVisitSources: ReferralSourceSummary[];
  topConversionSources: ReferralSourceSummary[];
};

const DEFAULT_REFERRAL_SUMMARY: ReferralSummary = {
  visits: 0,
  conversions: 0,
  rewardsGranted: 0,
  lastConvertedAt: null,
  topVisitSources: [],
  topConversionSources: [],
};
const printCheckoutEnabled = /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim());
const printShippingDisclosure = getPrintShippingDisclosure();
const merchSuccessEditorHref = getDefaultMerchEditorHref("success-merch-teaser");
const referralFriendOfferLabel = getReferralFriendOfferLabel();
const referralShareMessage = getReferralShareMessage();
const referralRewardCredits = (() => {
  const raw = process.env.NEXT_PUBLIC_REFERRAL_REWARD_CREDITS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
})();
const referralRewardCreditsLabel = `${referralRewardCredits} HD credit${referralRewardCredits === 1 ? "" : "s"}`;
const supportEmail = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@starmapco.com").trim() || "support@starmapco.com";

type PrintOrderSummary = {
  kvStatus: "pending" | "sent" | "failed" | null;
  printfulOrderId: string | number | null;
  confirmationEmailSent: boolean;
  shippingNotificationSent: boolean;
};

const printFulfillmentSteps = getPrintFulfillmentProgressSteps();
const printOrderIncludesDigitalNote = getPrintOrderIncludesDigitalNote();

function readStoredMapId() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHECKOUT_MAP_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export default function SuccessClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setPaid = useStore((s) => s.setPaid);
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState<string | null>(null);
  const [resolvedMapId, setResolvedMapId] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<CheckoutPlan | null>(null);
  const [orderType, setOrderType] = useState<CheckoutOrderType>("digital");
  const [printVariant, setPrintVariant] = useState<PrintVariant | null>(null);
  const [accessLink, setAccessLink] = useState<string | null>(null);
  const [accessLinkStatus, setAccessLinkStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [accessLinkCopied, setAccessLinkCopied] = useState(false);
  const [accessEmailStatus, setAccessEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [accessEmailMessage, setAccessEmailMessage] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [digitalAddOnLoading, setDigitalAddOnLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [verificationRunId, setVerificationRunId] = useState(0);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus>("idle");
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralPostCopied, setReferralPostCopied] = useState(false);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary>(DEFAULT_REFERRAL_SUMMARY);
  const [printSummary, setPrintSummary] = useState<PrintOrderSummary | null>(null);
  const [printLinkCopied, setPrintLinkCopied] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRedirectRef = useRef(true);
  const printUpsellTrackedRef = useRef(false);
  const accessPanelTrackedRef = useRef(false);
  const digitalPriceLabel = formatPrice(getPricingTiers().single.amountCents, getPricingTiers().single.currency);
  const printTiers = useMemo(() => getPrintPricingTiers(), []);
  const successPrintUpsellCards = useMemo(() => {
    return listDownloadPrintUpsellCards().map((card) => ({
      ...card,
      label: printTiers[card.variant].label,
      priceLine: `${formatPrice(printTiers[card.variant].amountCents, printTiers[card.variant].currency)} + shipping shown at checkout`,
    }));
  }, [printTiers]);
  const successPrintRecommendedCard = useMemo(
    () => successPrintUpsellCards.find((card) => card.variant === "poster_framed") ?? successPrintUpsellCards[0] ?? null,
    [successPrintUpsellCards],
  );
  const successPrintSecondaryCards = useMemo(
    () =>
      successPrintRecommendedCard
        ? successPrintUpsellCards.filter((card) => card.variant !== successPrintRecommendedCard.variant)
        : successPrintUpsellCards,
    [successPrintRecommendedCard, successPrintUpsellCards],
  );

  const pauseRedirect = useCallback(() => {
    autoRedirectRef.current = false;
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  }, []);

  const createAccessLink = useCallback(async (force = false) => {
    if (accessLinkStatus === "loading") return;
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
        setAccessLinkStatus("ready");
        return;
      }
      throw new Error("missing url");
    } catch {
      setAccessLinkStatus("error");
    }
  }, [accessLinkStatus]);

  const handleCopyAccessLink = useCallback(async () => {
    if (!accessLink) return;
    pauseRedirect();
    try {
      await navigator.clipboard.writeText(accessLink);
      setAccessLinkCopied(true);
      window.setTimeout(() => setAccessLinkCopied(false), 2000);
      track("success_recovery_action", { action: "copy_access_link" });
    } catch {
      // ignore clipboard errors
    }
  }, [accessLink, pauseRedirect]);

  const handleSendAccessEmail = useCallback(async () => {
    pauseRedirect();
    setAccessEmailStatus("sending");
    setAccessEmailMessage(null);
    try {
      const res = await fetch("/api/account/access-email", { method: "POST" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string; supportEmail?: string } | null;
        if (res.status === 401 || res.status === 403) {
          setAccessEmailStatus("error");
          setAccessEmailMessage("Sign in again from your success link, then retry email delivery.");
          track("access_link_email_requested", { source: "success", outcome: "unauthorized" });
          return;
        }
        if (payload?.error === "missing_customer_email") {
          const contact = payload.supportEmail || supportEmail;
          setAccessEmailStatus("error");
          setAccessEmailMessage(`We couldn't find a checkout email on this order. Contact ${contact} for help.`);
          track("access_link_email_requested", { source: "success", outcome: "missing_email" });
          return;
        }
        if (payload?.error === "account_access_email_not_configured") {
          const contact = payload.supportEmail || supportEmail;
          setAccessEmailStatus("error");
          setAccessEmailMessage(`Email delivery is unavailable right now. Contact ${contact}.`);
          track("access_link_email_requested", { source: "success", outcome: "not_configured" });
          return;
        }
        throw new Error(payload?.error ?? "request_failed");
      }
      setAccessEmailStatus("sent");
      setAccessEmailMessage("Sent. Check your email to open all downloads in My Downloads.");
      track("access_link_email_requested", { source: "success", outcome: "sent" });
    } catch {
      setAccessEmailStatus("error");
      setAccessEmailMessage(`Couldn't send the email yet. Please retry or contact ${supportEmail}.`);
      track("access_link_email_requested", { source: "success", outcome: "error" });
    }
  }, [pauseRedirect]);

  const handleManageBilling = useCallback(async () => {
    if (portalLoading) return;
    pauseRedirect();
    setPortalLoading(true);
    setPortalError(null);
    track("billing_portal_opened", { source: "success" });
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
      });
      if (!res.ok) throw new Error("portal_failed");
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error("missing_url");
      window.location.assign(data.url);
    } catch {
      setPortalError("We couldn't open billing settings. Please try again in a moment.");
      setPortalLoading(false);
    }
  }, [pauseRedirect, portalLoading]);

  const handleAddDigitalDownload = useCallback(async () => {
    if (digitalAddOnLoading) return;
    pauseRedirect();
    setDigitalAddOnLoading(true);
    setMessage(null);
    let checkoutApiResponseReceived = false;
    try {
      track("success_recovery_action", { action: "add_digital_download_clicked" });
      trackFunnelStep("checkout_started", {
        source: "success",
        plan: "single",
      });
      const checkoutMapId = resolvedMapId ?? readStoredMapId();
      if (!checkoutMapId) {
        throw new Error("map_required");
      }
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "single",
          orderType: "digital",
          mapId: checkoutMapId,
          checkoutHandoff: createCheckoutHandoffToken(),
        }),
      });
      checkoutApiResponseReceived = true;
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        const code = (data as { code?: string } | null)?.code;
        if (code === "map_required") throw new Error("map_required");
        if (code === "map_not_found") throw new Error("map_not_found");
        throw new Error(code ?? data?.error ?? "checkout_failed");
      }
      track("digital_addon_started", {
        source: "success",
        orderType,
        printVariant,
      });
      trackBeginCheckout({
        source: "success",
        plan: "single",
        orderType: "digital",
      });
      window.location.assign(data.url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "checkout_failed";
      if (!checkoutApiResponseReceived) {
        trackCheckoutClientDiagnostic({
          reason,
          source: "success",
          plan: "single",
          orderType: "digital",
        });
      }
      if (reason === "map_required") {
        setMessage("Open the editor, generate your map preview, then retry digital checkout.");
      } else if (reason === "map_not_found") {
        setMessage("We couldn't find that map anymore. Open the editor and regenerate preview, then retry.");
      } else {
        setMessage("We couldn't start digital add-on checkout. Please try again.");
      }
      setDigitalAddOnLoading(false);
    }
  }, [digitalAddOnLoading, orderType, pauseRedirect, printVariant, resolvedMapId]);

  const handleOpenPrintUpsell = useCallback(
    (variant: PrintVariant) => {
      pauseRedirect();
      track("digital_to_print_upsell_clicked", {
        source: "success",
        variant,
        hasMapId: Boolean(resolvedMapId),
      });
      trackSelectItem({
        itemListId: "success_print_upsell",
        itemListName: "Success print upsell",
        item: {
          plan: "single",
          orderType: "print",
          printVariant: variant,
          index: PAYWALL_PRINT_VARIANT_ORDER.indexOf(variant),
        },
      });
      const params = new URLSearchParams();
      if (resolvedMapId) params.set("map_id", resolvedMapId);
      params.set("upsell", variant);
      router.replace(`/download?${params.toString()}#print-addons`);
    },
    [pauseRedirect, resolvedMapId, router],
  );

  const loadReferralStatus = useCallback(async () => {
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
      track("referral_link_created", { source: "success", trigger: source });
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
    pauseRedirect();
    await createReferralLink("manual");
  }, [createReferralLink, pauseRedirect, referralLoading]);

  const handleCopyReferralLink = useCallback(async () => {
    if (!referralLink) return;
    pauseRedirect();
    try {
      const shareUrl = buildReferralShareUrl({
        referralUrl: referralLink,
        platform: "copy",
        surface: "success",
      });
      await navigator.clipboard.writeText(shareUrl);
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
      track("referral_link_copied", { source: "success" });
    } catch {
      // ignore clipboard failures
    }
  }, [pauseRedirect, referralLink]);

  const handleCopyReferralPost = useCallback(async () => {
    if (!referralLink) return;
    pauseRedirect();
    try {
      const shareUrl = buildReferralShareUrl({
        referralUrl: referralLink,
        platform: "copy",
        surface: "success",
      });
      await navigator.clipboard.writeText(`${referralShareMessage} ${shareUrl}`);
      setReferralPostCopied(true);
      window.setTimeout(() => setReferralPostCopied(false), 2000);
      track("referral_post_template_copied", { source: "success" });
    } catch {
      // ignore clipboard failures
    }
  }, [pauseRedirect, referralLink]);

  const handleShareReferralLink = useCallback(
    async (platform: "x" | "facebook" | "pinterest" | "native") => {
      if (!referralLink) return;
      pauseRedirect();
      const shareUrlValue = buildReferralShareUrl({
        referralUrl: referralLink,
        platform,
        surface: "success",
      });
      if (platform === "native" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: "Create your custom star map",
            text: referralShareMessage,
            url: shareUrlValue,
          });
          track("referral_link_shared", { source: "success", platform: "native" });
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
      track("referral_link_shared", { source: "success", platform });
    },
    [pauseRedirect, referralLink],
  );

  useEffect(() => {
    let active = true;
    redirectTimerRef.current = null;
    const sessionId = searchParams.get("session_id");
    const mapIdParam = searchParams.get("map_id")?.trim() || null;
    if (!sessionId) {
      setStatus("error");
      setMessage("Missing payment session. Please contact support.");
      return;
    }

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const attempts = 12;
    const delayForAttempt = (attempt: number) => Math.min(1500 + attempt * 500, 4500);
    const parseRetryAfterMs = (value: string | null) => {
      if (!value) return null;
      const seconds = Number.parseInt(value, 10);
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      return seconds * 1000;
    };

    const verify = async () => {
      setStatus("verifying");
      setMessage(null);
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (!active) return;
        try {
          const res = await fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`, {
            cache: "no-store",
          });
          if (res.status === 429) {
            const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
            await wait(Math.min(15_000, Math.max(1_000, retryAfterMs ?? delayForAttempt(attempt))));
            continue;
          }

          const data = (await res.json().catch(() => null)) as {
            paid?: boolean;
            mapId?: string;
            amountTotal?: number | null;
            currency?: string | null;
            plan?: CheckoutPlan | null;
            creditsRemaining?: number | null;
            orderType?: CheckoutOrderType;
            printVariant?: PrintVariant | null;
            includesDigitalAddOn?: boolean;
            printSummary?: PrintOrderSummary | null;
          } | null;
          if (data?.paid) {
            const verifiedPlan =
              data.plan === "single" || data.plan === "pack3" || data.plan === "subscription" ? data.plan : null;
            const verifiedOrderType = data.orderType === "print" ? "print" : "digital";
            const verifiedPrintVariant = isPrintVariant(data.printVariant) ? data.printVariant : null;
            const hasDigitalEntitlement =
              verifiedPlan === "subscription" ||
              (typeof data.creditsRemaining === "number" ? data.creditsRemaining > 0 : Boolean(verifiedPlan));

            setPaid(hasDigitalEntitlement);
            track("purchase_success", { isPaid: hasDigitalEntitlement, orderType: verifiedOrderType });
            if (typeof window !== "undefined") {
              try {
                const purchaseKey = `ga4:purchase:${sessionId}`;
                if (sessionStorage.getItem(purchaseKey) !== "true") {
                  trackPurchaseCompleted({
                    transactionId: sessionId,
                    plan: verifiedPlan,
                    orderType: verifiedOrderType,
                    printVariant: verifiedPrintVariant,
                    includeDigitalAddOn: Boolean(data.includesDigitalAddOn),
                    value:
                      typeof data.amountTotal === "number" && Number.isFinite(data.amountTotal)
                        ? data.amountTotal / 100
                        : undefined,
                    currency: typeof data.currency === "string" ? data.currency : undefined,
                  });
                  sessionStorage.setItem(purchaseKey, "true");
                }
              } catch {
                // Ignore storage failures and continue.
              }
            }
            setStatus("success");
            setCurrentPlan(verifiedPlan);
            setOrderType(verifiedOrderType);
            setPrintVariant(verifiedPrintVariant);
            if (verifiedOrderType === "print" && data.printSummary) {
              setPrintSummary(data.printSummary);
            }
            const resolvedMapId = mapIdParam || (typeof data.mapId === "string" ? data.mapId : null);
            setResolvedMapId(resolvedMapId);
            if (hasDigitalEntitlement) {
              void createAccessLink();
            } else {
              setAccessLink(null);
              setAccessLinkStatus("idle");
            }
            if (typeof window !== "undefined") {
              try {
                // Let users manually trigger the HD download on the download page.
                if (resolvedMapId && hasDigitalEntitlement) {
                  localStorage.setItem(CHECKOUT_MAP_KEY, resolvedMapId);
                }
              } catch {
                // ignore storage errors (e.g., privacy mode)
              }
            }
            if (hasDigitalEntitlement) {
              redirectTimerRef.current = setTimeout(() => {
                if (!autoRedirectRef.current) return;
                router.replace(
                  buildDownloadPath({ sessionId, mapId: resolvedMapId ?? undefined }),
                );
              }, 3500);
            }
            return;
          }
        } catch (err) {
          console.error("Payment verification failed", err);
        }
        await wait(delayForAttempt(attempt));
      }
      if (!active) return;
      setStatus("error");
      setMessage(
        "Payment verification is taking longer than expected. Please try again or contact support@starmapco.com.",
      );
    };

    verify();
    return () => {
      active = false;
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [createAccessLink, router, searchParams, setPaid, verificationRunId]);

  const hasDigitalEntitlement =
    currentPlan === "single" || currentPlan === "pack3" || currentPlan === "subscription";
  const isPrintOrder = orderType === "print";
  const sessionIdParam = searchParams.get("session_id")?.trim() || "";
  const printProductLabel = useMemo(() => {
    if (!printVariant) return "Custom star map print";
    return printTiers[printVariant]?.label ?? "Custom star map print";
  }, [printTiers, printVariant]);
  const printOrderReference = useMemo(() => {
    const sessionSuffix = sessionIdParam.length > 8 ? sessionIdParam.slice(-8) : sessionIdParam;
    if (printSummary?.printfulOrderId) {
      return `#${String(printSummary.printfulOrderId)} (···${sessionSuffix})`;
    }
    return sessionSuffix ? `···${sessionSuffix}` : null;
  }, [printSummary?.printfulOrderId, sessionIdParam]);

  const handleCopyPrintConfirmationLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    pauseRedirect();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setPrintLinkCopied(true);
      window.setTimeout(() => setPrintLinkCopied(false), 2500);
    } catch {
      setPrintLinkCopied(false);
    }
  }, [pauseRedirect]);

  useEffect(() => {
    if (status !== "success" || !isPrintOrder || !sessionIdParam) return;
    if (printSummary?.kvStatus === "sent") return;

    let active = true;
    let attempts = 0;
    const poll = async () => {
      if (!active || attempts >= 3) return;
      attempts += 1;
      try {
        const res = await fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionIdParam)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as { printSummary?: PrintOrderSummary | null } | null;
        if (data?.printSummary) {
          setPrintSummary(data.printSummary);
          if (data.printSummary.kvStatus === "sent") return;
        }
      } catch {
        // ignore transient verify errors during fulfillment polling
      }
      if (active && attempts < 3) {
        window.setTimeout(() => void poll(), 3000);
      }
    };

    const timer = window.setTimeout(() => void poll(), 3000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isPrintOrder, printSummary?.kvStatus, sessionIdParam, status]);

  useEffect(() => {
    if (status !== "success" || !hasDigitalEntitlement) return;
    void loadReferralStatus();
  }, [hasDigitalEntitlement, loadReferralStatus, status]);

  useEffect(() => {
    if (status !== "success" || !hasDigitalEntitlement) return;
    if (referralStatus !== "ready" || referralLink || referralLoading) return;
    void createReferralLink("auto");
  }, [createReferralLink, hasDigitalEntitlement, referralLink, referralLoading, referralStatus, status]);

  useEffect(() => {
    if (printUpsellTrackedRef.current) return;
    if (status !== "success" || !hasDigitalEntitlement || isPrintOrder || !printCheckoutEnabled) return;
    printUpsellTrackedRef.current = true;
    trackViewItemList({
      itemListId: "success_print_upsell",
      itemListName: "Success print upsell",
      items: PAYWALL_PRINT_VARIANT_ORDER.map((variant, index) => ({
        plan: "single",
        orderType: "print" as const,
        printVariant: variant,
        index,
      })),
    });
  }, [hasDigitalEntitlement, isPrintOrder, status]);

  useEffect(() => {
    if (accessPanelTrackedRef.current) return;
    if (status !== "success" || !hasDigitalEntitlement) return;
    accessPanelTrackedRef.current = true;
    track("success_recovery_panel_seen", {
      order_type: orderType,
      plan: currentPlan ?? undefined,
      has_map_id: Boolean(resolvedMapId),
    });
  }, [currentPlan, hasDigitalEntitlement, orderType, resolvedMapId, status]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0b1433] via-[#0b1a30] to-[#0b1433] px-4 text-amber-50">
      {/* Celebration stars animation */}
      {status === "success" && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <span
              key={i}
              className="absolute text-2xl"
              style={{
                left: `${10 + (i * 7) % 80}%`,
                top: `${20 + (i * 11) % 60}%`,
                animation: `star-burst 1.5s ease-out ${i * 0.1}s infinite`,
                color: i % 2 === 0 ? '#f1c27d' : '#ffffff',
              }}
            >
              ★
            </span>
          ))}
        </div>
      )}
      <div className={`relative overflow-hidden rounded-3xl border border-amber-200/30 bg-white/10 px-8 py-7 text-center shadow-2xl backdrop-blur transition-opacity duration-300 md:px-10 md:py-9 ${status === "success" ? 'animate-[scale-in_0.4s_ease-out]' : ''}`}>
        <div className="pointer-events-none absolute inset-0">
          <div className={`absolute -left-10 -top-16 h-36 w-36 rounded-full bg-amber-300/15 blur-3xl ${status === "success" ? 'animate-pulse' : ''}`} />
          <div className={`absolute -bottom-14 right-0 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl ${status === "success" ? 'animate-pulse' : ''}`} />
        </div>
        <div className="relative inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-100 shadow-sm">
          StarMapCo
        </div>
        <h1 className="relative mt-4 text-2xl font-semibold text-white md:text-3xl">
          {status === "success"
            ? isPrintOrder
              ? "Print order confirmed"
              : "Payment successful"
            : status === "error"
              ? "Payment verification"
              : "Verifying payment"}
        </h1>
        <p className="relative mt-2 text-sm text-amber-100/90">
          {status === "error"
            ? message ??
              "Payment verification is taking longer than expected. Please refresh or contact support@starmapco.com."
            : status === "success"
              ? isPrintOrder
                ? hasDigitalEntitlement
                  ? "Your print order is placed and your HD file is unlocked."
                  : "Payment received. We are preparing your print order now."
                : "We are preparing your print-ready star map. This will only take a moment."
              : "Confirming your payment with Stripe. This can take up to 45 seconds."}
        </p>
        {status !== "error" && (
          <>
            <div className={`relative mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-amber-200/50 bg-white/15 px-4 py-2 text-xs font-semibold text-amber-50 shadow ${status === "success" ? 'bg-green-500/20 border-green-300/50' : ''}`}>
              {status === "success" ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {hasDigitalEntitlement ? "Access unlocked — redirecting..." : "Order confirmed"}
                </span>
              ) : (
                "Checking payment status..."
              )}
            </div>
            {status === "success" && (
              <p className="relative mt-2 text-xs text-amber-100/80">
                {isPrintOrder
                  ? hasDigitalEntitlement
                    ? "Print order + HD digital add-on unlocked."
                    : printSummary?.confirmationEmailSent
                      ? "Confirmation email sent. Tracking arrives when your order ships."
                      : "Confirmation email on its way. Tracking arrives when your order ships."
                  : currentPlan === "subscription"
                    ? "Unlimited HD exports unlocked."
                    : currentPlan === "pack3"
                      ? "3 HD export credits unlocked. Each export uses one credit for the current map."
                      : "1 HD export credit unlocked."}
              </p>
            )}
            <p className="relative mt-3 text-[11px] uppercase tracking-[0.18em] text-amber-200/70">
              {status === "success"
                ? hasDigitalEntitlement
                  ? "Redirecting to your download page"
                  : "Order confirmation complete"
                : "Redirecting once your payment is confirmed"}
            </p>
            {status === "success" && isPrintOrder && (
              <div className="relative mt-4 rounded-2xl border border-amber-200/40 bg-white/10 p-4 text-left">
                <p className="text-sm font-semibold text-white">What happens next</p>
                <p className="mt-1 text-xs text-amber-100/80">
                  {printProductLabel}
                  {printOrderReference ? ` · Ref ${printOrderReference}` : ""}
                </p>
                <ol className="mt-3 space-y-2 text-left text-xs text-amber-100/85">
                  {printFulfillmentSteps.map((step) => (
                    <li key={step} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" aria-hidden />
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-amber-100/80">
                  Questions? Email{" "}
                  <a href={`mailto:${supportEmail}`} className="font-semibold text-amber-200 underline">
                    {supportEmail}
                  </a>{" "}
                  and include the email you used at checkout.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyPrintConfirmationLink()}
                    className="rounded-full border border-amber-200 bg-amber-400/20 px-3 py-2 text-[11px] font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-400/30"
                  >
                    {printLinkCopied ? "Link copied" : "Save this page (copy link)"}
                  </button>
                  {printSummary?.kvStatus === "sent" && (
                    <span className="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                      Submitted to production
                    </span>
                  )}
                  {printSummary?.shippingNotificationSent && (
                    <span className="rounded-full border border-sky-300/40 bg-sky-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-100">
                      Tracking email sent
                    </span>
                  )}
                </div>
              </div>
            )}
            {status === "success" && (
              <div className="relative mt-4 rounded-2xl border border-amber-200/40 bg-white/10 p-4 text-left">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {hasDigitalEntitlement ? "Access link" : "Need the HD file too?"}
                    </p>
                    <p className="mt-1 text-xs text-amber-100/80">
                      {hasDigitalEntitlement
                        ? "Use this link on another device anytime."
                        : `Add an instant HD download for ${digitalPriceLabel}.`}
                    </p>
                  </div>
                  {hasDigitalEntitlement ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyAccessLink}
                        disabled={!accessLink || accessLinkStatus === "loading"}
                        className="rounded-full border border-amber-200 bg-amber-400/20 px-3 py-2 text-[11px] font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {accessLinkStatus === "loading"
                          ? "Generating..."
                          : accessLinkCopied
                            ? "Link copied"
                            : "Copy link"}
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
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleAddDigitalDownload()}
                      disabled={digitalAddOnLoading}
                      className="rounded-full border border-amber-200 bg-amber-400/20 px-3 py-2 text-[11px] font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {digitalAddOnLoading ? "Opening checkout..." : `Add HD download (${digitalPriceLabel})`}
                    </button>
                  )}
                </div>
                {hasDigitalEntitlement ? (
                  <>
                    <p className="mt-2 text-[11px] text-amber-100/70">
                      Keep this link private — anyone with it can access your downloads, and My Downloads can reopen it later.
                    </p>
                    <p className="mt-1 text-[11px] text-amber-100/70">
                      If you need the file on another device, copy or email the access link above.
                    </p>
                    {currentPlan === "pack3" && (
                      <p className="mt-1 text-[11px] text-amber-100/70">
                        3-credit pack: each HD export is for one map at a time.
                      </p>
                    )}
                    {accessLinkStatus === "error" && (
                      <p className="mt-2 text-xs text-rose-200">We couldn't generate a link yet. Please refresh and try again.</p>
                    )}
                    {accessEmailMessage && (
                      <p className={`mt-2 text-xs ${accessEmailStatus === "sent" ? "text-emerald-200" : "text-rose-200"}`}>
                        {accessEmailMessage}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-[11px] text-amber-100/70">
                    Your print order remains active either way. This adds instant file access.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {hasDigitalEntitlement && (
                    <button
                      type="button"
                      onClick={() => {
                        pauseRedirect();
                        track("success_recovery_action", { action: "go_to_download_now" });
                        router.replace(
                          buildDownloadPath({
                            sessionId: searchParams.get("session_id"),
                            mapId: resolvedMapId,
                          }),
                        );
                      }}
                      className="rounded-full bg-amber-400 px-4 py-2 text-[11px] font-semibold text-midnight shadow transition hover:-translate-y-[1px] hover:shadow-lg"
                    >
                      Go to download now
                    </button>
                  )}
                  {hasDigitalEntitlement && (
                    <button
                      type="button"
                      onClick={() => {
                        pauseRedirect();
                        track("success_recovery_action", { action: "open_my_downloads" });
                        router.replace("/my-downloads");
                      }}
                      className="rounded-full border border-white/25 px-4 py-2 text-[11px] font-semibold text-amber-100 transition hover:border-white/50 hover:text-white"
                    >
                      My downloads
                    </button>
                  )}
                  {hasDigitalEntitlement && currentPlan === "pack3" && (
                    <button
                      type="button"
                      onClick={() => {
                        pauseRedirect();
                        track("success_recovery_action", { action: "open_editor_create_next_map" });
                        router.replace("/editor?mode=quick&source=success-pack3-create-next");
                      }}
                      className="rounded-full border border-amber-200/60 bg-amber-300/15 px-4 py-2 text-[11px] font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/25"
                    >
                      Create next map
                    </button>
                  )}
                  {!hasDigitalEntitlement && (
                    <button
                      type="button"
                      onClick={() => router.replace("/editor")}
                      className="rounded-full bg-amber-400 px-4 py-2 text-[11px] font-semibold text-midnight shadow transition hover:-translate-y-[1px] hover:shadow-lg"
                    >
                      Back to editor
                    </button>
                  )}
                  {currentPlan === "subscription" && (
                    <button
                      type="button"
                      onClick={() => void handleManageBilling()}
                      disabled={portalLoading}
                      className="rounded-full border border-white/25 px-4 py-2 text-[11px] font-semibold text-amber-100 transition hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {portalLoading ? "Opening billing..." : "Manage subscription"}
                    </button>
                  )}
                </div>
                {portalError && <p className="mt-2 text-xs text-rose-200">{portalError}</p>}
                {hasDigitalEntitlement && !isPrintOrder && printCheckoutEnabled && (
                  <div className="mt-4 rounded-xl border border-amber-200/30 bg-amber-400/10 p-3 text-left">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/85">
                          Print this map next
                        </p>
                        <p className="mt-1 text-xs text-amber-100/80">
                          Turn this download into a premium gift. Framed is the cleanest gift-ready finish. {printShippingDisclosure}
                        </p>
                      </div>
                      <span className="rounded-full border border-amber-200/40 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                        Framed recommended
                      </span>
                    </div>
                    {successPrintRecommendedCard && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                          <div className="p-3 pb-0 lg:p-4 lg:pr-0 lg:pb-4">
                            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.35rem]">
                              <div className={successPrintRecommendedCard.sceneClass}>
                                <ResilientImage
                                  src={successPrintRecommendedCard.imageSrc}
                                  fallbackSrc={successPrintRecommendedCard.fallbackSrc}
                                  alt={successPrintRecommendedCard.label}
                                  fill
                                  sizes="(max-width: 768px) 100vw, 42vw"
                                  className={successPrintRecommendedCard.imageClass}
                                />
                              </div>
                              <span className="absolute left-4 top-4 rounded-full border border-black/10 bg-white/88 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-midnight shadow-sm">
                                {successPrintRecommendedCard.sceneLabel}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col justify-between gap-4 p-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                                  Recommended
                                </span>
                                <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
                                  Gift-ready
                                </span>
                              </div>
                              <div className="space-y-1">
                                <h5 className="text-base font-semibold text-white">{successPrintRecommendedCard.label}</h5>
                                <p className="text-xs text-neutral-200">{successPrintRecommendedCard.detail}</p>
                              </div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/85">
                                {successPrintRecommendedCard.bestFor}
                              </p>
                              <p className="text-sm font-semibold text-amber-100">{successPrintRecommendedCard.priceLine}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleOpenPrintUpsell(successPrintRecommendedCard.variant)}
                              className="inline-flex w-full items-center justify-center rounded-full border border-amber-100 bg-amber-300 px-4 py-2 text-xs font-semibold text-midnight shadow-lg transition hover:-translate-y-[1px] hover:bg-amber-200"
                            >
                              Start framed checkout
                            </button>
                          </div>
                        </div>
                    </div>
                    )}
                    {successPrintSecondaryCards.length > 0 && (
                      <details className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-white/90">Other print formats</summary>
                        <div className="mt-3 grid gap-2">
                          {successPrintSecondaryCards.map((option) => (
                            <button
                              key={option.variant}
                              type="button"
                              onClick={() => void handleOpenPrintUpsell(option.variant)}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-left text-xs transition hover:-translate-y-[1px] hover:border-white/25 hover:bg-white/8"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-white">{option.label}</p>
                                <p className="mt-0.5 text-[11px] text-neutral-300">{option.bestFor}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                                {option.priceLine}
                              </span>
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                    <p className="mt-2 text-[11px] text-amber-100/70">
                      {printOrderIncludesDigitalNote}
                    </p>
                  </div>
                )}
                {status === "success" && merchSuccessEditorHref ? (
                  <div className="mt-4 rounded-xl border border-violet-200/35 bg-violet-500/15 p-3 text-left">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-100/90">
                        Stickers & apparel
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-violet-100/85">
                      Turn this sky into kiss-cut stickers, magnets, pins, or DTG apparel — options ship like prints through
                      Printful.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          track("success_merch_teaser_clicked", { destination: "editor" });
                          router.replace(merchSuccessEditorHref);
                        }}
                        className="rounded-full bg-violet-400 px-4 py-2 text-[11px] font-semibold text-midnight shadow transition hover:-translate-y-[1px] hover:bg-violet-300"
                      >
                        Open editor with merch
                      </button>
                    </div>
                  </div>
                ) : null}
                {hasDigitalEntitlement && (
                  <div className="mt-4 rounded-xl border border-amber-300/45 bg-amber-400/10 p-4 text-left">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                      Share & earn {referralRewardCreditsLabel}
                    </p>
                    <p className="mt-2 text-xs text-amber-50/90">
                      Know someone planning a gift? Send your link — friends get {referralFriendOfferLabel}, and you earn{" "}
                      {referralRewardCreditsLabel} when they checkout.
                    </p>
                    <p className="mt-2 text-[11px] text-amber-100/70">
                      Referral credits earned so far: {referralSummary.rewardsGranted}.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCreateReferralLink()}
                        disabled={referralLoading}
                        className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {referralLoading ? "Generating..." : referralLink ? "Refresh link" : "Create link"}
                      </button>
                      {referralLink && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleCopyReferralLink()}
                            className="rounded-full border border-amber-200 bg-amber-400/20 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/30"
                          >
                            {referralCopied ? "Copied" : "Copy social link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopyReferralPost()}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                          >
                            {referralPostCopied ? "Post text copied" : "Copy post text"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleShareReferralLink("native")}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                          >
                            Share link
                          </button>
                        </>
                      )}
                    </div>
                    {referralLink ? <p className="mt-1 text-[11px] text-amber-100/70">Share the link from any device.</p> : null}
                    {referralStatus === "loading" && (
                      <p className="mt-2 text-[11px] text-amber-100/70">Loading referral stats...</p>
                    )}
                    {referralStatus === "error" && (
                      <p className="mt-2 text-[11px] text-rose-200">Couldn&apos;t load referral stats right now.</p>
                    )}
                    {referralError && <p className="mt-2 text-[11px] text-rose-200">{referralError}</p>}
                  </div>
                )}
                <PostPurchaseProofRequest
                  source="success"
                  orderType={orderType}
                  sessionId={searchParams.get("session_id")}
                  plan={currentPlan}
                  printVariant={printVariant}
                />
              </div>
            )}
          </>
        )}
        {status === "error" && (
          <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setVerificationRunId((prev) => prev + 1)}
              className="rounded-full bg-amber-400 px-4 py-2 text-[11px] font-semibold text-midnight shadow transition hover:-translate-y-[1px] hover:shadow-lg"
            >
              Retry verification
            </button>
            <button
              type="button"
              onClick={() => router.replace("/")}
              className="rounded-full border border-white/25 px-4 py-2 text-[11px] font-semibold text-amber-100 transition hover:border-white/50 hover:text-white"
            >
              Back to home
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
