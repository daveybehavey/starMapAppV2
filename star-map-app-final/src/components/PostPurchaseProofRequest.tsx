"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/businessProfile";
import type { CheckoutPlan, PrintVariant } from "@/lib/pricing";

type PostPurchaseProofRequestProps = {
  source: "success" | "download";
  orderType: "digital" | "print";
  sessionId?: string | null;
  plan?: CheckoutPlan | null;
  printVariant?: PrintVariant | null;
  mapId?: string | null;
};

function formatPrintVariant(printVariant?: PrintVariant | null) {
  if (printVariant === "poster_unframed") return "unframed poster";
  if (printVariant === "poster_framed") return "framed print";
  return null;
}

function buildEmailDraft(input: {
  orderType: "digital" | "print";
  sessionId?: string | null;
  plan?: CheckoutPlan | null;
  printVariant?: PrintVariant | null;
}) {
  const { orderType, sessionId, plan, printVariant } = input;
  const intro =
    orderType === "print"
      ? "When your order arrives, send us:"
      : "If you print it, frame it, or gift it, send us:";
  const items =
    orderType === "print"
      ? [
          "1 photo of the final print in the room or before gifting",
          "1-2 lines about the moment or occasion",
          "your permission if you want us to feature it later",
        ]
      : [
          "1 photo or screenshot of how you used the map",
          "1-2 lines about the moment or occasion",
          "your permission if you want us to feature it later",
        ];

  const details = [
    sessionId ? `Order reference: ${sessionId}` : null,
    plan ? `Plan: ${plan}` : null,
    formatPrintVariant(printVariant) ? `Format: ${formatPrintVariant(printVariant)}` : null,
  ].filter(Boolean);

  return [
    "Hi StarMapCo,",
    "",
    orderType === "print"
      ? "My order arrived and I wanted to share a real photo."
      : "I wanted to share how I used my StarMapCo map.",
    ...(details.length ? ["", ...details] : []),
    "",
    intro,
    ...items.map((item) => `- ${item}`),
    "",
    "We only publish anything with permission.",
  ].join("\n");
}

