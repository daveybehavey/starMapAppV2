"use client";

import { useEffect, useState } from "react";
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
  revealAfterScroll?: boolean;
  revealOffset?: number;
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
  revealAfterScroll = true,
  revealOffset = 420,
}: StickyCtaBarProps) {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
  const baseHref = "/editor?mode=quick";
  const resolvedSource = source?.trim() || "sticky-cta";
  const href = `${baseHref}&source=${encodeURIComponent(resolvedSource)}`;
  const [isVisible, setIsVisible] = useState(!revealAfterScroll);

  useEffect(() => {
    if (!revealAfterScroll) {
      setIsVisible(true);
      return;
    }

    let frameId = 0;
    const updateVisibility = () => {
      frameId = 0;
      setIsVisible(window.scrollY > revealOffset);
    };
    const onScroll = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(updateVisibility);
    };

    updateVisibility();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [revealAfterScroll, revealOffset]);

  return (
    <div
      className={`sticky top-3 z-20 overflow-hidden transition-[max-height,opacity,margin,transform] duration-300 ${
        isVisible
          ? "mt-6 max-h-48 translate-y-0 opacity-100"
          : "mt-2 max-h-0 -translate-y-2 opacity-0 pointer-events-none"
      } ${className}`}
      aria-hidden={isVisible ? undefined : true}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-[rgba(247,241,227,0.96)] px-4 py-3 text-midnight shadow-lg shadow-black/10 backdrop-blur">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-neutral-600">
            {printCheckoutEnabled
              ? "Free preview first. Switch between framed, unframed, and HD delivery after the design feels right."
              : description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondaryHref && printCheckoutEnabled ? (
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
