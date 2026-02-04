import type { Metadata } from "next";
import Link from "next/link";

const title = "Valentine’s Day Star Map Gift Guide | StarMapCo";
const description =
  "This Valentine's Day, give a present that feels cosmic—custom star map art that mirrors the sky from a meaningful moment. Discover ideas, personalization tips, and delivery timing to wow your partner.";
const ogImage = "https://starmapco.com/custom-star-map-anniversary.webp";
const keywords = [
  "valentines day star map",
  "valentine star map gift",
  "custom star map valentines",
  "romantic star map poster",
];

export const metadata: Metadata = {
  title,
  description,
  keywords,
  alternates: { canonical: "https://starmapco.com/blog/valentines-day-star-map" },
  openGraph: {
    title,
    description,
    url: "https://starmapco.com/blog/valentines-day-star-map",
    type: "article",
    publishedTime: "2025-02-01",
    images: [{ url: ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    title,
    description,
    cards: "summary_large_image",
    images: [ogImage],
  },
};

export default function ValentinesStarMapPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: "2025-02-01",
    dateModified: "2025-02-01",
    author: { "@type": "Organization", name: "StarMapCo" },
    image: ogImage,
    publisher: {
      "@type": "Organization",
      name: "StarMapCo",
      logo: { "@type": "ImageObject", url: "https://starmapco.com/favicon.png" },
    },
    mainEntityOfPage: "https://starmapco.com/blog/valentines-day-star-map",
  };

  return (
    <main className="bg-[#050915] px-4 py-12 text-white sm:py-16">
      <article className="mx-auto max-w-4xl space-y-10 font-sans leading-relaxed">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.4em] text-amber-300">Valentine’s Day Gift Ideas</p>
          <h1 className="text-3xl font-bold text-amber-100 sm:text-4xl">
            The romantic way to say “I still see your stars”
          </h1>
          <p className="text-base text-neutral-200 sm:text-lg">{description}</p>
          <div className="space-y-2 text-sm text-neutral-300">
            <p>Perfect for true romantics, nostalgic partners, and anyone who loves a personal story.</p>
            <p>
              <Link href="/star-map-gift" className="font-semibold text-amber-200 underline-offset-4 hover:underline">
                Start designing your Valentine’s Day star map →
              </Link>
            </p>
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Why a star map feels like romance in print</h2>
          <ul className="list-disc space-y-3 pl-5 text-neutral-200">
            <li>
              <strong>It freezes an unforgettable moment:</strong> the exact constellation layout when you first met, kissed,
              or shared a dream.
            </li>
            <li>
              <strong>It's subtle, not flashy:</strong> a thoughtful art piece that fits modern homes and whispers “I’m thinking
              about you.”
            </li>
            <li>
              <strong>It shows effort:</strong> you choose date, time, color palette, and typography to mirror your story.
            </li>
            <li>
              <strong>Instant chemistry with keepsakes:</strong> add coordinates, names, or a short note to make it heirloom-level
              sentimental.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Choose the moment that matters most</h2>
          <p className="text-neutral-200">
            Don’t feel pressured to pick only anniversaries. Romantic star map ideas for Valentine’s Day include:
          </p>
          <div className="grid gap-4 text-sm text-neutral-200 sm:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold text-amber-100">First spark</h3>
              <p>Recreate the evening you first held hands, laughed, or felt the chemistry.</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold text-amber-100">Proposal details</h3>
              <p>Freeze the exact stars above the moment you asked, even if you plan to relive it later.</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold text-amber-100">Milestone night</h3>
              <p>Capture a surprise getaway, last Valentine’s Day, or any sunset you call “ours.”</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold text-amber-100">Custom note</h3>
              <p>If you prefer something new, choose today’s sunset and pair it with a love note for tomorrow.</p>
            </article>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">3 steps to a heart-stopping Valentine’s gift</h2>
          <ol className="list-decimal space-y-4 pl-5 text-neutral-200">
            <li>
              <strong>Pick your date + place.</strong> Exact date, time, and city give the stars their coordinates.
            </li>
            <li>
              <strong>Choose a look that matches your story.</strong> Navy & gold for dramatic romance, warm creams for
              vintage feels, or a minimalist layout for modern lofts.
            </li>
            <li>
              <strong>Add a personal line.</strong> A quote, nickname, or little detail like “We blamed the moon” keeps it
              intimate.
            </li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Personalization that feels handmade</h2>
          <ul className="list-disc space-y-3 pl-5 text-neutral-200">
            <li>Handwritten-style fonts soften the message.</li>
            <li>Mirrored constellations, subtle shimmer, or no frame keeps the focus on the moment.</li>
            <li>Include coordinates, date, or your own “Our stars aligned” line under the map.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">When to order & how to present it</h2>
          <p className="text-neutral-200">
            Orders ship worldwide, but Valentine’s Day weekbooks fill fast. Finish your design by early February, then
            frame it before wrapping. For an in-person reveal, pair the print with a handwritten note or the playlist you
            fell in love to.
          </p>
          <p className="text-sm text-neutral-400">
            Need it in a rush? Digital downloads arrive instantly, so you can email a surprise “Our stars are ready” message
            while unlocking courier shipping for the framed print.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Real love, real proof</h2>
          <blockquote className="rounded-2xl border-l-4 border-amber-300/80 bg-white/5 p-4 text-sm text-neutral-200">
            “We sent a star map for Valentine’s and she cried—said it looked like the exact night the fireworks
            burst. The print still hangs in our kitchen.” — Jordan & Alex
          </blockquote>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-amber-200 sm:text-3xl">Your Valentine’s Day, elevated</h2>
          <p className="text-neutral-200">
            When you want a story-driven gift that lasts, a custom star map brings the romance of the cosmos into your home.
          </p>
          <Link
            href="/star-map-gift"
            className="inline-flex items-center justify-center rounded-full bg-amber-400/90 px-6 py-3 text-sm font-semibold text-[#050915] transition hover:bg-amber-500"
          >
            Build your Valentine’s map
          </Link>
        </section>
      </article>
    </main>
  );
}
