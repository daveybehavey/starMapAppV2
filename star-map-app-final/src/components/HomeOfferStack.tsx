import { getPrintAllowedCountries, getPrintAvailabilityBadgeLabel, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { getPrintFreeShippingOfferLine } from "@/lib/printFreeShipping";
import ResilientImage from "@/components/ResilientImage";
import {
  formatPrintDeliveryDisclosure,
  formatPrintShippingEstimateWithDelivery,
  getPrintShippingCountryLabel,
} from "@/lib/printfulShipping";

type HomeOfferStackProps = {
  priceLabels: {
    single: string;
    pack3: string;
    subscription: string;
    packSavingsPercent: number;
  };
  printLabels: {
    unframed: string;
    framed: string;
    digitalAddOn: string;
  };
};

const OFFER_MOCKUPS = {
  digital: "/home-mockups/offer-digital-hd.png",
  framed: "/home-mockups/offer-framed-print.png",
  unframed: "/home-mockups/offer-unframed-print.png",
} as const;

export default function HomeOfferStack({ priceLabels, printLabels }: HomeOfferStackProps) {
  const printBadgeLabel = getPrintAvailabilityBadgeLabel();
  const shippingDisclosure = getPrintShippingDisclosure();
  const freeShippingOffer = getPrintFreeShippingOfferLine();
  const printShippingCountry = "US";
  const printShippingCountries = getPrintAllowedCountries();
  const framedShippingLabel = formatPrintShippingEstimateWithDelivery("poster_framed", printShippingCountry, "shipping");
  const unframedShippingLabel = formatPrintShippingEstimateWithDelivery("poster_unframed", printShippingCountry, "shipping");
  const framedDeliveryDisclosure = formatPrintDeliveryDisclosure("poster_framed", printShippingCountry);
  const shippingCountryLabel = getPrintShippingCountryLabel(printShippingCountry);
  const shippingCoverageLabel = (() => {
    const count = printShippingCountries.length;
    if (count <= 0) return "Shipping estimates shown before payment";
    return `Shipping estimates for ${count} countries`;
  })();

  return (
    <section
      id="delivery-options"
      className="content-visibility-auto mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8"
    >
      <div className="space-y-7 rounded-3xl border border-amber-300/26 bg-[linear-gradient(180deg,rgba(9,17,40,0.9),rgba(6,12,32,0.95))] p-6 text-white shadow-[0_20px_48px_rgba(0,0,0,0.34)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Choose your format</p>
          <h2 className="text-2xl font-semibold sm:text-3xl">Preview first, then pick how you want it delivered</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-neutral-200 sm:text-base">
            Build the exact sky map first. Then choose instant HD digital, gift-ready framed print, or a lower-cost
            unframed poster.
          </p>
          <div className="grid gap-2 pt-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/12 bg-white/6 px-3 py-2 text-xs text-neutral-100">
              <p className="font-semibold text-amber-200">Fastest route</p>
              <p className="mt-1">HD file unlocks right after payment.</p>
            </div>
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/14 px-3 py-2 text-xs text-amber-100">
              <p className="font-semibold">Highest gift impact</p>
              <p className="mt-1">Framed print stays the premium presentation.</p>
            </div>
            <div className="rounded-xl border border-white/12 bg-white/6 px-3 py-2 text-xs text-neutral-100">
              <p className="font-semibold text-amber-200">Global planning</p>
              <p className="mt-1">{shippingCoverageLabel}.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <article className="brand-dark-card flex h-full flex-col rounded-2xl p-4">
            <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl border border-white/15 bg-[#0a1228]">
              <ResilientImage
                src={OFFER_MOCKUPS.digital}
                fallbackSrc={OFFER_MOCKUPS.digital}
                alt="StarMapCo HD download on laptop and phone"
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover object-center"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Instant digital</p>
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-200">
                Instant
              </span>
            </div>
            <p className="mt-1 inline-flex w-fit rounded-full border border-emerald-300/35 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
              Fastest checkout
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-200">HD file unlocks immediately after payment with no shipping wait.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Up to 6000x6000 PNG</li>
              <li>No watermark on paid export</li>
              <li>Great for local print shops</li>
              <li>No shipping required</li>
            </ul>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[11px] text-neutral-200">
              Best for last-minute gifting, fast turnaround, and buyers who want total print control later.
            </div>
            <a
              href="/editor?mode=quick&source=home-delivery-digital"
              className="mt-auto inline-flex w-full items-center justify-center rounded-full border border-white/25 bg-white/15 px-3.5 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/20"
            >
              Start free preview
            </a>
          </article>

          <article className="brand-dark-card-accent flex h-full flex-col rounded-2xl p-4">
            <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl border border-amber-200/45 bg-[#1a1410]">
              <ResilientImage
                src={OFFER_MOCKUPS.framed}
                fallbackSrc={OFFER_MOCKUPS.framed}
                alt="Framed StarMapCo print in a bedroom setting"
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover object-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Framed print</p>
              <span className="rounded-full border border-amber-200/70 bg-amber-200/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                MOST POPULAR
              </span>
            </div>
            <p className="mt-1 inline-flex w-fit rounded-full border border-amber-300/40 bg-amber-300/16 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
              Premium gift
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-200">Ready-to-hang 14x14 option for the strongest premium gift presentation.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Delivered framed and gift-ready</li>
              <li>Most buyers pair this with the HD add-on</li>
              {freeShippingOffer ? <li>{freeShippingOffer}</li> : null}
              <li>Best-looking premium option for special occasions</li>
              <li>Estimated shipping to {shippingCountryLabel}: {framedShippingLabel}</li>
              {framedDeliveryDisclosure ? <li>{framedDeliveryDisclosure}</li> : null}
              <li>{printLabels.framed}</li>
            </ul>
            <div className="mt-3 rounded-xl border border-amber-300/35 bg-black/15 px-3 py-2 text-[11px] text-amber-100/90">
              Best for the strongest unboxing moment, easier gifting, and buyers who do not want to handle framing.
            </div>
            <a
              href={`/editor?mode=quick&source=home-delivery-print-framed&checkout=print&print_variant=poster_framed&shipping_country=${encodeURIComponent(printShippingCountry)}`}
              className="mt-auto inline-flex w-full items-center justify-center rounded-full border border-amber-300/70 bg-amber-300/25 px-3.5 py-2 text-xs font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/35"
            >
              Preview framed print
            </a>
          </article>

          <article className="brand-dark-card flex h-full flex-col rounded-2xl p-4">
            <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl border border-white/18 bg-[#eceae6]">
              <ResilientImage
                src={OFFER_MOCKUPS.unframed}
                fallbackSrc={OFFER_MOCKUPS.unframed}
                alt="Unframed StarMapCo poster leaning against a wall"
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover object-center"
              />
            </div>
            <span className="mb-1 inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-200">
              Physical saver
            </span>
            <p className="text-sm font-semibold text-white">Unframed print</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-200">Professionally printed 18x18 poster for buyers who already have a frame plan.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Museum-quality poster stock</li>
              <li>Lower-cost physical option</li>
              <li>Estimated shipping to {shippingCountryLabel}: {unframedShippingLabel}</li>
              <li>{printLabels.unframed}</li>
            </ul>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[11px] text-neutral-200">
              Best for physical delivery at a lower price, especially if the buyer already has a frame plan.
            </div>
            <a
              href={`/editor?mode=quick&source=home-delivery-print-unframed&checkout=print&print_variant=poster_unframed&shipping_country=${encodeURIComponent(printShippingCountry)}`}
              className="mt-auto inline-flex w-full items-center justify-center rounded-full border border-amber-300/40 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:border-amber-300/60 hover:bg-white/10"
            >
              Preview unframed print
            </a>
          </article>
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/15 p-4 md:grid-cols-3">
          <div className="space-y-1 text-sm text-neutral-200">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">Fastest path</p>
            <p className="font-semibold text-white">Digital HD</p>
            <p className="text-xs leading-relaxed">Immediate delivery, no shipping, and still usable for local framing later.</p>
          </div>
          <div className="space-y-1 text-sm text-neutral-200">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">Best gift route</p>
            <p className="font-semibold text-white">Framed print</p>
            <p className="text-xs leading-relaxed">Most polished presentation. This is the route to push when the goal is emotional impact.</p>
          </div>
          <div className="space-y-1 text-sm text-neutral-200">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">Best lower-cost physical</p>
            <p className="font-semibold text-white">Unframed poster</p>
            <p className="text-xs leading-relaxed">Keeps physical checkout available without forcing buyers into the premium frame cost.</p>
          </div>
        </div>

        <div className="brand-dark-card rounded-2xl p-4">
          <div className="mb-3 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[minmax(0,190px),1fr] sm:items-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
              Shipping estimate baseline
            </p>
            <p className="text-[11px] text-neutral-300">
              Framed: {framedShippingLabel} · Unframed: {unframedShippingLabel} (shown for {shippingCountryLabel}).
              Final shipping is shown before payment for all supported countries.
            </p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Print confidence</p>
          <ul className="mt-2 grid gap-2 text-xs text-neutral-200 sm:grid-cols-2">
            <li>✓ Production starts after manual order review.</li>
            <li>✓ {shippingDisclosure}</li>
            <li>✓ Damage support: support@starmapco.com.</li>
            <li>✓ HD digital add-on available for {printLabels.digitalAddOn}.</li>
            <li>✓ {printBadgeLabel}</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Need the full comparison?</p>
            <p className="mt-1 text-xs text-neutral-300">
              Compare live digital, framed, and unframed routes before you enter checkout.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/star-map-gift-formats"
              className="inline-flex items-center justify-center rounded-full border border-amber-300/50 bg-amber-300/15 px-3.5 py-2 text-xs font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/22"
            >
              Compare all gift formats
            </a>
            <a
              href="/shipping"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/6 px-3.5 py-2 text-xs font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/10"
            >
              See shipping details
            </a>
          </div>
        </div>

        <div className="brand-dark-card rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Digital HD plans</p>
            <span className="text-[11px] text-neutral-300">Most buyers only need one finished file.</span>
          </div>
          <p className="mt-2 text-xs text-neutral-300">
            Start with the one-time HD checkout unless you know you need multiple exports or ongoing use.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <a
              href="/editor?mode=quick&source=home-plan-single"
              className="rounded-xl border border-amber-300/55 bg-amber-300/15 p-3 text-left transition hover:border-amber-300/75 hover:bg-amber-300/20"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Single HD</p>
                <span className="rounded-full border border-amber-200/70 bg-amber-200/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                  ONE-TIME
                </span>
              </div>
              <p className="text-sm font-semibold text-amber-200">{priceLabels.single}</p>
              <p className="mt-1 text-[11px] text-amber-100/80">Best if you just need this one finished map.</p>
            </a>
            <a
              href="/editor?mode=quick&source=home-plan-pack3"
              className="rounded-xl border border-white/20 bg-white/10 p-3 text-left transition hover:border-amber-300/50 hover:bg-white/15"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">3 HD credits</p>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-neutral-200">
                  REPEAT USE
                </span>
              </div>
              <p className="text-sm font-semibold text-amber-200">
                {priceLabels.pack3}
                {priceLabels.packSavingsPercent > 0 ? ` (${priceLabels.packSavingsPercent}% off)` : ""}
              </p>
              <p className="mt-1 text-[11px] text-neutral-300">Use this if you expect multiple gifts or alternate versions (1 export per credit).</p>
            </a>
            <a
              href="/editor?mode=quick&source=home-plan-subscription"
              className="rounded-xl border border-white/15 bg-white/5 p-3 text-left transition hover:border-white/25 hover:bg-white/10"
            >
              <p className="text-sm font-semibold text-white">Unlimited monthly</p>
              <p className="text-sm font-semibold text-neutral-100">{priceLabels.subscription}/mo</p>
              <p className="mt-1 text-[11px] text-neutral-300">Only for ongoing exports, not most one-off gifts.</p>
            </a>
          </div>
          <p className="text-xs text-neutral-300">
            Physical orders can include the HD digital file add-on for {printLabels.digitalAddOn}.
          </p>
          <a
            href="/star-map-gift-formats"
            className="text-xs font-semibold text-amber-200 underline hover:text-amber-100"
          >
            Explore all gift formats
          </a>
        </div>
      </div>
    </section>
  );
}
