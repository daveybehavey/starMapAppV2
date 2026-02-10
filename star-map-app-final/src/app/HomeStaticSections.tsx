import Image from "next/image";
import Link from "next/link";
import PromotionSignup from "@/components/PromotionSignup";

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
  return (
    <>
      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <PromotionSignup promoStatus={promoStatus} promoCode={promoCode} />
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
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 transition hover:border-amber-300/60 hover:bg-amber-300/10"
              >
                {link.label}
              </Link>
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
                    fill
                    className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-105"
                    sizes="(min-width: 1280px) 30vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    loading="lazy"
                    quality={70}
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
            <Link
              href="#preview"
              className="cta-gradient inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-midnight shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              Ready to create yours? Start now →
            </Link>
          </div>
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="rounded-3xl border border-amber-200/60 bg-white/80 p-6 text-midnight shadow-lg shadow-black/15 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">Popular searches</p>
              <h2 className="text-2xl font-semibold sm:text-3xl">Explore star map styles</h2>
              <p className="text-sm text-neutral-700 sm:text-base">
                Jump straight to high-intent pages for gifts, posters, and instant star map generators.
              </p>
              <div className="flex flex-wrap gap-2 text-sm font-semibold text-amber-700">
                {[
                  { href: "/star-map-generator", label: "Star map generator" },
                  { href: "/constellation-map", label: "Constellation map" },
                  { href: "/custom-night-sky-map", label: "Custom night sky map" },
                  { href: "/star-map-poster", label: "Star map poster" },
                  { href: "/star-map-gift", label: "Star map gift" },
                  { href: "/night-sky-map-gift", label: "Night sky map gift" },
                  { href: "/personalized-star-map", label: "Personalized star map" },
                  { href: "/how-to-print-star-map", label: "How to print a star map" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-full border border-amber-200/60 bg-white/70 px-3 py-1.5 transition hover:border-amber-400 hover:bg-amber-50"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">Helpful guides</p>
              <h3 className="text-xl font-semibold sm:text-2xl">Gift ideas & inspiration</h3>
              <p className="text-sm text-neutral-700 sm:text-base">
                Planning a special moment? These guides cover anniversaries, birthdays, weddings, and the astronomy behind your map.
              </p>
              <ul className="space-y-2 text-sm font-semibold text-amber-700">
                {[
                  { href: "/blog/custom-star-map-for-anniversary", label: "Anniversary star map ideas" },
                  { href: "/blog/personalized-star-map-birthday-gift", label: "Birthday star map gifting guide" },
                  { href: "/blog/custom-star-maps-for-weddings", label: "Wedding star map inspiration" },
                  { href: "/blog/valentines-day-star-map", label: "Valentine’s Day star map gifts" },
                  { href: "/blog/astronomy-behind-star-maps", label: "Astronomy behind star maps" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="transition hover:text-amber-900 hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="rounded-3xl border border-amber-200/60 bg-white/80 p-6 text-midnight shadow-md sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-600">From the blog</p>
          <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">More gift guides and inspiration</h2>
          <p className="mt-3 text-sm text-neutral-700 sm:text-base">
            Read the full library of star map gift ideas, printing tips, and astronomy explainers.
          </p>
          <Link
            href="/blog"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-amber-700 transition hover:text-amber-900 hover:underline"
          >
            Browse the blog →
          </Link>
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="cosmic-panel-enhanced cosmic-panel mx-auto mb-10 w-full max-w-7xl rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:mb-14 lg:px-10 lg:py-14">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-5">
          <div className="avatar-gradient flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-2xl">
            👨‍💻
          </div>
          <div>
            <h3 className="text-xl font-semibold text-midnight sm:text-2xl">Built by a solo developer</h3>
            <p className="mt-1 text-sm text-amber-700 sm:text-base">Passionate about astronomy and meaningful gifts</p>
            <p className="mt-3 text-sm text-neutral-800 sm:text-base">
              StarMapCo is built with accuracy-first design, flexible pricing, and real sky data to help you create maps that truly matter.
            </p>
            <p className="mt-2 text-xs font-semibold text-neutral-600">
              🌟 Early access: Building reviews organically based on real customer experiences.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
