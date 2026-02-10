import Image from "next/image";
import Link from "next/link";
import type { BlogSummary } from "@/lib/blogPosts";
import PromotionSignup from "@/components/PromotionSignup";

type PriceLabels = {
  single: string;
  pack3: string;
  subscription: string;
};

type HomeStaticSectionsProps = {
  priceLabels: PriceLabels;
  blogSummaries: BlogSummary[];
};

const blogDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const formatBlogDate = (date: string) => {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return blogDateFormatter.format(parsed);
};

export default function HomeStaticSections({ priceLabels, blogSummaries }: HomeStaticSectionsProps) {
  const latestPosts = [...blogSummaries]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);
  const useFeaturedBlogLayout = latestPosts.length >= 5;
  const blogGridClassName =
    latestPosts.length <= 1
      ? "grid grid-cols-1 gap-4"
      : latestPosts.length === 2
        ? "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6"
        : "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3";

  return (
    <>
      <section className="content-visibility-auto mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <PromotionSignup />
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
              {
                imageSrc: "/examples/example-birth-classic.webp",
                occasion: "Birth",
                renderMode: "Classic",
                caption: "Toronto, Canada · February 14, 2023",
                badge: "CLASSIC",
              },
              {
                imageSrc: "/examples/example-memorial-blueprint.webp",
                occasion: "Memorial",
                renderMode: "Blueprint",
                caption: "London, UK · November 11, 2018",
                badge: "BLUEPRINT",
              },
              {
                imageSrc: "/examples/example-graduation-luxe.webp",
                occasion: "Graduation",
                renderMode: "Luxe",
                caption: "Boston, USA · May 25, 2024",
                badge: "LUXE",
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
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] lg:items-start">
          <div className="space-y-6 text-midnight">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-500">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Everything you need to know</h2>
              <p className="mt-3 text-sm text-neutral-700 sm:text-base">
                Clear answers about accuracy, customization, and downloads.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-midnight">
                <span>🧭</span> Accuracy & Quality
              </h3>
              <div className="space-y-3">
                {[
                  {
                    q: "How accurate are StarMapCo star maps?",
                    a: "Extremely accurate—using professional astronomy libraries based on skyfield and Yale catalogs for precise star positions.",
                  },
                  {
                    q: "What data sources do you use?",
                    a: "We rely on real astronomical data from trusted sources like the Yale Bright Star Catalog.",
                  },
                  {
                    q: "Does it include planets and constellations?",
                    a: "Yes—planets, optional constellation lines, and labels can all be toggled.",
                  },
                ].map((item, index) => (
                  <details key={item.q} className={`details-enhanced group rounded-2xl border border-amber-200/60 p-4 max-[374px]:py-[1.125rem] ${index % 2 === 0 ? 'bg-white/70' : 'bg-white/60'}`}>
                    <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-midnight sm:text-lg">
                      <span>{item.q}</span>
                      <span className="summary-arrow ml-2 flex-shrink-0 text-amber-600">▼</span>
                    </summary>
                    <p className="mt-3 text-sm text-neutral-700 sm:text-base">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-midnight">
                <span>🎨</span> Customization
              </h3>
              <div className="space-y-3">
                {[
                  {
                    q: "Can I customize text, styles, and shapes?",
                    a: "Yes—add titles, subtitles, or dedications; choose from four styles (navy gold, vintage, parchment, minimal) and shapes (rectangle free, heart/circle/star premium) plus visual modes and constellations.",
                  },
                  {
                    q: "What if I enter the wrong date or location?",
                    a: "Edit inputs anytime before export—the preview updates in real time so you can correct details.",
                  },
                  {
                    q: "Can I try a demo?",
                    a: "Yes—use the demo button to auto-fill a sample moment and preview without payment.",
                  },
                ].map((item, index) => (
                  <details key={item.q} className={`details-enhanced group rounded-2xl border border-amber-200/60 p-4 max-[374px]:py-[1.125rem] ${index % 2 === 0 ? 'bg-white/70' : 'bg-white/60'}`}>
                    <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-midnight sm:text-lg">
                      <span>{item.q}</span>
                      <span className="summary-arrow ml-2 flex-shrink-0 text-amber-600">▼</span>
                    </summary>
                    <p className="mt-3 text-sm text-neutral-700 sm:text-base">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-midnight">
                <span>💰</span> Pricing & Downloads
              </h3>
              <div className="space-y-3">
                {[
                  {
                    q: "What is included in the free version vs. premium unlock?",
                    a: `Free: basic preview and watermarked export. Premium unlocks start at ${priceLabels.single} for an HD download, with 3-packs and unlimited monthly options.`,
                  },
                  {
                    q: "How do I export or download my star map?",
                    a: "After premium unlock, download a high-resolution PNG directly from the app.",
                  },
                  {
                    q: "Is this a one-time purchase or subscription?",
                    a: "Both options are available: one-time HD downloads or an unlimited monthly subscription.",
                  },
                  {
                    q: "Are the maps suitable for printing?",
                    a: "Yes—designed to be print-ready up to 6000x6000 resolution for posters and frames.",
                  },
                  {
                    q: "Can I share my custom star map with others?",
                    a: "Generate and share images or links now; public sharing options are coming soon.",
                  },
                  {
                    q: "Why choose StarMapCo over other star map generators?",
                    a: "Instant real-time preview, accurate science, premium visuals, and flexible pricing for one-time or unlimited access.",
                  },
                ].map((item, index) => (
                  <details key={item.q} className={`details-enhanced group rounded-2xl border border-amber-200/60 p-4 max-[374px]:py-[1.125rem] ${index % 2 === 0 ? 'bg-white/70' : 'bg-white/60'}`}>
                    <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-midnight sm:text-lg">
                      <span>{item.q}</span>
                      <span className="summary-arrow ml-2 flex-shrink-0 text-amber-600">▼</span>
                    </summary>
                    <p className="mt-3 text-sm text-neutral-700 sm:text-base">{item.a}</p>
                  </details>
                ))}
              </div>
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
        </div>
      </section>

      <div className="section-divider my-12 sm:my-14 lg:my-16" />

      <section className="content-visibility-auto cosmic-panel-enhanced cosmic-panel mx-auto w-full max-w-7xl rounded-[28px] px-5 py-10 sm:px-7 sm:py-12 lg:px-10 lg:py-14 fade-in-up visible">
        <div className="space-y-6">
          <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold text-midnight sm:text-4xl">Latest from the Blog</h2>
          <p className="text-base text-neutral-800 sm:text-lg">
            Guides and inspiration for anniversaries, birthdays, and accurate astronomy behind your custom star map.
          </p>
          <div className={`${blogGridClassName} mx-auto w-full stagger-children visible`}>
            {latestPosts.map((post, index) => (
              <article
                key={post.slug}
                className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200/60 bg-white/80 text-midnight shadow-md transition-all duration-300 hover:-translate-y-3 hover:border-amber-300 hover:shadow-[0_30px_60px_rgba(0,0,0,0.2)] ${
                  index === 0 && useFeaturedBlogLayout ? "sm:col-span-2 lg:col-span-1 lg:row-span-2" : ""
                }`}
              >
                <div
                  className={`relative w-full overflow-hidden ${
                    index === 0 && useFeaturedBlogLayout ? "h-40 lg:h-full lg:min-h-[200px]" : "h-32"
                  }`}
                >
                  <Image
                    src="/custom-star-map-anniversary.webp"
                    alt={post.title}
                    fill
                    className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-105"
                    loading="lazy"
                    sizes="(min-width: 1280px) 30vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    quality={70}
                  />
                  {index === 0 && (
                    <div className="absolute left-3 top-3 rounded bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-midnight shadow">
                      Featured
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide sm:text-xs">
                    <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Guide</span>
                    <span className="text-amber-700">{formatBlogDate(post.date)}</span>
                  </div>
                  <h3 className={`mt-2 font-semibold line-clamp-2 ${index === 0 ? "text-lg sm:text-xl" : "text-base sm:text-lg"}`}>
                    <Link href={`/blog/${post.slug}`} className="hover:underline">
                      {post.title}
                    </Link>
                  </h3>
                  <p className={`mt-2 text-sm text-neutral-700 ${index === 0 ? "line-clamp-3" : "line-clamp-2"}`}>{post.description}</p>
                  <div className="mt-auto pt-3">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 transition-colors hover:text-amber-900 hover:underline"
                    >
                      Read more →
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
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
