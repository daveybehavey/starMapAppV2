"use client";

import { track, trackFunnelStep } from "@/lib/analytics";

type StickyCtaBarProps = {
  source?: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
  secondaryButtonLabel?: string;
  secondaryHref?: string;
  secondaryPlan?: string;
  className?: string;
};

export default function StickyCtaBar({
  source,
  title = "Ready for a free preview?",
  description = "Create your star map in minutes — no account required.",
  buttonLabel = "Start free preview",
  secondaryButtonLabel,
  secondaryHref,
  secondaryPlan = "print_intent",
  className = "",
}: StickyCtaBarProps) {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
  const baseHref = "/editor?mode=quick";
  const resolvedSource = source?.trim() || "sticky-cta";
  const href = source ? `${baseHref}&source=${encodeURIComponent(source)}` : baseHref;

  return (
    <div className={`sticky top-3 z-20 mt-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-[rgba(247,241,227,0.96)] px-4 py-3 text-midnight shadow-lg shadow-black/10 backdrop-blur">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-neutral-600">{description}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-amber-200/70 bg-white/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-midnight">
              HD export in seconds
            </span>
            {printCheckoutEnabled && (
              <span className="rounded-full border border-amber-300/70 bg-amber-200/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-midnight">
                Printed + framed checkout
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondaryHref ? (
            <a
              href={secondaryHref}
              onClick={() => {
                track("sticky_secondary_click", { source: resolvedSource, plan: secondaryPlan });
                trackFunnelStep("hero_plan_click", { source: resolvedSource, plan: secondaryPlan });
              }}
              className="inline-flex items-center justify-center rounded-full border border-amber-300/70 bg-white px-4 py-2 text-sm font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-amber-50"
            >
              {secondaryButtonLabel}
            </a>
          ) : null}
          <a
            href={href}
            onClick={() => {
              track("sticky_preview_click", { source: resolvedSource });
              trackFunnelStep("hero_plan_click", { source: resolvedSource, plan: "preview" });
            }}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
          >
            {buttonLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
