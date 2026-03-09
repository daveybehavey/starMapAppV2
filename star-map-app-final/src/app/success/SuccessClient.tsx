"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { track, trackBeginCheckout, trackPurchaseCompleted } from "@/lib/analytics";
import {
  formatPrice,
  getPricingTiers,
  getPrintPricingTiers,
  type CheckoutOrderType,
  type CheckoutPlan,
  type PrintVariant,
} from "@/lib/pricing";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";

const CHECKOUT_MAP_KEY = "star-map-checkout-id";
type ReferralStatus = "idle" | "loading" | "ready" | "error";
type ReferralSummary = {
  visits: number;
  conversions: number;
  rewardsGranted: number;
  lastConvertedAt: number | null;
};

const DEFAULT_REFERRAL_SUMMARY: ReferralSummary = {
  visits: 0,
  conversions: 0,
  rewardsGranted: 0,
  lastConvertedAt: null,
};
const printCheckoutEnabled = /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim());
const printShippingDisclosure = getPrintShippingDisclosure();

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
  const [portalLoading, setPortalLoading] = useState(false);
  const [digitalAddOnLoading, setDigitalAddOnLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [verificationRunId, setVerificationRunId] = useState(0);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus>("idle");
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary>(DEFAULT_REFERRAL_SUMMARY);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRedirectRef = useRef(true);
  const digitalPriceLabel = formatPrice(getPricingTiers().single.amountCents, getPricingTiers().single.currency);
  const printPriceLabels = {
    framed: formatPrice(getPrintPricingTiers().poster_framed.amountCents, getPrintPricingTiers().poster_framed.currency),
    unframed: formatPrice(
      getPrintPricingTiers().poster_unframed.amountCents,
      getPrintPricingTiers().poster_unframed.currency,
    ),
  };

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
    } catch {
      // ignore clipboard errors
    }
  }, [accessLink, pauseRedirect]);

  const handleEmailAccessLink = useCallback(() => {
    if (!accessLink) return;
    pauseRedirect();
    const subject = encodeURIComponent("Your StarMapCo access link");
    const body = encodeURIComponent(
      `Here’s your private access link:\\n\\n${accessLink}\\n\\nUse this link on any device to restore your downloads.`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [accessLink, pauseRedirect]);

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
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "single",
          orderType: "digital",
          mapId: resolvedMapId ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "checkout_failed");
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
    } catch {
      setMessage("We couldn't start digital add-on checkout. Please try again.");
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
      await navigator.clipboard.writeText(referralLink);
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
      track("referral_link_copied", { source: "success" });
    } catch {
      // ignore clipboard failures
    }
  }, [pauseRedirect, referralLink]);

  const handleShareReferralLink = useCallback(
    async (platform: "x" | "facebook" | "pinterest" | "native") => {
      if (!referralLink) return;
      pauseRedirect();
      if (platform === "native" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: "Create your custom star map",
            text: "Create your custom star map with StarMapCo. Free preview, HD download in seconds.",
            url: referralLink,
          });
          track("referral_link_shared", { source: "success", platform: "native" });
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
          } | null;
          if (data?.paid) {
            const verifiedPlan =
              data.plan === "single" || data.plan === "pack3" || data.plan === "subscription" ? data.plan : null;
            const verifiedOrderType = data.orderType === "print" ? "print" : "digital";
            const verifiedPrintVariant = data.printVariant === "poster_framed" || data.printVariant === "poster_unframed"
              ? data.printVariant
              : null;
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
                const nextUrl = resolvedMapId
                  ? `/download?map_id=${encodeURIComponent(resolvedMapId)}`
                  : "/download";
                router.replace(nextUrl);
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

  useEffect(() => {
    if (status !== "success" || !hasDigitalEntitlement) return;
    void loadReferralStatus();
  }, [hasDigitalEntitlement, loadReferralStatus, status]);

  useEffect(() => {
    if (status !== "success" || !hasDigitalEntitlement) return;
    if (referralStatus !== "ready" || referralLink || referralLoading) return;
    void createReferralLink("auto");
  }, [createReferralLink, hasDigitalEntitlement, referralLink, referralLoading, referralStatus, status]);

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
                  : "Your print order is placed. We'll review it and email updates before production begins."
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
                    : "Print order received. We'll email updates after review."
                  : currentPlan === "subscription"
                    ? "Unlimited HD downloads unlocked."
                    : currentPlan === "pack3"
                      ? "3 HD downloads unlocked."
                      : "1 HD download unlocked."}
              </p>
            )}
            <p className="relative mt-3 text-[11px] uppercase tracking-[0.18em] text-amber-200/70">
              {status === "success"
                ? hasDigitalEntitlement
                  ? "Redirecting to your download page"
                  : "Order confirmation complete"
                : "Redirecting once your payment is confirmed"}
            </p>
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
                    <div className="flex items-center gap-2">
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
                          onClick={handleEmailAccessLink}
                          className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-amber-100/80 transition hover:border-white/40 hover:text-amber-100"
                        >
                          Email link
                        </button>
                      )}
                      {accessLink && accessLinkStatus === "ready" && (
                        <button
                          type="button"
                          onClick={() => {
                            pauseRedirect();
                            void createAccessLink(true);
                          }}
                          className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-amber-100/80 transition hover:border-white/40 hover:text-amber-100"
                        >
                          New link
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
                      Keep this link private — anyone with it can access your downloads.
                    </p>
                    {accessLinkStatus === "error" && (
                      <p className="mt-2 text-xs text-rose-200">We couldn't generate a link yet. Please refresh and try again.</p>
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
                        const nextUrl = resolvedMapId
                          ? `/download?map_id=${encodeURIComponent(resolvedMapId)}`
                          : "/download";
                        router.replace(nextUrl);
                      }}
                      className="rounded-full bg-amber-400 px-4 py-2 text-[11px] font-semibold text-midnight shadow transition hover:-translate-y-[1px] hover:shadow-lg"
                    >
                      Go to download now
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
                          Turn this download into a premium gift. Your map stays attached and framed is the
                          best-looking option. {printShippingDisclosure}
                        </p>
                      </div>
                      <span className="rounded-full border border-amber-200/40 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                        Framed recommended
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPrintUpsell("poster_framed")}
                        className="rounded-full bg-amber-400 px-4 py-2 text-[11px] font-semibold text-midnight shadow transition hover:-translate-y-[1px] hover:shadow-lg"
                      >
                        Add framed print ({printPriceLabels.framed} + shipping)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenPrintUpsell("poster_unframed")}
                        className="rounded-full border border-white/25 px-4 py-2 text-[11px] font-semibold text-amber-100 transition hover:border-white/50 hover:text-white"
                      >
                        Unframed option ({printPriceLabels.unframed} + shipping)
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-amber-100/70">
                      Physical orders are reviewed before production begins. {printShippingDisclosure}
                    </p>
                  </div>
                )}
                {hasDigitalEntitlement && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/85">
                        Referral bonus
                      </p>
                      <p className="text-[11px] text-amber-100/70">
                        {referralSummary.rewardsGranted} bonus credit{referralSummary.rewardsGranted === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-amber-100/80">
                      Share your link. Each paid checkout adds 1 HD credit.
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                        <p className="text-amber-100/60">Visits</p>
                        <p className="font-semibold text-white">{referralSummary.visits}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                        <p className="text-amber-100/60">Sales</p>
                        <p className="font-semibold text-white">{referralSummary.conversions}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                        <p className="text-amber-100/60">Rewards</p>
                        <p className="font-semibold text-white">{referralSummary.rewardsGranted}</p>
                      </div>
                    </div>
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
                            {referralCopied ? "Copied" : "Copy link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleShareReferralLink("native")}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                          >
                            Share link
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShareReferralLink("x")}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                          >
                            Share X
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShareReferralLink("facebook")}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                          >
                            Share Facebook
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShareReferralLink("pinterest")}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                          >
                            Share Pinterest
                          </button>
                        </>
                      )}
                    </div>
                    {referralSummary.lastConvertedAt ? (
                      <p className="mt-2 text-[11px] text-amber-100/70">
                        Last reward: {new Date(referralSummary.lastConvertedAt).toLocaleDateString()}
                      </p>
                    ) : null}
                    {referralStatus === "loading" && (
                      <p className="mt-2 text-[11px] text-amber-100/70">Loading referral stats...</p>
                    )}
                    {referralStatus === "error" && (
                      <p className="mt-2 text-[11px] text-rose-200">Couldn&apos;t load referral stats right now.</p>
                    )}
                    {referralError && <p className="mt-2 text-[11px] text-rose-200">{referralError}</p>}
                  </div>
                )}
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
