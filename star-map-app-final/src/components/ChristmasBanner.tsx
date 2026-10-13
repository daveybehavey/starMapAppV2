import Link from "next/link";
import { getChristmasBannerContent } from "@/lib/christmasCampaign";
import { getInstantHdPriceLine } from "@/lib/digitalGiftCheckout";

/**
 * Sitewide Christmas campaign banner. Date-driven; hidden outside the campaign window.
 */
export default function ChristmasBanner({ nowMs }: { nowMs?: number } = {}) {
  const content = getChristmasBannerContent(nowMs ?? Date.now(), getInstantHdPriceLine());
  if (!content) return null;

  return (
    <div
      className="border-b border-amber-300/40 bg-[linear-gradient(90deg,rgba(12,22,54,0.98),rgba(28,48,96,0.96),rgba(12,22,54,0.98))] text-[#f7f0e2]"
      role="region"
      aria-label="Christmas delivery notice"
      data-christmas-banner-phase={content.phase}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-2.5 text-center sm:flex-row sm:text-left sm:px-6">
        <p className="text-[12px] leading-snug sm:text-[13px]">{content.message}</p>
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
