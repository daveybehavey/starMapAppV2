import Link from "next/link";
import { getInstantHdHeroHref, getInstantHdPriceLine } from "@/lib/digitalGiftCheckout";

type InstantHdHeroExtrasProps = {
  /** Analytics source for the instant HD editor entry (checkout=digital). */
  source: string;
  /** Secondary hero button — keep false on wedding ad landing. */
  showButton?: boolean;
  /** Link to the dedicated /hd-star-map funnel. */
  showFunnelLink?: boolean;
};

export default function InstantHdHeroExtras({
  source,
  showButton = true,
  showFunnelLink = true,
}: InstantHdHeroExtrasProps) {
  if (!showButton && !showFunnelLink) return null;

  const instantHref = getInstantHdHeroHref(source);
  const instantPrice = getInstantHdPriceLine();

  return (
    <>
      {showButton ? (
        <Link
          href={instantHref}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent"
        >
          Instant HD from {instantPrice}
        </Link>
      ) : null}
      {showFunnelLink ? (
        <p className="w-full text-xs text-neutral-300 sm:text-sm">
          Last-minute?{" "}
          <Link
            href="/hd-star-map"
            className="font-semibold text-amber-200 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-100"
          >
            Instant HD funnel
          </Link>
        </p>
      ) : null}
    </>
  );
}
