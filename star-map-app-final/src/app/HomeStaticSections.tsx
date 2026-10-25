import type { ReactNode } from "react";
import Link from "next/link";
import FramedProofSection from "@/components/FramedProofSection";
import GoogleRatingsTrust from "@/components/GoogleRatingsTrust";
import GiftFormatLadder from "@/components/GiftFormatLadder";
import HomeOfferStack from "@/components/HomeOfferStack";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PromotionSignup from "@/components/PromotionSignup";
import ResilientImage from "@/components/ResilientImage";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { featuredRenderExamples } from "@/lib/galleryExamples";
import { HOME_MOCKUPS } from "@/lib/homeMockups";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";
import {
  formatPrintPriceWithShipping,
  getFramedHdBundlePriceLine,
  getPrintAvailabilityBadgeLabel,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import {
  getPrintDeliveryTimingFaqAnswerShort,
  getPrintPhysicalOrderSummaryLine,
  getPrintUrgentHdUpsellLine,
} from "@/lib/commerceFacts";
import { getGiftLadderIntro } from "@/lib/moneyPageGiftCheckout";
import { isChristmasLandingInSeason } from "@/lib/christmasCampaign";

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
  packSavingsPercent: number;
};

type HomeStaticSectionsProps = {
  priceLabels: PriceLabels;
  promoStatus?: "success" | "error";
  promoCode?: string;
};

export type HomeFaqItem = {
  id: string;
  q: string;
  a: string;
  aNode?: ReactNode;
};

/**
 * The homepage's single FAQ set. Rendered visibly in "Quick answers" below and
 * reused verbatim for the FAQPage JSON-LD in src/app/page.tsx, so the schema
 * always matches the visible block exactly.
 */
export function buildHomeFaqItems(input: { single: string; framed: string; unframed: string }): HomeFaqItem[] {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim());
  return [
    {
      id: "accuracy",
      q: "How accurate are StarMapCo star maps?",
      a: "StarMapCo uses real date, time, timezone, and location inputs, then calculates the sky with astronomy-engine and bundled star catalog data — including the Moon's phase and the five visible planets, placed exactly as they appeared that night.",
    },
    {
      id: "data-sources",
      q: "What data sources do you use for the night sky?",
      a: "We rely on real astronomical data from trusted sources like the Yale Bright Star Catalog to calculate exact positions for your date, time, and location.",
    },
    {
      id: "customize",
      q: "Can I customize text, styles, and shapes?",
      a: "Yes—add titles, subtitles, or dedications; choose from four styles (Navy & Gold, Vintage Engraving, Parchment Scroll, Midnight Minimal) and five shapes (Rectangle free; Heart, Circle, Star, and Diamond premium), plus visual modes, constellation lines and labels, an optional celestial grid, and a technical ring carrying your date and location. You can also place the Moon — drawn with the phase it showed that night — and the five visible planets, and set your words in 15 fonts, including 10 premium typefaces.",
    },
    {
      id: "premium-unlock",
      q: "What does premium unlock include?",
      a: `After the free preview, you can take the framed route from ${input.framed}, or the unframed route from ${input.unframed}, or unlock HD digital from ${input.single}. Digital packs and subscription stay optional for repeat exports.`,
      aNode: (
        <>
          After the free preview, you can take the framed route from {input.framed}
          <span data-digital-offer>,</span>
          <span data-app-only> or</span> the unframed route from {input.unframed}
          <span data-digital-offer>
            , or unlock HD digital from {input.single}. Digital packs and subscription stay optional for repeat
            exports
          </span>
          .
        </>
      ),
    },
    {
      id: "print-ready",
      q: "Are the maps print-ready?",
      a: "Yes—designed to be print-ready at 6000px wide (up to 6000x9000 depending on the format you choose) for crisp posters and framed gifts.",
    },
    {
      id: "order-printed",
      q: "Can I order a printed or framed version directly?",
      a: printCheckoutEnabled
        ? `Yes. After the free preview, checkout supports framed print (${input.framed}), unframed print (${input.unframed}), and HD digital delivery.`
        : "Physical print checkout is in staged rollout. You can always download a print-ready HD file immediately after payment.",
      aNode: printCheckoutEnabled ? (
        <>
          Yes. After the free preview, checkout supports framed print ({input.framed}), unframed print (
          {input.unframed})<span data-digital-offer>, and HD digital delivery</span>.
        </>
      ) : (
        <>
          Physical print checkout is in staged rollout.
          <span data-digital-offer> You can always download a print-ready HD file immediately after payment.</span>
        </>
      ),
    },
    {
      id: "shipping-timing",
      q: "When do I see shipping cost and delivery timing?",
      a: getPrintDeliveryTimingFaqAnswerShort(),
    },
    {
      id: "export",
      q: "How do I export or download my star map?",
      a: "After premium unlock, download a high-resolution PNG directly from the app.",
    },
    {
      id: "subscription",
      q: "Do I have to subscribe to buy a star map?",
      a: "No. One-time checkout covers framed print, unframed print, or a single HD file. Subscription is optional only for repeat digital exports.",
      aNode: (
        <>
          No. One-time checkout covers framed print, unframed print
          <span data-digital-offer>
            , or a single HD file. Subscription is optional only for repeat digital exports
          </span>
          .
        </>
      ),
    },
    {
      id: "damaged",
      q: "What if a print arrives damaged?",
      a: "Email support@starmapco.com and we will help resolve the issue.",
    },
    {
      id: "wrong-input",
      q: "What if I enter the wrong date or location?",
      a: "Edit inputs anytime before export—the preview updates in real time so you can correct details.",
    },
    {
      id: "share",
      q: "Can I share my custom star map with others?",
      a: "Yes. You can share exported images right away and use private access or referral links from the success/download flow.",
    },
    {
      id: "why-starmapco",
      q: "Why choose StarMapCo over other star map generators?",
      a: "Free live preview, accurate science, and a clear delivery ladder: framed for premium gifting, unframed for lower physical cost, or HD digital for instant access.",
      aNode: (
        <>
          Free live preview, accurate science, and a clear delivery ladder: framed for premium gifting, unframed for
          lower physical cost
          <span data-digital-offer>, or HD digital for instant access</span>.
        </>
      ),
    },
  ];
}