export default function PostPurchaseProofRequest({
  source,
  orderType,
  sessionId,
  plan,
  printVariant,
  mapId,
}: PostPurchaseProofRequestProps) {
  const [copied, setCopied] = useState(false);
  const [reviewConsentAvailable, setReviewConsentAvailable] = useState(true);
  const [reviewConsentLoaded, setReviewConsentLoaded] = useState(false);
  const [reviewConsentSaving, setReviewConsentSaving] = useState(false);
  const [reviewConsentEnabled, setReviewConsentEnabled] = useState(false);
  const [reviewConsentError, setReviewConsentError] = useState<string | null>(null);
  const business = getBusinessProfile();
  const supportEmail = business.email;
  const emailDraft = useMemo(
    () => buildEmailDraft({ orderType, sessionId, plan, printVariant }),
    [orderType, plan, printVariant, sessionId],
  );
  const subject = orderType === "print" ? "My StarMapCo print arrived" : "My StarMapCo map in use";
  const subjectWithReference = sessionId ? `${subject} (${sessionId})` : subject;
  const mailtoHref = useMemo(() => {
    return `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(subjectWithReference)}&body=${encodeURIComponent(emailDraft)}`;
  }, [emailDraft, subjectWithReference, supportEmail]);

  async function handleCopyEmailDraft() {
    try {
      await navigator.clipboard.writeText(emailDraft);
      setCopied(true);
      track("proof_request_email_draft_copied", { source, orderType });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      track("proof_request_email_draft_copy_failed", { source, orderType });
    }
  }

  useEffect(() => {
    let active = true;

    const loadConsent = async () => {
      try {
        const url = mapId
          ? `/api/proof/consent?mapId=${encodeURIComponent(mapId)}`
          : "/api/proof/consent";
        const res = await fetch(url, { cache: "no-store" });
        if (!active) return;
        if (res.status === 401 || res.status === 403 || res.status === 409) {
          setReviewConsentAvailable(false);
          setReviewConsentLoaded(true);
          return;
        }
        if (!res.ok) {
          setReviewConsentLoaded(true);
          return;
        }
        const data = (await res.json().catch(() => null)) as { optedIn?: boolean } | null;
        setReviewConsentEnabled(Boolean(data?.optedIn));
        setReviewConsentLoaded(true);
      } catch {
        if (!active) return;
        setReviewConsentLoaded(true);
      }
    };

    void loadConsent();

    return () => {
      active = false;
    };
  }, [mapId]);

  async function handleReviewConsent(nextValue: boolean) {
    setReviewConsentSaving(true);
    setReviewConsentError(null);
    try {
      const url = mapId
        ? `/api/proof/consent?mapId=${encodeURIComponent(mapId)}`
        : "/api/proof/consent";
      const res = await fetch(url, {
        method: nextValue ? "POST" : "DELETE",
        headers: nextValue ? { "Content-Type": "application/json" } : undefined,
        body: nextValue
          ? JSON.stringify({
              mapId: mapId ?? undefined,
              source,
              orderType,
              plan,
              printVariant,
            })
          : undefined,
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; optedIn?: boolean } | null;
      if (!res.ok || !data?.ok) {
        setReviewConsentError("Couldn't save that right now.");
        track("proof_review_consent_failed", { source, orderType, action: nextValue ? "allow" : "remove" });
        return;
      }
      setReviewConsentEnabled(Boolean(data.optedIn));
      track("proof_review_consent_saved", { source, orderType, action: nextValue ? "allow" : "remove" });
    } catch {
      setReviewConsentError("Couldn't save that right now.");
      track("proof_review_consent_failed", { source, orderType, action: nextValue ? "allow" : "remove" });
    } finally {
      setReviewConsentSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="space-y-4">
        {reviewConsentAvailable ? (
          <div className="rounded-2xl border border-amber-200/15 bg-amber-400/8 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/85">
              Optional website-use permission
            </p>
            <h4 className="mt-1 text-sm font-semibold text-white">Let us review this map for future website examples</h4>
            <p className="mt-1 text-xs text-neutral-200">
              Nothing is published automatically. This only lets StarMapCo review this exact map for possible use in the gallery or on product pages.
              Any buyer photo or quote still needs separate approval.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleReviewConsent(!reviewConsentEnabled)}
                disabled={reviewConsentSaving || !reviewConsentLoaded}
                className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-400/20 px-4 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reviewConsentSaving
                  ? "Saving..."
                  : reviewConsentEnabled
                    ? "Permission saved"
                    : "Allow review for website examples"}
              </button>
              {reviewConsentEnabled ? (
                <button
                  type="button"
                  onClick={() => void handleReviewConsent(false)}
                  disabled={reviewConsentSaving}
                  className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Remove permission
                </button>
              ) : null}
            </div>
            {reviewConsentEnabled ? (
              <p className="mt-2 text-[11px] text-amber-100/75">
                Saved for this paid map. We still won&apos;t publish buyer photos or quotes without separate approval.
              </p>
            ) : null}
            {reviewConsentError ? <p className="mt-2 text-[11px] text-rose-200">{reviewConsentError}</p> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/85">Help us collect real proof</p>
            <h4 className="mt-1 text-sm font-semibold text-white">Send a real photo when this map is in the wild</h4>
            <p className="mt-1 text-xs text-neutral-200">
              Email {supportEmail} with a photo and a short note. We only use real examples and only publish them with permission.
            </p>
            {sessionId ? <p className="mt-1 text-[11px] text-amber-100/70">Reference: {sessionId}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={mailtoHref}
              onClick={() => track("proof_request_email_clicked", { source, orderType })}
              className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-400/20 px-4 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:-translate-y-[1px] hover:bg-amber-400/30"
            >
              Email support
            </a>
            <button
              type="button"
              onClick={() => void handleCopyEmailDraft()}
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40 hover:bg-white/15"
            >
              {copied ? "Email draft copied" : "Copy email draft"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
