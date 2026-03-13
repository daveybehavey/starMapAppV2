import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const pageUrl = `${siteUrl}/how-accurate-are-star-maps`;
const title = "How Accurate Are Star Maps? | StarMapCo";
const description =
  "Learn how StarMapCo calculates star maps using real date, time, timezone, location, star catalog data, planets, and Moon phase — plus what can still change the result.";

const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/how-accurate-are-star-maps", label: "How accurate are star maps?" },
];

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: pageUrl },
  openGraph: {
    title,
    description,
    url: pageUrl,
    type: "article",
    images: [{ url: `${siteUrl}/og-default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${siteUrl}/og-default.png`],
  },
};

const faqItems = [
  {
    question: "Are StarMapCo star maps based on real astronomy?",
    answer:
      "Yes. StarMapCo uses real date, time, timezone, latitude, and longitude inputs, then calculates the visible sky with astronomy-engine and bundled star catalog data.",
  },
  {
    question: "What makes a star map more accurate?",
    answer:
      "The biggest accuracy factors are the exact local date, the exact local time, the correct timezone, and a precise location. If one of those is wrong, the sky can shift.",
  },
  {
    question: "Do star maps show the exact stars I would have seen with my eyes?",
    answer:
      "Not perfectly. StarMapCo aims to recreate the correct sky positions, but visibility in real life still depends on weather, light pollution, obstructions, and your local horizon.",
  },
  {
    question: "Can I make a map if I do not know the exact time?",
    answer:
      "Yes. You can still create a meaningful map from the date and place alone. If time is unknown, the result is less exact, but it still gives a strong representation of that night sky.",
  },
  {
    question: "Do StarMapCo maps include planets and the Moon?",
    answer:
      "Yes. When enabled, the renderer calculates visible planets and Moon phase for the selected moment, not just a static star background.",
  },
];

export default function HowAccurateAreStarMapsPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    author: { "@type": "Organization", name: "StarMapCo" },
    publisher: {
      "@type": "Organization",
      name: "StarMapCo",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/favicon.ico`,
      },
    },
    mainEntityOfPage: pageUrl,
    datePublished: "2026-03-13",
    dateModified: "2026-03-13",
    image: `${siteUrl}/og-default.png`,
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
      <article className="mt-4 space-y-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,36,0.92),rgba(6,12,30,0.96))] p-6 text-white shadow-[0_24px_64px_rgba(0,0,0,0.35)] sm:p-8">
        <header className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Authority guide</p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">How accurate are star maps?</h1>
          <p className="mx-auto max-w-3xl text-sm leading-relaxed text-neutral-200 sm:text-base">{description}</p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Input matters</p>
            <p className="mt-2 text-sm text-neutral-100">Date, local time, timezone, and location all affect the sky.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Real calculations</p>
            <p className="mt-2 text-sm text-neutral-100">StarMapCo calculates stars, planets, and Moon phase from astronomy data.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Honest limit</p>
            <p className="mt-2 text-sm text-neutral-100">Weather, light pollution, and obstructions still affect what a person actually saw.</p>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">What “accurate” means for a star map</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            A high-quality star map should place the sky correctly for a specific moment on Earth. That means the design
            is not just decorative. It should reflect the sky for the selected date, the local time at that location,
            the correct timezone, and the viewer&apos;s latitude and longitude.
          </p>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            If any of those inputs are off, the result can shift. Time changes matter because the sky rotates throughout
            the night. Location changes matter because the horizon and visible constellations are different in different
            places.
          </p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">How StarMapCo calculates the sky</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-200 sm:text-base">
            <li>Take your local date, local time, and timezone, then convert that moment correctly into UTC.</li>
            <li>Use the selected latitude and longitude to build the observer position for that moment on Earth.</li>
            <li>Calculate star, planet, and Moon positions using astronomy-engine plus bundled star catalog data.</li>
            <li>Project those visible bodies into the local sky view and render them with your chosen visual style.</li>
            <li>Overlay constellation lines and labels only after the visible sky is already calculated.</li>
          </ol>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">What can still change the real-life view</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-200 sm:text-base">
            <li>Cloud cover or haze</li>
            <li>City light pollution</li>
            <li>Trees, mountains, or buildings blocking the horizon</li>
            <li>Not knowing the exact time of the moment</li>
            <li>Choosing a simplified artistic style with fewer visible stars</li>
          </ul>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            That is why the right promise is not “this is exactly what your eyes saw under every condition.” The right
            promise is that the map is calculated from the correct sky mechanics for your chosen moment, then styled into
            a keepsake.
          </p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">When exact time matters most</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm text-neutral-100">
              <thead>
                <tr className="border-b border-white/10 text-amber-200">
                  <th className="py-2 pr-4">Moment</th>
                  <th className="py-2 pr-4">Time sensitivity</th>
                  <th className="py-2">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4">Proposal, ceremony, first kiss</td>
                  <td className="py-3 pr-4">High</td>
                  <td className="py-3">Use the exact local time if you know it.</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4">Birthday date only</td>
                  <td className="py-3 pr-4">Medium</td>
                  <td className="py-3">Date + location is still meaningful if the time is unknown.</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4">Memorial or long-range historical date</td>
                  <td className="py-3 pr-4">Variable</td>
                  <td className="py-3">Use the closest known time and local timezone for the strongest result.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">Related guides</h2>
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <Link href="/star-map-generator" className="rounded-full border border-white/15 bg-white/8 px-3 py-2 text-amber-100 transition hover:bg-white/12">
              Star map generator
            </Link>
            <Link href="/personalized-star-map" className="rounded-full border border-white/15 bg-white/8 px-3 py-2 text-amber-100 transition hover:bg-white/12">
              Personalized star maps
            </Link>
            <Link href="/wedding" className="rounded-full border border-white/15 bg-white/8 px-3 py-2 text-amber-100 transition hover:bg-white/12">
              Wedding star maps
            </Link>
            <Link href="/how-to-print-star-map" className="rounded-full border border-white/15 bg-white/8 px-3 py-2 text-amber-100 transition hover:bg-white/12">
              Print and frame guide
            </Link>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
          <h2 className="text-xl font-semibold text-white">Try your own date and location</h2>
          <p className="text-sm leading-relaxed text-neutral-100 sm:text-base">
            The fastest way to judge accuracy is to preview a moment you know well. Enter the place, date, and time,
            then compare the result to what you expect from that night.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/editor?mode=quick&source=accuracy-guide"
              className="inline-flex items-center justify-center rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-amber-200"
            >
              Start free preview
            </Link>
            <Link
              href="/blog/astronomy-behind-star-maps"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/12"
            >
              Read the deeper astronomy article
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">FAQ</h2>
          <div className="space-y-3 text-sm text-neutral-200 sm:text-base">
            {faqItems.map((item) => (
              <div key={item.question} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="font-semibold text-white">{item.question}</h3>
                <p className="mt-2">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </article>
      <FaqSchema items={faqItems} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
