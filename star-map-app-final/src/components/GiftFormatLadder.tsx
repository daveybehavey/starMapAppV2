import Link from "next/link";
import { buildGiftFormatTiers } from "@/lib/giftFormatLadder";
import { FRAMED_HD_RECOMMENDED_BADGE, getGiftLadderIntro } from "@/lib/moneyPageGiftCheckout";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";

type GiftFormatLadderProps = {
  sourcePrefix?: string;
  heading?: string;
  intro?: string;
  /** Show canvas tier (shop / anniversary — not wedding ad hero). */
  includeCanvas?: boolean;
  /** Mark instant HD as the recommended tier (digital funnel pages). */
  digitalRecommended?: boolean;
  className?: string;
};

export default function GiftFormatLadder({
  sourcePrefix = "gift-ladder",
  heading = "Pick your gift format",
  intro = getGiftLadderIntro(),
  includeCanvas = false,
  digitalRecommended = false,
  className = "",
}: GiftFormatLadderProps) {
  const tiers = buildGiftFormatTiers(sourcePrefix, { includeCanvas, digitalRecommended });
  const shippingDisclosure = getPrintShippingDisclosure();

  return (
    <section
      className={`content-visibility-auto rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10 ${className}`.trim()}
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Gift formats</p>
        <h2 className="text-xl font-semibold text-midnight sm:text-2xl">{heading}</h2>
        <p className="max-w-2xl text-sm text-neutral-800 sm:text-base">{intro}</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tiers.map((tier) => (
          <article
            key={tier.id}
            className={`flex flex-col rounded-2xl border p-4 shadow-sm ${
              tier.recommended
                ? "border-amber-300/80 bg-gradient-to-br from-amber-100/90 to-amber-50/80 ring-1 ring-amber-200/60"
                : "border-black/10 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-midnight">{tier.label}</h3>
              {tier.recommended ? (
                <span className="shrink-0 rounded-full border border-amber-400/60 bg-amber-200/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                  {digitalRecommended && tier.id === "digital" ? "Instant HD" : FRAMED_HD_RECOMMENDED_BADGE}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm font-semibold text-amber-900">{tier.priceLine}</p>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-neutral-700 sm:text-sm">{tier.detail}</p>
            <Link
              href={tier.href}
              className={`mt-4 inline-flex justify-center rounded-full px-4 py-2.5 text-xs font-semibold transition hover:-translate-y-[1px] ${
                tier.recommended
                  ? "bg-midnight text-white hover:bg-midnight/90"
                  : "border border-amber-300/70 bg-amber-50 text-amber-950 hover:bg-amber-100"
              }`}
            >
              {tier.cta}
            </Link>
          </article>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-neutral-600 sm:text-sm">
        Free preview first. Physical checkout shows shipping before payment. {shippingDisclosure}
      </p>
    </section>
  );
}
