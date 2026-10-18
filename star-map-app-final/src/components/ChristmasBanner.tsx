"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getChristmasBannerContent,
  resolveChristmasCampaignNowMs,
} from "@/lib/christmasCampaign";
import { getInstantHdPriceLine } from "@/lib/digitalGiftCheckout";

type Props = {
  /** Explicit clock for tests/SSR. Prefer `christmas_now` query or env override when omitted. */
  nowMs?: number;
};

/**
 * Sitewide Christmas campaign banner. Date-driven (Pacific); hidden outside the campaign window.
 * Override clock with `?christmas_now=YYYY-MM-DD` or `CHRISTMAS_CAMPAIGN_NOW` / `NEXT_PUBLIC_CHRISTMAS_CAMPAIGN_NOW`.
 */
export default function ChristmasBanner({ nowMs }: Props = {}) {
  const searchParams = useSearchParams();
  const override = searchParams.get("christmas_now");
  const clockMs = resolveChristmasCampaignNowMs({ nowMs, override });
  const content = getChristmasBannerContent(clockMs, getInstantHdPriceLine());
  if (!content) return null;

  return (
    <div
      className="border-b border-amber-300/40 bg-[linear-gradient(90deg,rgba(12,22,54,0.98),rgba(28,48,96,0.96),rgba(12,22,54,0.98))] text-[#f7f0e2]"
      role="region"
      aria-label="Christmas delivery notice"
      data-christmas-banner-phase={content.phase}
      data-christmas-promo-code={content.promoCode ?? ""}
      data-digital-offer={content.phase === "digital_last_minute" ? true : undefined}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-1.5 px-4 py-2 text-center sm:flex-row sm:gap-2 sm:text-left sm:px-6 sm:py-2.5">
        <p className="text-[12px] leading-tight sm:text-[13px] sm:leading-snug">{content.message}</p>
        <Link
          href={content.ctaHref}
          prefetch={false}
          className="inline-flex shrink-0 items-center rounded-full border border-amber-300/50 bg-amber-400/20 px-3 py-1 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/30"
        >
          {content.ctaLabel}
        </Link>
      </div>
    </div>
  );
}
