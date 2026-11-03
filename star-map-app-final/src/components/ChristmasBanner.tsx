"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getChristmasBannerContent,
  resolveChristmasCampaignNowMs,
} from "@/lib/christmasCampaign";
import { shouldHideSiteTopNav } from "@/components/SiteTopNav";
import { getInstantHdPriceLine } from "@/lib/digitalGiftCheckout";

type Props = {
  /** Explicit clock for tests/SSR only. Production renders omit it and always use the real clock. */
  nowMs?: number;
};

/**
 * Sitewide Christmas campaign banner. Date-driven (Pacific); hidden outside the campaign window.
 * The campaign clock is the real time in production: no query parameter or
 * other visitor-controlled input may override it (a `christmas_now` query
 * override shipped publicly until 2026-11-03 and let anyone preview future
 * campaign phases, including Black Friday, early — see issue #531).
 */
export default function ChristmasBanner({ nowMs }: Props = {}) {
  const pathname = usePathname() || "";
  // Same route gate as the site nav: no sitewide chrome on the editor (or the
  // /m/ and /funnel flows), where the tool owns the first screen.
  if (shouldHideSiteTopNav(pathname)) return null;
  const clockMs = resolveChristmasCampaignNowMs({ nowMs });
  const content = getChristmasBannerContent(clockMs, getInstantHdPriceLine());
  if (!content) return null;

  return (
    <div
      data-site-chrome-banner
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
