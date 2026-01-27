"use client";

import Image from "next/image";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Suspense, useEffect, useRef, useState } from "react";
import { blogPosts } from "@/lib/blogPosts";
import { formatPrice, getPricingInfo } from "@/lib/pricing";
import { useInView } from "@/hooks/useInView";

// Lazy load the heavy EditorExperience component to improve initial page load
const EditorExperience = nextDynamic(
  () => import("@/components/EditorExperience").then((mod) => mod.EditorExperience),
  {
    loading: () => (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
          <span className="text-sm text-neutral-400">Loading editor...</span>
        </div>
      </div>
    ),
    ssr: false,
  }
);

export default function HomeClient() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activePriceLabel, setActivePriceLabel] = useState("$0.99");

  // Scroll-triggered animation hooks
  const { ref: examplesRef, isVisible: examplesVisible } = useInView();
  const { ref: howItWorksRef, isVisible: howItWorksVisible } = useInView();
  const { ref: blogRef, isVisible: blogVisible } = useInView();

  useEffect(() => {
    const pricingInfo = getPricingInfo();
    setActivePriceLabel(formatPrice(pricingInfo.activeAmountCents, pricingInfo.currency));
  }, []);

  return (
    <main className="flex flex-col items-center px-6 md:px-8 lg:px-12 py-4 md:py-8 lg:py-0">
      <section className="mx-auto w-full max-w-7xl min-h-screen flex items-center py-12 sm:py-14 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_minmax(340px,1fr)]">
          <div className="space-y-5">
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-[42px]">
              Create a custom star map of the night sky from your most meaningful moment.
            </h1>
            <p className="max-w-2xl text-base text-neutral-200 sm:text-lg">
              Use our star map generator to build accurate constellation maps for weddings, births, anniversaries, and memorials —
              personalized in seconds.
            </p>
            <p className="text-sm text-neutral-300">Designed to be framed, gifted, and kept forever.</p>
            <button
              type="button"
              onClick={() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#d7b56c] via-[#e8c87d] to-[#d7b56c] bg-[length:200%_100%] px-5 py-3 text-sm font-semibold text-[#201a0c] shadow-lg transition-all duration-300 hover:-translate-y-[2px] hover:animate-[shimmer_2s_ease-in-out_infinite] hover:shadow-[0_12px_40px_rgba(215,181,108,0.5)] focus:outline-none focus:ring-2 focus:ring-[#d7b56c]/70 focus:ring-offset-2 active:scale-95 sm:w-auto"
            >
              Start free preview
            </button>
            <p className="text-xs text-neutral-300">One-time unlock {activePriceLabel} • No subscription • Instant download</p>
            <div className="flex flex-wrap gap-3 text-xs text-neutral-200 sm:text-sm">
              {"Instant preview, Print-ready download, One-time unlock".split(", ").map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 shadow-sm shadow-black/20"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="relative" style={{ animation: "float 6s ease-in-out infinite" }}>
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_25px_60px_rgba(0,0,0,0.35)] transition-all duration-500 hover:shadow-[0_30px_70px_rgba(241,194,125,0.25)] hover:animate-[glow-pulse_3s_ease-in-out_infinite]">
              <div className="relative aspect-[2/1] bg-gradient-to-b from-[#0b0f24] via-[#0a0d1c] to-[#05070f]">
                <Image
                  src="/custom-star-map-anniversary.webp"
                  alt="Example star map output"
                  fill
                  className="object-cover transition-transform duration-700 hover:scale-[1.02]"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section ref={examplesRef} className={`mx-auto w-full max-w-7xl py-12 sm:py-14 lg:py-10 fade-in-up ${examplesVisible ? 'visible' : ''}`}>
        <div className="space-y-5 lg:space-y-3">
          <div className="space-y-2 lg:space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">What your map could look like</p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl lg:text-[32px] lg:leading-tight">See finished examples before you start</h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg lg:text-sm lg:leading-snug">
              Real outputs from our presets and render modes—so you know exactly what you can create in seconds.
            </p>
          </div>
          <div className={`grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-2 stagger-children ${examplesVisible ? 'visible' : ''}`}>
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
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:border-amber-400/30 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4),0_0_20px_rgba(241,194,125,0.15)]"
              >
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    src={item.imageSrc}
                    alt={`${item.occasion} · ${item.renderMode}`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    loading="lazy"
                  />
                </div>
                <div className="border-t border-white/10 px-4 py-3 text-white lg:px-3 lg:py-1.5">
                  <div className="flex items-center justify-between text-sm font-semibold leading-tight lg:text-xs">
                    <span>
                      {item.occasion} · {item.renderMode}
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-200 lg:text-[10px]">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-200 lg:mt-0.5 lg:line-clamp-1 lg:text-[10px]">{item.caption}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-200 sm:text-base lg:text-[13px] lg:leading-snug">
            A wedding night in Santorini. A birthday in Tokyo. A quiet memorial in London. Every sky is different — just like the moment it represents.
          </p>
        </div>
      </section>

      <section ref={howItWorksRef} className={`mx-auto w-full max-w-7xl py-12 sm:py-14 lg:py-16 fade-in-up ${howItWorksVisible ? 'visible' : ''}`}>
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">How it works</p>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">From date to finished star map</h2>
            <p className="max-w-3xl text-base text-neutral-200 sm:text-lg">
              Pick a meaningful moment, see the night sky instantly, personalize, and export a print-ready map in minutes.
            </p>
          </div>
          <div className={`grid gap-4 md:grid-cols-3 stagger-children ${howItWorksVisible ? 'visible' : ''}`}>
            {[
              {
                title: "Choose your moment",
                desc: "Select a preset or set the exact date, time, and location.",
              },
              {
                title: "Preview instantly",
                desc: "Accurate astronomy data renders the sky as it truly appeared.",
              },
              {
                title: "Unlock & export",
                desc: "Download a high-resolution, print-ready file with one-time unlock.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="tilt-card rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm shadow-black/20 transition-all duration-300 hover:border-white/20 hover:bg-white/8 hover:shadow-md"
              >
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-neutral-200">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl py-12 sm:py-14 lg:py-16">
        <div className="cosmic-panel rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:px-10">
          <div className="space-y-6 text-neutral-800">
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold text-midnight sm:text-4xl">What Is a Custom Star Map?</h2>
              <p className="text-base leading-relaxed text-neutral-800 sm:text-lg">
                A custom star map (sometimes called a starmap or constellation map) shows the exact night sky from a
                specific date, time, and location. We turn that real sky into a print-ready design you can gift or
                frame. Every map is unique to the moment it represents.
              </p>
              <p className="text-sm text-neutral-700 sm:text-base">
                Need printing help? Read our{" "}
                <Link href="/how-to-print-star-map" className="font-semibold text-amber-700 hover:underline">
                  star map printing guide
                </Link>
                .
              </p>
              <p className="text-sm text-neutral-700 sm:text-base">
                Popular occasions:{" "}
                <Link href="/anniversary" className="font-semibold text-amber-700 hover:underline">
                  Anniversary star maps
                </Link>
                ,{" "}
                <Link href="/birthday" className="font-semibold text-amber-700 hover:underline">
                  Birthday star maps
                </Link>
                ,{" "}
                <Link href="/wedding" className="font-semibold text-amber-700 hover:underline">
                  Wedding star maps
                </Link>
                .
              </p>
              <p className="text-sm text-neutral-700 sm:text-base">
                Popular searches:{" "}
                <Link href="/constellation-map" className="font-semibold text-amber-700 hover:underline">
                  Constellation map
                </Link>
                ,{" "}
                <Link href="/star-map-poster" className="font-semibold text-amber-700 hover:underline">
                  Star map poster
                </Link>
                ,{" "}
                <Link href="/night-sky-map-gift" className="font-semibold text-amber-700 hover:underline">
                  Night sky map gift
                </Link>
                ,{" "}
                <Link href="/star-map-generator" className="font-semibold text-amber-700 hover:underline">
                  Star map generator
                </Link>
                ,{" "}
                <Link href="/star-map-gift" className="font-semibold text-amber-700 hover:underline">
                  Star map gift
                </Link>
                .
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-midnight sm:text-3xl">How StarMapCo Works</h2>
              <ol className="list-decimal space-y-2 pl-5 text-base leading-relaxed text-neutral-800 sm:text-lg">
                <li>Choose the date and location that matter most.</li>
                <li>Preview the sky instantly with accurate star positions.</li>
                <li>Personalize style, shape, and text.</li>
                <li>Unlock and export a high-res, print-ready file.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <EditorExperience variant="quick" editorRef={editorRef} />

      <section id="accuracy" className="cosmic-panel mx-auto mb-8 mt-8 w-full max-w-7xl rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.9)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-4 text-neutral-800">
          <h2 className="text-3xl font-semibold text-midnight sm:text-4xl">Why is this accurate?</h2>
          <details className="group rounded-2xl border border-amber-200/60 bg-white/80 p-4">
            <summary className="cursor-pointer text-base font-semibold text-midnight sm:text-lg">Data Sources</summary>
            <p className="mt-2 text-sm sm:text-base">
              Yale Bright Star Catalog and astronomy-engine (Skyfield-based) for stellar positions across hemispheres.
            </p>
          </details>
          <details className="group rounded-2xl border border-amber-200/60 bg-white/80 p-4">
            <summary className="cursor-pointer text-base font-semibold text-midnight sm:text-lg">Calculations</summary>
            <p className="mt-2 text-sm sm:text-base">
              Precession, time zones, latitude/longitude, and horizon transforms (alt/az) for true-to-time skies.
            </p>
          </details>
          <details className="group rounded-2xl border border-amber-200/60 bg-white/80 p-4">
            <summary className="cursor-pointer text-base font-semibold text-midnight sm:text-lg">Verification</summary>
            <p className="mt-2 text-sm sm:text-base">
              Compare with Stellarium or other planetarium tools—your rendered sky should match within arcminutes.
            </p>
          </details>
        </div>
      </section>

      <section className="cosmic-panel mx-auto mb-8 mt-8 w-full max-w-7xl rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <div className="space-y-6 text-neutral-800">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold text-midnight sm:text-4xl">Frequently Asked Questions</h2>
            <p className="text-base leading-relaxed sm:text-lg">
              Everything you need to know about creating and sharing a custom star map with StarMapCo—accuracy, styling,
              pricing, printing, and more.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                q: "How accurate are StarMapCo custom star maps?",
                a: "Extremely accurate—using professional astronomy libraries based on skyfield and Yale catalogs for precise star positions.",
              },
              {
                q: "What data sources do you use for the night sky?",
                a: "Real astronomical data from trusted sources like the Yale Bright Star Catalog to calculate exact positions for your date, time, and location.",
              },
              {
                q: "Can I customize text, styles, and shapes?",
                a: "Yes—add titles, subtitles, or dedications; choose from four styles (navy gold, vintage, parchment, minimal) and shapes (rectangle free, heart/circle/star premium) plus visual modes and constellations.",
              },
              {
                q: "What is included in the free version vs. premium unlock?",
                a: `Free: basic preview and watermarked export. Premium (${activePriceLabel} one-time): HD no-watermark PNG and advanced visuals.`,
              },
              {
                q: "How do I export or download my star map?",
                a: "After premium unlock, download a high-resolution PNG directly from the app.",
              },
              {
                q: "Is this a one-time purchase or subscription?",
                a: `One-time ${activePriceLabel} unlock per device/browser, stored locally—no subscriptions.`,
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
                q: "What if I enter the wrong date or location?",
                a: "Edit inputs anytime before export—the preview updates in real time so you can correct details.",
              },
              {
                q: "Why choose StarMapCo over other star map generators?",
                a: "Instant real-time preview, accurate science, premium visuals, and an affordable one-time unlock with no subscriptions.",
              },
              {
                q: "Can I try a demo?",
                a: "Yes—use the demo button to auto-fill a sample moment and preview without payment.",
              },
            ].map((item) => (
              <details key={item.q} className="group rounded-2xl border border-amber-200/60 bg-white/70 p-4">
                <summary className="cursor-pointer text-base font-semibold text-midnight sm:text-lg">{item.q}</summary>
                <p className="mt-2 text-sm text-neutral-800 sm:text-base">{item.a}</p>
              </details>
            ))}
            <div className="pt-2">
              <Link
                href="#preview"
                className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
              >
                Ready to create yours? Start now
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section ref={blogRef} className={`cosmic-panel mb-8 mt-8 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.88)] px-5 py-8 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10 fade-in-up ${blogVisible ? 'visible' : ''}`}>
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold text-midnight sm:text-4xl">Latest from the Blog</h2>
          <p className="text-base text-neutral-800 sm:text-lg">
            Guides and inspiration for anniversaries, birthdays, and accurate astronomy behind your custom star map.
          </p>
          <div className={`grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 stagger-children ${blogVisible ? 'visible' : ''}`}>
            {[...blogPosts]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 6)
              .map((post) => (
                <article
                  key={post.slug}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-amber-200/60 bg-white/80 text-midnight shadow-md transition-all duration-300 hover:-translate-y-2 hover:border-amber-300 hover:shadow-[0_25px_50px_rgba(0,0,0,0.15)]"
                >
                  <div className="relative h-24 w-full overflow-hidden sm:h-32">
                    <Image
                      src="/custom-star-map-anniversary.webp"
                      alt={post.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-3 sm:p-4">
                    <div className="text-[10px] uppercase tracking-wide text-amber-700 sm:text-xs">
                      {new Date(post.date).toDateString()}
                    </div>
                    <h3 className="mt-1 text-base font-semibold line-clamp-2 sm:text-lg">
                      <Link href={`/blog/${post.slug}`} className="hover:underline">
                        {post.title}
                      </Link>
                    </h3>
                    <p className="mt-2 hidden line-clamp-2 text-sm text-neutral-700 sm:block">{post.description}</p>
                    <div className="mt-auto pt-3">
                      <Link
                        href={`/blog/${post.slug}`}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 transition-colors hover:text-amber-900 hover:underline sm:text-sm"
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

      <section className="cosmic-panel mb-8 mt-8 rounded-[28px] border border-amber-200/60 bg-[rgba(247,241,227,0.92)] px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:px-7 lg:mb-10 lg:px-10">
        <h3 className="text-xl font-semibold text-midnight sm:text-2xl">Who builds StarMapCo?</h3>
        <p className="mt-2 text-sm text-neutral-800 sm:text-base">
          Built by an independent developer passionate about astronomy. Accuracy-first design with no subscriptions—just
          real sky data for meaningful maps.
        </p>
        <p className="mt-1 text-xs font-semibold text-neutral-700">
          Early access: We're building reviews organically based on real customer experiences.
        </p>
      </section>
    </main>
  );
}
