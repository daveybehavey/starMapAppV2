"use client";

import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/businessProfile";
import type { CheckoutPlan, PrintVariant } from "@/lib/pricing";
import { getPrintPricingTiers } from "@/lib/pricing";
import { isPrintVariant } from "@/lib/printCatalog";
import { buildTestimonialRequestMailto } from "@/lib/testimonialRequestCopy";

type PostPurchaseProofRequestProps = {
  source: "success" | "download";
  orderType: "digital" | "print";
  sessionId?: string | null;
  plan?: CheckoutPlan | null;
  printVariant?: PrintVariant | null;
};

function formatPrintVariant(printVariant?: PrintVariant | null) {
  if (!printVariant || !isPrintVariant(printVariant)) return null;
  return getPrintPricingTiers()[printVariant].label;
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
}: PostPurchaseProofRequestProps) {
  const [copied, setCopied] = useState(false);
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
  const testimonialMailtoHref = useMemo(() => buildTestimonialRequestMailto(), []);

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

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100/75">Share a real photo later</p>
          <h4 className="mt-1 text-sm font-semibold text-white">If this map ends up on display, send us a photo</h4>
          <p className="mt-1 text-xs text-neutral-200">
            Email {supportEmail} with a photo and short note. We only feature real examples with permission.
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
          <a
            href={testimonialMailtoHref}
            onClick={() => track("testimonial_request_email_clicked", { source, orderType })}
            className="inline-flex items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:-translate-y-[1px] hover:bg-emerald-500/25"
          >
            Share a testimonial
          </a>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-neutral-300">
        We never invent reviews — we only publish quotes buyers approve in writing.
      </p>
    </div>
  );
}
