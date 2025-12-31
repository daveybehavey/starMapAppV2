import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const title = "Astronomy Behind Star Maps - How Science Makes Them Accurate | StarMapCo Blog";
const description =
  "Curious about the astronomy behind star maps? Explore how real data from catalogs and calculations create precise night sky recreations for custom gifts.";
const ogImage = "https://starmapco.com/custom-star-map-anniversary.webp";
const keywords = ["astronomy behind star maps", "accurate star map data", "custom star map science"];

export const metadata: Metadata = {
  title,
  description,
  keywords,
  openGraph: {
    title,
    description,
    images: [{ url: ogImage }],
  },
  twitter: {
    title,
    description,
    images: [ogImage],
    card: "summary_large_image",
  },
};

export default function AstronomyBehindStarMaps() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: "2025-12-31",
    author: { "@type": "Organization", name: "StarMapCo" },
    image: ogImage,
    publisher: { "@type": "Organization", name: "StarMapCo" },
  };

  return (
    <main className="bg-[#050915] px-4 py-12 text-white sm:py-16">
      <article className="mx-auto max-w-4xl font-sans leading-relaxed">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
        <header className="mb-8 space-y-3">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-300">Accuracy &amp; Science</p>
          <h1 className="text-3xl font-bold text-amber-200 sm:text-4xl">
            Astronomy Behind Star Maps — How Science Makes Them Accurate
          </h1>
          <p className="text-base text-neutral-200 sm:text-lg">{description}</p>
        </header>

        <div className="space-y-8 text-neutral-100">
          <p>
            Star maps blend romance with rigor, and their magic comes from science. Understanding the astronomy behind
            star maps reveals how these custom creations accurately depict the night sky for dates, locations, and times.
          </p>
          <p>
            This article dives into the scientific foundations, key data sources, calculation methods, and why accuracy
            matters for personalized maps.
          </p>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">
              What Is the Astronomy Behind Star Maps?
            </h2>
            <p>
              Star maps use celestial mechanics to show star positions at specific moments. They account for Earth&apos;s
              rotation, orbit, and precession to recreate historical or future skies.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Stellar positions: Appearing to move due to Earth&apos;s rotation/orbit.</li>
              <li>Constellations: Human-defined patterns, overlaid on maps.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Data Sources for Accurate Star Maps</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Yale Bright Star Catalog: 9,000+ stars with positions/magnitudes.</li>
              <li>Hipparcos/Tycho: ESA satellite data for precise parallax and motion.</li>
              <li>
                Astronomy libraries: Tools like astronomy-engine (Skyfield-based) compute positions using ephemerides.
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">How Calculations Work in Star Maps</h2>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Input date/time/location; convert to Julian Date with time-zone adjustment.</li>
              <li>Compute positions (RA/Dec), transform to local horizon (alt/az).</li>
              <li>Account for precession, nutation, aberration of light.</li>
              <li>Render stars by magnitude, add constellations/labels.</li>
            </ol>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">
              Why Accuracy Matters in Custom Star Maps
            </h2>
            <p>Inaccurate maps lose sentimental value; scientific precision ensures authenticity for gifts and education.</p>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-amber-200/40 text-left text-sm text-neutral-100">
                <thead className="bg-[#0f1f3a] text-amber-200">
                  <tr>
                    <th className="p-3">Aspect</th>
                    <th className="p-3">Advanced Star Maps</th>
                    <th className="p-3">Basic Apps</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-amber-200/30">
                    <td className="p-3">Data Depth</td>
                    <td className="p-3">Full catalogs/ephemerides</td>
                    <td className="p-3">Limited stars</td>
                  </tr>
                  <tr className="border-t border-amber-200/30">
                    <td className="p-3">Factors Considered</td>
                    <td className="p-3">Precession, nutation, aberration</td>
                    <td className="p-3">Basic only</td>
                  </tr>
                  <tr className="border-t border-amber-200/30">
                    <td className="p-3">Customization</td>
                    <td className="p-3">High</td>
                    <td className="p-3">Low</td>
                  </tr>
                  <tr className="border-t border-amber-200/30">
                    <td className="p-3">Accuracy</td>
                    <td className="p-3">99.9%+</td>
                    <td className="p-3">Variable</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Common Misconceptions</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Stars “move” daily—actually Earth&apos;s rotation.</li>
              <li>Maps ignore light pollution—they show an ideal dark sky.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Where to Experience Accurate Star Maps</h2>
            <p>
              Choose tools with proven libraries and real catalogs. Ready to see your sky?{" "}
              <Link href="/" className="text-amber-300 hover:underline">
                create your accurate custom star map
              </Link>
              .
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">
              FAQs About the Astronomy Behind Star Maps
            </h2>
            <ol className="space-y-2 pl-5">
              <li>
                <strong>What catalogs are used?</strong> Yale Bright Star and Hipparcos for core star data.
              </li>
              <li>
                <strong>How far back can maps go?</strong> Centuries, accounting for precession.
              </li>
              <li>
                <strong>Do maps include planets?</strong> Advanced ones yes, via ephemerides.
              </li>
              <li>
                <strong>Is precession important?</strong> Yes—over decades it shifts constellations.
              </li>
              <li>
                <strong>Can I verify accuracy?</strong> Compare with tools like Skyfield or observatory data.
              </li>
              <li>
                <strong>Why trust the science?</strong> Based on NASA/ESA data and validated calculations.
              </li>
            </ol>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">
              Conclusion: The Science That Stars Your Story
            </h2>
            <p>
              The astronomy behind star maps turns cosmic data into personal art—ensuring every map is as true as the
              stars themselves.
            </p>
          </section>

          <div className="grid gap-6 sm:grid-cols-2">
            <Image
              src="/blog/astronomy-behind-star-maps/preview.jpg"
              alt="Astronomy behind star maps preview"
              width={900}
              height={650}
              className="w-full rounded-3xl border border-amber-200/70 object-cover shadow-lg"
              loading="lazy"
            />
            <Image
              src="/blog/astronomy-behind-star-maps/chart.jpg"
              alt="Accurate star map data visualization"
              width={900}
              height={650}
              className="w-full rounded-3xl border border-amber-200/70 object-cover shadow-lg"
              loading="lazy"
            />
            <Image
              src="/blog/astronomy-behind-star-maps/schematic.jpg"
              alt="Custom star map science schematic"
              width={900}
              height={650}
              className="w-full rounded-3xl border border-amber-200/70 object-cover shadow-lg"
              loading="lazy"
            />
          </div>
        </div>
      </article>
    </main>
  );
}
