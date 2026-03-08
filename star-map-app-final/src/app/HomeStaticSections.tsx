import Image from "next/image";
import HomeOfferStack from "@/components/HomeOfferStack";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import PromotionSignup from "@/components/PromotionSignup";
import RevenueTrustModule from "@/components/RevenueTrustModule";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";

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
    unframed: formatPrice(printTiers.poster_unframed.amountCents, printTiers.poster_unframed.currency),
    framed: formatPrice(printTiers.poster_framed.amountCents, printTiers.poster_framed.currency),
    digitalAddOn: formatPrice(printDigitalAddOn.amountCents, printDigitalAddOn.currency),
  };

  return (
    <>
      <HomeOfferStack priceLabels={priceLabels} printLabels={printLabels} />

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
            "Single map, 3-pack, or unlimited monthly access",
          ]}
          rightTitle="Print and delivery clarity"
          rightPoints={[
            "Choose digital only, unframed print, or framed print",
            "Shipping cost and delivery estimate are shown before payment",
            "Optional HD digital add-on is available on print orders",
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
              detail: "Your final export is generated from the same design, date, and location shown in the editor.",
            },
            {
              title: "HD watermark-free file",
              detail: "Paid digital exports are high resolution and ready for local poster printing or framing.",
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
          intro="Most buyers only need three things before checkout: confidence in the file, clarity on print delivery, and reassurance that support exists if anything goes wrong."
        />
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="rounded-3xl border border-white/12 bg-white/5 px-5 py-4 text-center text-neutral-200 shadow-sm shadow-black/20 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Delivery now available</p>
          <p className="mt-2 text-sm sm:text-base">
            Instant HD digital download plus physical checkout options: unframed print and ready-to-hang framed print.
          </p>
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-7xl py-12 sm:py-16 lg:py-20 fade-in-up visible">
        <div className="space-y-6 lg:space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">What your map could look like</p>
            <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-white sm:text-4xl">See finished examples before you start</h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              Real outputs from our presets and render modes—so you know exactly what you can create in seconds.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4 md:gap-5 lg:grid-cols-3 lg:gap-6 stagger-children visible">
            {[
              {
                imageSrc: "/examples/example-wedding-cinematic-heart.webp",
                occasion: "Wedding",
                renderMode: "Cinematic",
                caption: "Santorini, Greece · June 21, 2024",
                badge: "CINEMATIC",
              },
              {
                imageSrc: "/examples/example-anniversary-luxe.webp",
                occasion: "Anniversary",
                renderMode: "Luxe",
                caption: "Paris, France · September 15, 2016",
                badge: "LUXE",
              },
              {
                imageSrc: "/examples/example-birthday-classic.webp",
                occasion: "Birthday",
                renderMode: "Classic",
                caption: "Tokyo, Japan · July 7, 1995",
                badge: "CLASSIC",
              },
            ].map((item, idx) => (
              <div
                key={`${item.imageSrc}-${idx}`}
                className="card-hover-glow group overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/30"
              >
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    src={item.imageSrc}
                    alt={`${item.occasion} · ${item.renderMode}`}
                    width={900}
                    height={900}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="h-full w-full object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-105"
                  />
                </div>
                <div className="border-t border-white/10 px-4 py-3 text-white">
                  <div className="flex items-center justify-between text-sm font-semibold leading-tight">
                    <span>
                      {item.occasion} · {item.renderMode}
                    </span>
                    <span className="badge-glow rounded-full border border-amber-300/40 bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-300">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-200 sm:text-base lg:text-[13px] lg:leading-snug">
            A wedding night in Santorini. A birthday in Tokyo. A quiet memorial in London. Every sky is different — just like the moment it represents.
          </p>
        </div>
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
              <div key={step.title} className="glass-panel rounded-2xl border border-white/10 p-6 text-white shadow-lg">
                <div className="mb-4 text-3xl">{step.icon}</div>
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
            <p className="mt-3 text-sm text-neutral-700 sm:text-base">
              Fast clarity on accuracy, delivery, and what buyers actually receive.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                q: "How accurate are StarMapCo star maps?",
                a: "Extremely accurate—using professional astronomy libraries for precise star positions.",
              },
              {
                q: "Can I customize the text and styles?",
                a: "Yes—add titles and dedications, plus multiple styles and constellation options.",
              },
              {
                q: "What does premium unlock include?",
                a: `HD downloads start at ${priceLabels.single}, with 3-packs and unlimited monthly options.`,
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
                a: "Before payment. Shipping rates and delivery estimates are shown inside checkout for physical orders.",
              },
              {
                q: "What if a print arrives damaged?",
                a: "Email support@starmapco.com and we will help resolve the issue.",
              },
            ].map((item) => (
              <div key={item.q} className="rounded-2xl border border-amber-200/60 bg-white/70 p-4">
                <h3 className="text-base font-semibold text-midnight">{item.q}</h3>
                <p className="mt-2 text-sm text-neutral-700">{item.a}</p>
              </div>
            ))}
          </div>
          <div className="pt-2">
            <a
              href="#preview"
              className="cta-gradient inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-midnight shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              Ready to create yours? Start now →
            </a>
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
