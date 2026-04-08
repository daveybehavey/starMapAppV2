import { getPrintAllowedCountries, getPrintAvailabilityBadgeLabel, getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";
import { getBusinessProfile } from "@/lib/businessProfile";
import ResilientImage from "@/components/ResilientImage";
import {
  formatPrintDeliveryEstimate,
  formatPrintShippingEstimate,
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
  proofImages: {
    framed: string;
    unframed: string;
  };
};

export default function HomeOfferStack({ priceLabels, printLabels, proofImages }: HomeOfferStackProps) {
  const printBadgeLabel = getPrintAvailabilityBadgeLabel();
  const supportEmail = getBusinessProfile().email;
  const shippingDisclosure = getPrintShippingDisclosure();
  const printShippingCountry = "US";
  const printShippingCountries = getPrintAllowedCountries();
  const framedShippingLabel = formatPrintShippingEstimate("poster_framed", printShippingCountry, "shipping");
  const unframedShippingLabel = formatPrintShippingEstimate("poster_unframed", printShippingCountry, "shipping");
  const framedDeliveryLabel = formatPrintDeliveryEstimate("poster_framed", printShippingCountry);
  const unframedDeliveryLabel = formatPrintDeliveryEstimate("poster_unframed", printShippingCountry);
  const shippingCountryLabel = getPrintShippingCountryLabel(printShippingCountry);

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
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <article className="brand-dark-card flex h-full flex-col rounded-2xl p-4">
            <div className="relative mb-3 h-28 overflow-hidden rounded-xl border border-white/15 bg-white/10">
              <ResilientImage
                src="/examples/example-anniversary-heirloom.webp"
                fallbackSrc="/examples/example-anniversary-heirloom.png"
                alt="Digital StarMapCo heirloom preview"
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover"
              />
              <span className="absolute bottom-2 left-2 rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                Current render
              </span>
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
            <div className="home-proof-wall home-proof-wall--warm relative mb-3 h-28 overflow-hidden rounded-xl border border-amber-200/45">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.35),rgba(0,0,0,0.06)_75%)]" />
              <div className="absolute inset-[7px] overflow-hidden rounded-[10px] border border-white/45 bg-transparent shadow-[0_9px_16px_rgba(0,0,0,0.22)]">
                <ResilientImage
                  src="/printproof/home/delivery-framed-heart.webp"
                  fallbackSrc={proofImages.framed}
                  alt="Framed StarMapCo print preview"
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                />
              </div>
              <span className="absolute bottom-2 left-2 z-10 rounded-full border border-black/10 bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-midnight">
                Wall-stage mockup
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Framed print</p>
              <span className="rounded-full border border-amber-200/70 bg-amber-200/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                GIFT READY
              </span>
            </div>
            <p className="mt-1 inline-flex w-fit rounded-full border border-amber-300/40 bg-amber-300/16 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
              Premium gift
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-200">Ready-to-hang 14x14 option for the strongest premium gift presentation.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-200">
              <li>Delivered framed and gift-ready</li>
              <li>Most buyers pair this with the HD add-on</li>
              <li>Best-looking premium option for special occasions</li>
              <li>Estimated shipping to {shippingCountryLabel}: {framedShippingLabel}</li>
              <li>Estimated delivery: {framedDeliveryLabel}</li>
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
            <div className="home-proof-wall home-proof-wall--neutral relative mb-3 h-28 overflow-hidden rounded-xl border border-white/18">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.32),rgba(0,0,0,0.08)_78%)]" />
              <div className="absolute inset-[7px] overflow-hidden rounded-[10px] border border-white/45 bg-transparent shadow-[0_9px_16px_rgba(0,0,0,0.2)]">
                <ResilientImage
                  src="/printproof/home/delivery-unframed-classic.webp"
                  fallbackSrc={proofImages.unframed}
                  alt="Unframed StarMapCo poster preview"
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                />
              </div>
              <span className="absolute bottom-2 left-2 z-10 rounded-full border border-black/10 bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-midnight">
                Wall-stage mockup
              </span>
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
              <li>Estimated delivery: {unframedDeliveryLabel}</li>
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

        <div className="brand-dark-card rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Print confidence</p>
          <p className="mt-2 text-[11px] text-neutral-300">
            Shipping estimate baseline for {shippingCountryLabel}: framed {framedShippingLabel}, unframed {unframedShippingLabel}.
            Delivery estimates run about {framedDeliveryLabel} framed and {unframedDeliveryLabel} unframed. Final shipping is still shown before payment for every supported country.
          </p>
          <ul className="mt-2 grid gap-2 text-xs text-neutral-200 sm:grid-cols-2">
            <li>✓ Production starts after manual order review.</li>
            <li>✓ {shippingDisclosure}</li>
            <li>✓ Damage support: {supportEmail}.</li>
            <li>✓ HD digital add-on available for {printLabels.digitalAddOn}.</li>
            <li>✓ {printBadgeLabel} across {printShippingCountries.length} supported countries.</li>
          </ul>
        </div>

        <div className="brand-dark-card rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Digital delivery</p>
              <p className="mt-1 text-[11px] text-neutral-300">For most buyers, the right route is the one-time HD file for this exact map.</p>
            </div>
          </div>
          <div className="mt-3">
            <a
              href="/editor?mode=quick&source=home-plan-single"
              className="block rounded-xl border border-amber-300/55 bg-amber-300/15 px-3 py-3 text-left transition hover:border-amber-300/75 hover:bg-amber-300/20"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Single HD</p>
                <span className="rounded-full border border-amber-200/70 bg-amber-200/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                  DEFAULT
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-amber-200">{priceLabels.single}</p>
              <p className="mt-1 text-[11px] text-amber-100/80">One finished map.</p>
              <p className="mt-3 text-[11px] text-neutral-200">
                Best for fast gifting, local printing later, or buyers who want the clean digital file first.
              </p>
            </a>
          </div>
          <div className="mt-3 rounded-xl border border-white/15 bg-white/6 px-3 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-200">Need more than one HD export later?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-300">
              Extra digital plans stay available after you open the preview, but they are not the default first-purchase route.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-300">
            <p>Print orders can still add the HD file for {printLabels.digitalAddOn}.</p>
            <div className="flex flex-wrap gap-2">
              <a
                href="/star-map-gift-formats"
                className="font-semibold text-amber-200 underline hover:text-amber-100"
              >
                Compare all formats
              </a>
              <a
                href="/shipping"
                className="font-semibold text-amber-200 underline hover:text-amber-100"
              >
                Shipping details
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
