import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const title = "Custom Star Maps for Weddings: How to Capture Your Night Sky | StarMapCo Blog";
const description =
  "Learn how to create a personalized star map for your wedding day, from choosing the exact time and location to styling and printing a keepsake-worthy design.";
const ogImage = "https://starmapco.com/custom-star-map-anniversary.webp";
const keywords = [
  "custom star map wedding",
  "wedding night sky map",
  "personalized wedding star map",
];

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

export default function WeddingsPostPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: "2024-06-01",
    author: { "@type": "Organization", name: "StarMapCo" },
    image: ogImage,
    publisher: { "@type": "Organization", name: "StarMapCo" },
  };

  return (
    <main className="bg-[#050915] px-4 py-12 text-white sm:py-16">
      <article className="mx-auto max-w-4xl font-sans leading-relaxed">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
        <header className="mb-8 space-y-3">
          <p className="text-sm uppercase tracking-[0.25em] text-amber-300">Weddings</p>
          <h1 className="text-3xl font-bold text-amber-200 sm:text-4xl">
            Custom Star Maps for Weddings: How to Capture Your Night Sky
          </h1>
          <p className="text-base text-neutral-200 sm:text-lg">{description}</p>
        </header>

        <div className="space-y-8 text-neutral-100">
          <p>
            Your wedding night sky is a one-of-a-kind snapshot in time. A custom star map preserves the exact positions
            of constellations, stars, and even planets for your ceremony or reception—creating a keepsake that is both
            scientific and sentimental.
          </p>
          <p>
            In this guide, you&apos;ll learn how to pick the perfect moment and location, choose styles that match your
            aesthetic, personalize wording, and export a print-ready file that looks stunning on the wall.
          </p>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">
              Pick the Perfect Moment and Location
            </h2>
            <p>
              Set your map to the precise date, time, and venue coordinates. Even a few minutes can shift the layout of
              constellations, so match the moment you said “I do,” your first dance, or the sparkler exit. For
              destination weddings, capture the city or venue address; for outdoor ceremonies, use exact latitude and
              longitude.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Use the ceremony start or first dance for emotional resonance.</li>
              <li>Double-check time zones—local venue time keeps accuracy.</li>
              <li>Confirm coordinates via maps/GPS to lock in the horizon correctly.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">
              Choose a Style That Fits Your Wedding Aesthetic
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Navy &amp; Gold:</strong> Luxe, editorial feel that pairs with formal suites and gilded frames.
              </li>
              <li>
                <strong>Vintage Engraving:</strong> Linework and etched textures for classic or heritage themes.
              </li>
              <li>
                <strong>Minimal:</strong> Clean, gallery-ready layouts that spotlight your names and date.
              </li>
              <li>
                <strong>Warm Parchment:</strong> Romantic, soft tones that pair well with rustic or outdoor settings.
              </li>
            </ul>
            <p>Match the style to your invitations, décor palette, or frame choice for a cohesive look.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Add Personal Wording</h2>
            <p>
              Include your names, wedding date, venue, or a favorite lyric. Align the text to the negative space of the
              sky shape (rectangle, circle, heart) and test a soft glow or subtle shadow for legibility on darker skies.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Names + date + venue</li>
              <li>A line from vows or your first dance song</li>
              <li>Coordinates for a minimalist, modern feel</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Export and Frame</h2>
            <p>
              Download a high-resolution file for printing (6000px recommended). Pair with a matted frame in warm wood
              or black to keep focus on the map. For digital sharing, export a watermark preview to post on social or
              send to guests.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-amber-200/40 text-left text-sm text-neutral-100">
                <thead className="bg-[#0f1f3a] text-amber-200">
                  <tr>
                    <th className="p-3">Step</th>
                    <th className="p-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-amber-200/30">
                    <td className="p-3">Resolution</td>
                    <td className="p-3">6000px+ for poster-quality prints</td>
                  </tr>
                  <tr className="border-t border-amber-200/30">
                    <td className="p-3">Format</td>
                    <td className="p-3">PNG for digital; PDF for printers</td>
                  </tr>
                  <tr className="border-t border-amber-200/30">
                    <td className="p-3">Frame</td>
                    <td className="p-3">Warm wood or black; add matting for contrast</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Common Mistakes to Avoid</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Using the wrong time zone (always use local venue time)</li>
              <li>Forgetting to check spelling of names/venue</li>
              <li>Exporting too small for large prints</li>
              <li>Not previewing contrast (light text on light backgrounds)</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">FAQs for Wedding Star Maps</h2>
            <ol className="space-y-2 pl-5">
              <li>
                <strong>How accurate are the maps?</strong> They use professional astronomy libraries (Skyfield/Yale
                catalogs) for precise star positions at your exact date/time/location.
              </li>
              <li>
                <strong>Can we add our vows or song lyrics?</strong> Yes—add custom text, coordinates, and shapes like a
                heart or circle.
              </li>
              <li>
                <strong>Is this a one-time purchase?</strong> Yes—premium unlock is a one-time $9.99 per device/browser.
              </li>
              <li>
                <strong>Is it print-ready?</strong> Yes—export up to 6000x6000 for posters and frames.
              </li>
              <li>
                <strong>Can we share it digitally?</strong> Export watermarked previews or HD files for social and
                family sharing.
              </li>
            </ol>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">
              Create Your Wedding Star Map Today
            </h2>
            <p>
              Capture the sky from your ceremony, first dance, or proposal. Start your map now and{" "}
              <Link href="/" className="text-amber-300 hover:underline">
                create your custom wedding star map
              </Link>{" "}
              in minutes.
            </p>
          </section>

          <div className="grid gap-6 sm:grid-cols-2">
            <Image
              src="/blog/custom-star-maps-for-weddings/preview.jpg"
              alt="Custom star map for wedding night sky"
              width={900}
              height={650}
              className="w-full rounded-3xl border border-amber-200/70 object-cover shadow-lg"
              loading="lazy"
            />
            <Image
              src="/blog/custom-star-maps-for-weddings/first-dance.jpg"
              alt="Wedding first dance star map keepsake"
              width={900}
              height={650}
              className="w-full rounded-3xl border border-amber-200/70 object-cover shadow-lg"
              loading="lazy"
            />
            <Image
              src="/blog/custom-star-maps-for-weddings/style.jpg"
              alt="Styled custom star map for wedding décor"
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