export default function HomeStaticSections({ priceLabels, promoStatus, promoCode }: HomeStaticSectionsProps) {
  const printTiers = getPrintPricingTiers();
  const printDigitalAddOn = getPrintDigitalAddOnPrice();
  const printLabels = {
    unframed: formatPrintPriceWithShipping(
      printTiers.poster_unframed.amountCents,
      printTiers.poster_unframed.currency
    ),
    unframed16: formatPrintPriceWithShipping(
      printTiers.poster_unframed_16x16.amountCents,
      printTiers.poster_unframed_16x16.currency
    ),
    framed: formatPrintPriceWithShipping(
      printTiers.poster_framed.amountCents,
      printTiers.poster_framed.currency
    ),
    digitalAddOn: formatPrice(printDigitalAddOn.amountCents, printDigitalAddOn.currency),
  };
  const printBadgeLabel = getPrintAvailabilityBadgeLabel();
  const christmasInSeason = isChristmasLandingInSeason();
  const shippingDisclosure = getPrintShippingDisclosure();
  const bundlePriceLine = getFramedHdBundlePriceLine();
  const proofImages = {
    framed: HOME_MOCKUPS.framedBedroom,
    unframed: HOME_MOCKUPS.unframedPoster,
  };

  return (
    <>
      <HomeOfferStack priceLabels={priceLabels} printLabels={printLabels} />

      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6 lg:px-8">
        <GiftFormatLadder
          sourcePrefix="home-ladder"
          heading="Pick your gift format"
          intro={getGiftLadderIntro()}
          includeCanvas
          className="shadow-2xl shadow-black/20"
        />
        <p className="mt-3 text-center text-xs text-neutral-300 sm:text-sm">
          <span data-digital-offer>Recommended presentation is framed + HD ({bundlePriceLine}). </span>Browse by
          occasion:{" "}
          <Link
            href="/wedding"
            className="font-semibold text-amber-300 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-200"
          >
            wedding
          </Link>
          ,{" "}
          <Link
            href="/anniversary"
            className="font-semibold text-amber-300 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-200"
          >
            anniversary
          </Link>
          ,{" "}
          <Link
            href="/birthday"
            className="font-semibold text-amber-300 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-200"
          >
            birthday
          </Link>
          ,{" "}
          {christmasInSeason ? (
            <>
              <Link
                href="/christmas-star-map-gift"
                className="font-semibold text-amber-300 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-200"
              >
                christmas
              </Link>
              ,{" "}
            </>
          ) : null}
          <Link
            href="/hd-star-map"
            className="font-semibold text-amber-300 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-200"
          >
            instant HD
          </Link>
          , or{" "}
          <Link
            href="/star-map-for/new-baby"
            className="font-semibold text-amber-300 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-200"
          >
            new baby
          </Link>
          .
        </p>
      </section>

      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <PromotionSignup promoStatus={promoStatus} promoCode={promoCode} />
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <PurchaseTrustPanel
          heading="What happens when you pay"
          intro="The free preview stays available until you are ready. Pay only when the design looks right, then choose how you want it delivered."
          leftTitle="Checkout and access"
          leftPoints={[
            "Secure Stripe checkout on every order",
            "HD file unlocks immediately after successful payment",
            "One-time checkout works for framed print, unframed print, or HD digital delivery",
          ]}
          rightTitle="Print and delivery clarity"
          rightPoints={[
            "Framed print is the premium gift route; unframed stays available if you already have a frame plan",
            shippingDisclosure,
            getPrintPhysicalOrderSummaryLine(),
            getPrintUrgentHdUpsellLine(),
            `Optional HD digital add-on is available on print orders for ${printLabels.digitalAddOn}`,
            "If a print arrives damaged, support@starmapco.com handles it",
          ]}
          guideLabel="See the print and frame guide"
        />
        <WhatYouReceiveModule
          heading="Exactly what you receive"
          intro="This is the handoff from free preview to final purchase, so there is no ambiguity around files, print quality, or timing."
          items={[
            {
              title: "The same map you approved in preview",
              detail:
                "Your final export is generated from the same design, date, and location shown in the editor.",
            },
            {
              title: "HD watermark-free file",
              detail:
                "Paid digital exports are high resolution and ready for local poster printing or framing.",
            },
            {
              title: "Physical checkout when you want it",
              detail: "Choose unframed or framed print from the same design without rebuilding your map.",
            },
            {
              title: "Policy and support links before purchase",
              detail: "Print guidance, returns details, and support contact are available before you pay.",
            },
          ]}
        />
        <RevenueTrustModule
          heading="Remove the last-minute hesitation"
          intro="Before checkout: confidence in the file, clarity on print delivery, and support if anything goes wrong."
        />
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="rounded-3xl border border-white/12 bg-white/5 px-5 py-4 text-center text-neutral-200 shadow-sm shadow-black/20 sm:px-6">
          <p className="text-xs font-semibold tracking-[0.25em] text-amber-300 uppercase">
            Delivery now available
          </p>
          <p className="mt-2 text-sm sm:text-base">
            Preview first, then choose gift-ready framed print<span data-digital-offer>,</span>
            <span data-app-only> or</span> unframed poster
            <span data-digital-offer>, or HD digital delivery</span> from the same design.
          </p>
          <p className="mt-2 text-xs text-neutral-300">{printBadgeLabel}</p>
        </div>
      </section>

      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <FramedProofSection sourcePrefix="home-proof" />
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto fade-in-up visible mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="space-y-6 lg:space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.25em] text-amber-400 uppercase">
              What your map could look like
            </p>
            <h2 className="text-3xl font-semibold text-white max-[374px]:text-[1.65rem] sm:text-4xl">
              See the render and the framed finish before you start
            </h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              A mix of fresh renders and real product mockups, so buyers can judge both the on-screen
              design and the physical gift before checkout.
            </p>
          </div>
          <div className="stagger-children visible grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-4 md:gap-5 lg:gap-6 xl:grid-cols-4">
            {[
              {
                imageSrc: proofImages.framed,
                occasion: "Framed print",
                renderMode: "Mockup",
                caption: "Generated from the same artwork buyers preview before checkout",
                badge: "FRAMED",
                aspectClass: "aspect-[4/3]",
              },
              {
                imageSrc: proofImages.unframed,
                occasion: "Unframed poster",
                renderMode: "Mockup",
                caption: "Lower-cost physical option with the same star map artwork",
                badge: "POSTER",
                aspectClass: "aspect-square",
              },
              ...featuredRenderExamples.map((item) => {
                const [occasion, renderMode] = item.title.split(" · ");
                return {
                  imageSrc: item.src,
                  occasion,
                  renderMode,
                  caption: item.caption,
                  badge: item.badge,
                  aspectClass: "aspect-square",
                };
              }),
            ].map((item, idx) => (
              <div
                key={`${item.imageSrc}-${idx}`}
                className="card-hover-glow group overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/30"
              >
                <div className={`relative ${item.aspectClass} overflow-hidden bg-[#0a1228]`}>
                  <ResilientImage
                    src={item.imageSrc}
                    fallbackSrc={HOME_MOCKUPS.framedBedroom}
                    alt={`${item.occasion} · ${item.renderMode}`}
                    width={900}
                    height={675}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="h-full w-full object-cover transition-all duration-500 group-hover:scale-105 group-hover:brightness-105"
                  />
                </div>
                <div className="border-t border-white/10 px-4 py-3 text-white">
                  <div className="flex items-center justify-between text-sm leading-tight font-semibold">
                    <span>
                      {item.occasion} · {item.renderMode}
                    </span>
                    <span className="badge-glow rounded-full border border-amber-300/40 bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold tracking-wider text-amber-200 uppercase">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-300">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-200 sm:text-base lg:text-[13px] lg:leading-snug">
            Compare the physical product mockups with fresh render examples before you ever reach
            checkout. The goal is simple: no guessing about what the gift will look like.
          </p>
        </div>
      </section>

      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <GoogleRatingsTrust />
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section
        id="how-it-works"
        className="content-visibility-auto fade-in-up visible mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20"
      >
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.25em] text-amber-400 uppercase">How it works</p>
            <h2 className="text-3xl font-semibold text-white max-[374px]:text-[1.65rem] sm:text-4xl">
              From date to finished star map
            </h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              Pick a meaningful moment, see the night sky instantly, personalize, and export a print-ready map
              in minutes.
            </p>
          </div>
          <div className="stagger-children visible relative grid gap-6 md:grid-cols-3 md:gap-8">
            <div className="connecting-line hidden md:block" />

            {[
              {
                icon: "📅",
                title: "Choose your moment",
                desc: "Select a preset or set the exact date, time, and location.",
              },
              {
                icon: "✨",
                title: "Preview instantly",
                desc: "Watch the stars render in real time as you personalize.",
              },
              {
                icon: "🖼️",
                title: "Export & print",
                desc: "Download a high-res file ready for framing or gifting.",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="glass-panel rounded-2xl border border-white/10 p-6 text-white shadow-lg"
              >
                <div className="mb-4 text-3xl">{step.icon}</div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-neutral-200">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto cosmic-panel-enhanced cosmic-panel fade-in-up visible mx-auto w-full max-w-7xl rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:px-10 lg:py-14">
        <div className="text-midnight space-y-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.35em] text-amber-800 uppercase">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Quick answers</h2>
            <p className="mt-3 text-sm text-neutral-800 sm:text-base">
              Fast clarity on accuracy, delivery, and what buyers actually receive.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {buildHomeFaqItems({
              single: priceLabels.single,
              framed: printLabels.framed,
              unframed: printLabels.unframed,
            }).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-amber-200/70 bg-white/82 p-4 shadow-[0_10px_24px_rgba(14,22,40,0.08)]"
              >
                <h3 className="text-midnight text-base font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm text-neutral-800">{item.aNode ?? item.a}</p>
              </div>
            ))}
          </div>
          <div className="pt-2">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#preview"
                className="cta-gradient text-midnight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                Ready to create yours? Start free preview →
              </a>
              <Link
                href="/how-accurate-are-star-maps"
                className="text-midnight inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-white/70 px-5 py-2.5 text-sm font-semibold transition hover:-translate-y-1 hover:bg-white"
              >
                Read the accuracy guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
        <div className="text-midnight rounded-3xl border border-amber-200/60 bg-white/80 p-6 shadow-md sm:p-8">
          <p className="text-xs font-semibold tracking-[0.25em] text-amber-800 uppercase">Explore more</p>
          <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Popular star map destinations</h2>
          <p className="mt-3 text-sm text-neutral-700 sm:text-base">
            Jump straight to gift, poster, and instant star map generator pages.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
            {[
              { href: "/hd-star-map", label: "Instant HD star map" },
              { href: "/star-map-generator", label: "Star map generator" },
              { href: "/star-map-for", label: "Star map by occasion" },
              { href: "/star-map-in", label: "Star map by city" },
              { href: "/constellation-map", label: "Constellation map" },
              { href: "/custom-night-sky-map", label: "Custom night sky map" },
              { href: "/star-map-poster", label: "Star map poster" },
              { href: "/star-map-gift", label: "Star map gift" },
              { href: "/night-sky-map-gift", label: "Night sky map gift" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
