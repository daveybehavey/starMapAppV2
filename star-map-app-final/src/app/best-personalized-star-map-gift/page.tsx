import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

export const metadata: Metadata = {
  title: "Best Personalized Star Map Gift | StarMapCo",
  description:
    "Capture a meaningful moment—the exact night sky from any date and place. Start with a free preview, then choose print or HD digital delivery.",
  alternates: { canonical: `${siteUrl}/best-personalized-star-map-gift` },
  openGraph: {
    title: "Best Personalized Star Map Gift | StarMapCo",
    description:
      "Capture a meaningful moment—the exact night sky from any date and place. Start with a free preview, then choose print or HD digital delivery.",
    url: `${siteUrl}/best-personalized-star-map-gift`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white">
      {children}
    </span>
  );
}

export default function BestPersonalizedStarMapGiftPage() {
  return (
    <main className="min-h-screen bg-[#070b1b] text-white">
      <header className="mx-auto max-w-5xl px-5 pb-10 pt-12 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Best personalized star map gift</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-200 sm:text-base">
          Capture a meaningful moment—the exact night sky from any date and place. Perfect for anniversaries, birthdays,
          weddings, or a heartfelt surprise.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Badge>Free preview</Badge>
          <Badge>Framed &amp; unframed print</Badge>
          <Badge>HD digital delivery</Badge>
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/star-map-generator"
            className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-black/25 transition hover:-translate-y-[1px]"
          >
            Create your star map
          </Link>
          <Link
            href="/star-map-gallery"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Shop bestsellers
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-6 px-5 pb-14 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Why customers choose our maps</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-200">
            <li>Scientifically accurate star positions for any date &amp; location</li>
            <li>Custom text, colors, and styles—design a memory that fits your home</li>
            <li>Secure checkout and instant HD delivery after payment</li>
          </ul>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold">Start with a free preview</p>
            <p className="mt-1 text-sm text-neutral-200">
              Generate a preview first. Upgrade only after the wording and layout feel right.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/editor?mode=quick&source=best-gift-cta-framed&checkout=print&print_variant=poster_framed"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2.5 text-sm font-semibold text-midnight shadow"
              >
                Preview framed print
              </Link>
              <Link
                href="/editor?mode=quick&source=best-gift-cta-digital"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Preview digital
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <Image
              alt="Star map sample"
              src="/images/sample-star-map.jpg"
              width={900}
              height={900}
              className="h-auto w-full"
              priority={false}
            />
          </div>
          <p className="mt-3 text-sm text-neutral-200">
            Popular routes: framed prints for gifting, unframed prints for flexible framing, and HD downloads for instant
            delivery.
          </p>
        </div>
      </section>
    </main>
  );
}

