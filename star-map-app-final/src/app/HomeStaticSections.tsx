import Image from "next/image";
import PromotionSignup from "@/components/PromotionSignup";
import { formatPrice, getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
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
      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <PromotionSignup promoStatus={promoStatus} promoCode={promoCode} />
      </section>

      <section className="content-visibility-auto mx-auto w-full max-w-7xl px-4 pb-2 sm:px-6 lg:px-8">
        <div className="space-y-4 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-6 text-white shadow-lg shadow-black/30">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Physical print checkout</p>
            <h2 className="text-2xl font-semibold sm:text-3xl">Get your star map printed or framed</h2>
            <p className="text-sm text-neutral-200 sm:text-base">
              Choose your exact map in the editor, then checkout with physical delivery options.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-sm font-semibold text-white">Unframed print</p>
              <p className="mt-1 text-xs text-neutral-200">Best for custom frame choices</p>
              <p className="mt-2 text-sm font-semibold text-amber-200">{printLabels.unframed}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-sm font-semibold text-white">Framed print</p>
              <p className="mt-1 text-xs text-neutral-200">Ready-to-display physical gift</p>
              <p className="mt-2 text-sm font-semibold text-amber-200">{printLabels.framed}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-sm font-semibold text-white">Digital add-on</p>
              <p className="mt-1 text-xs text-neutral-200">Add the HD file to physical orders</p>
              <p className="mt-2 text-sm font-semibold text-amber-200">+ {printLabels.digitalAddOn}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/editor?mode=quick&source=home-static-print-unframed"
              className="rounded-full border border-amber-300/60 bg-amber-200/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-200/30"
            >
              Start unframed print
            </a>
            <a
              href="/editor?mode=quick&source=home-static-print-framed"
              className="rounded-full border border-amber-300/60 bg-amber-300/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/30"
            >
              Start framed print
            </a>
            <a
              href="/how-to-print-star-map"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/15"
            >
              Print and frame guide
            </a>
          </div>
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-lg shadow-black/30">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Explore by occasion</p>
            <h2 className="text-2xl font-semibold sm:text-3xl">Find the perfect custom star map</h2>
            <p className="text-sm text-neutral-200 sm:text-base">
              Browse by intent and style — star map gifts, constellation maps, and poster-ready downloads.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-amber-100">
            {[
              { href: "/star-map-generator", label: "Star map generator" },
              { href: "/star-map-for", label: "Star map by occasion" },
              { href: "/star-map-poster", label: "Star map poster" },
              { href: "/constellation-map", label: "Constellation map" },
              { href: "/custom-night-sky-map", label: "Custom night sky map" },
              { href: "/night-sky-map-gift", label: "Night sky map gift" },
              { href: "/anniversary", label: "Anniversary star map" },
              { href: "/birthday", label: "Birthday star map" },
              { href: "/wedding", label: "Wedding star map" },
              { href: "/personalized-star-map", label: "Personalized star map" },
              { href: "/star-map-gift", label: "Star map gift" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 transition hover:border-amber-300/60 hover:bg-amber-300/10"
              >
                {link.label}
              </a>
            ))}
          </div>
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
              Fast clarity on accuracy, customization, and downloads.
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
