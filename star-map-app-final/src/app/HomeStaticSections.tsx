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
            "Most gift buyers start with framed print; unframed stays available if you already have a frame plan",
            shippingDisclosure,
            "Physical orders stay in manual review before production starts",
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

      <section className="content-visibility-auto mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20 fade-in-up visible">
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">How it works</p>
            <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-white sm:text-4xl">From date to finished star map</h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              Pick a meaningful moment, see the night sky instantly, personalize, and export a print-ready map in minutes.
            </p>
          </div>
          <div className="relative grid gap-6 md:grid-cols-3 md:gap-8 stagger-children visible">
            <div className="connecting-line hidden md:block" />

            {[
              {
                step: "01",
                title: "Choose your moment",
                desc: "Select a preset or set the exact date, time, and location.",
              },
              {
                step: "02",
                title: "Preview instantly",
                desc: "Watch the stars render in real time as you personalize.",
              },
              {
                step: "03",
                title: "Export & print",
                desc: "Download a high-res file ready for framing or gifting.",
              },
            ].map((step) => (
              <div key={step.title} className="glass-panel rounded-2xl border border-white/10 p-6 text-white shadow-lg">
                <div className="mb-4 inline-flex rounded-full border border-amber-300/40 bg-amber-300/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                  Step {step.step}
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-neutral-200">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
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
                q: "Can I customize the text and styles?",
                a: "Yes—add titles and dedications, plus multiple styles and constellation options.",
              },
              {
                q: "What does premium unlock include?",
                a: `After the free preview, you can take the framed route from ${printLabels.framed}, the unframed route from ${printLabels.unframed}, or unlock HD digital from ${priceLabels.single}. Digital packs and subscription stay optional for repeat exports.`,
              },
              {
                q: "Are the maps print-ready?",
                a: "Yes—high-resolution files designed for poster printing.",
              },
              {
                q: "Can I order a framed or unframed version directly?",
                a: `Yes—checkout supports unframed prints from ${printLabels.unframed} and framed prints from ${printLabels.framed}.`,
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

      <section className="content-visibility-auto mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 sm:pb-12 lg:px-8">
        <div className="rounded-3xl border border-amber-200/60 bg-white/80 p-6 text-midnight shadow-md sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">Explore more</p>
          <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Popular star map destinations</h2>
          <p className="mt-3 text-sm text-neutral-700 sm:text-base">
            Jump straight to high-intent pages for gifts, posters, and instant star map generators.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
            {[
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
