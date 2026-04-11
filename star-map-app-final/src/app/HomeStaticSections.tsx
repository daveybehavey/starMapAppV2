import Link from "next/link";
import FramedProofSection from "@/components/FramedProofSection";
import HomeOfferStack from "@/components/HomeOfferStack";
import PhysicalProductGallerySection from "@/components/PhysicalProductGallerySection";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PromotionSignup from "@/components/PromotionSignup";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { getBusinessProfile } from "@/lib/businessProfile";
import { getFramedProofImage, getUnframedProofImage } from "@/lib/printProofAssets";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";
import {
  formatPrintPriceWithShipping,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";

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

export default function HomeStaticSections({
  priceLabels,
  promoStatus,
  promoCode,
}: HomeStaticSectionsProps) {
  const printTiers = getPrintPricingTiers();
  const printDigitalAddOn = getPrintDigitalAddOnPrice();
  const printLabels = {
    unframed: formatPrintPriceWithShipping(printTiers.poster_unframed.amountCents, printTiers.poster_unframed.currency),
    framed: formatPrintPriceWithShipping(printTiers.poster_framed.amountCents, printTiers.poster_framed.currency),
    digitalAddOn: formatPrice(printDigitalAddOn.amountCents, printDigitalAddOn.currency),
  };
  const supportEmail = getBusinessProfile().email;
  const shippingDisclosure = getPrintShippingDisclosure();
  const proofImages = {
    framed: getFramedProofImage(),
    unframed: getUnframedProofImage(),
  };

  return (
    <>
      <HomeOfferStack priceLabels={priceLabels} printLabels={printLabels} proofImages={proofImages} />
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-30 sm:right-5 sm:left-auto sm:max-w-xs">
        <a
          href="#lower-cost-offer"
          className="pointer-events-auto flex items-center justify-center rounded-full border border-amber-200/70 bg-[linear-gradient(145deg,rgba(255,249,235,0.98),rgba(246,239,224,0.96))] px-4 py-3 text-center text-sm font-semibold text-midnight shadow-[0_18px_45px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(0,0,0,0.28)] sm:px-5"
        >
          Get 50% off your first HD digital map
        </a>
      </div>

      <section
        id="lower-cost-offer"
        className="content-visibility-auto scroll-mt-24 mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
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
            "Most gift buyers start with framed print; unframed stays available if you already have a frame plan",
            shippingDisclosure,
            "Physical orders get a manual quality check before production starts",
            `Optional HD digital add-on is available on print orders for ${printLabels.digitalAddOn}`,
            `If a print arrives damaged, ${supportEmail} handles it`,
          ]}
          guideLabel="See the print and frame guide"
        />
        <WhatYouReceiveModule
          heading="Exactly what you receive"
          intro="This is the handoff from free preview to final purchase, so there is no ambiguity around files, print quality, or timing."
          items={[
            {
              title: "The same map you approved in preview",
              detail: "Your final export is generated from the same design, date, and location shown in the editor.",
            },
            {
              title: "HD watermark-free file",
              detail: "Paid digital exports are high resolution and ready for local poster printing or framing.",
            },
            {
              title: "Physical checkout when you want it",
              detail: `Choose unframed or framed print from the same design without rebuilding your map. ${shippingDisclosure}`,
            },
            {
              title: "Policy and support links before purchase",
              detail: "Print guidance, returns details, and support contact are available before you pay.",
            },
          ]}
        />
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <FramedProofSection sourcePrefix="home-proof" />
        <PhysicalProductGallerySection
          heading="What the physical gift actually looks like"
          intro="Use real framed and unframed proof imagery to judge the finish before you ever enter checkout. These mockups come from current StarMapCo artwork rather than generic stock placeholders."
          sourcePrefix="home-physical-proof"
        />
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto cosmic-panel-enhanced cosmic-panel mx-auto w-full max-w-7xl rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:px-10 lg:py-14 fade-in-up visible">
        <div className="space-y-6 text-midnight">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-500">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Quick answers</h2>
            <p className="mt-3 text-sm text-neutral-800 sm:text-base">
              Fast clarity on accuracy, delivery, and what buyers actually receive.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                q: "How accurate are StarMapCo star maps?",
                a: "They are calculated from real date, time, timezone, and location inputs using astronomy-engine plus bundled star catalog data.",
              },
              {
                q: "What does premium unlock include?",
                a: `After the free preview, you can take the framed route from ${printLabels.framed}, the unframed route from ${printLabels.unframed}, or unlock HD digital from ${priceLabels.single}.`,
              },
              {
                q: "Are the maps print-ready?",
                a: "Yes—high-resolution files designed for poster printing.",
              },
              {
                q: "When do I see shipping cost and delivery timing?",
                a: `${shippingDisclosure} Production starts after order review while manual approval is enabled.`,
              },
              {
                q: "What if a print arrives damaged?",
                a: `Email ${supportEmail} and we will help resolve the issue.`,
              },
            ].map((item) => (
              <div key={item.q} className="rounded-2xl border border-amber-200/70 bg-white/82 p-4 shadow-[0_10px_24px_rgba(14,22,40,0.08)]">
                <h3 className="text-base font-semibold text-midnight">{item.q}</h3>
                <p className="mt-2 text-sm text-neutral-800">{item.a}</p>
              </div>
            ))}
          </div>
          <div className="pt-2">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#preview"
                className="cta-gradient inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-midnight shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                Ready to create yours? Start free preview →
              </a>
              <Link
                href="/how-accurate-are-star-maps"
                className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-white/70 px-5 py-2.5 text-sm font-semibold text-midnight transition hover:-translate-y-1 hover:bg-white"
              >
                Read the accuracy guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-5xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
        <div className="rounded-2xl border border-white/12 bg-white/6 px-4 py-4 text-white/90 shadow-sm shadow-black/20 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">Explore more</p>
              <p className="mt-1 text-xs text-neutral-300">Primary routes for gifts, personalization, and example browsing.</p>
            </div>
            <Link
              href="/star-map-gift-formats"
              className="text-xs font-semibold text-amber-200 underline hover:text-amber-100"
            >
              Compare gift formats
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-100">
            {[
              { href: "/personalized-star-map", label: "Personalized star map" },
              { href: "/star-map-gift", label: "Star map gift" },
              { href: "/anniversary", label: "Anniversary star map" },
              { href: "/wedding", label: "Wedding star map" },
              { href: "/star-map-gallery", label: "Star map gallery" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 transition hover:border-amber-300/50 hover:bg-white/12"
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
