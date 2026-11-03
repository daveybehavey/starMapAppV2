import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import ResilientImage from "@/components/ResilientImage";
import { Card } from "@/components/ui/Card";
import { HOME_MOCKUPS } from "@/lib/homeMockups";
import { PRINT_CATALOG, type PrintVariant } from "@/lib/printCatalog";
import { getPrintFreeShippingOfferLine } from "@/lib/printFreeShipping";
import { formatPrice } from "@/lib/pricing";

// Read the real Pacific date per request; campaign query parameters cannot change this copy.
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/black-friday", label: "Black Friday" },
];
const title = "Black Friday Star Map Gifts | StarMapCo";
const description =
  "Plan your Black Friday star map gift. Explore our physical catalogue, prices, and Christmas order-by dates. Up to 25% off prints with BLACKFRIDAY25, Nov 27–Dec 2.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/black-friday` },
  openGraph: {
    title,
    description,
    url: `${siteUrl}/black-friday`,
    type: "website",
    images: [{ url: `${siteUrl}${HOME_MOCKUPS.framedBedroom}` }],
  },
};

const productImages: Record<PrintVariant, string> = {
  poster_unframed: HOME_MOCKUPS.unframedPoster,
  poster_unframed_16x16: HOME_MOCKUPS.unframedPoster,
  poster_framed: HOME_MOCKUPS.framedBedroom,
  canvas_wrap: "/printproof/canvas-printful.jpg",
  mug_11oz: "/printproof/gift-raw/mug/mug-printful.jpg",
  card_4x6: "/printproof/gift-raw/card/card-mockup.jpg",
};

const primaryCta =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300";

export default function BlackFridayPage() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const earlyChristmasOffer = today >= "2026-11-01" && today < "2026-11-27";
  // Real-clock phases only: before Nov 27 the code is upcoming (never live
  // today), Nov 27–Dec 2 it is live, after Dec 2 the campaign is over.
  const blackFridayOffer =
    today >= "2026-11-27" && today <= "2026-12-02"
      ? "BLACKFRIDAY25 is live now: up to 25% off prints through Dec 2, 2026."
      : today < "2026-11-27"
        ? "BLACKFRIDAY25 (up to 25% off prints) activates Nov 27, 2026 and runs through Dec 2."
        : null;
  // Canonical offer line: the $89 threshold is a USD merchandise subtotal in
  // both markets (checkout judges the USD mirror subtotal), so the page must
  // not present it as a native-currency figure next to the CAD prices.
  const freeShippingOfferLine = getPrintFreeShippingOfferLine();

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 pt-10 pb-12 sm:px-6 sm:pt-14">
      <header className="space-y-5 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo · Christmas 2026</p>
        <h1 className="text-4xl font-bold text-white sm:text-5xl">A meaningful night. A memorable gift.</h1>
        <p className="text-xl font-semibold text-amber-200">Black Friday star map gifts</p>
        <p className="mx-auto max-w-2xl text-neutral-200">
          Turn a first date, wedding night, or birthday sky into a personal keepsake. Start with a free
          preview, then choose your physical gift.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="#catalogue" className={primaryCta}>
            Explore the catalogue
          </Link>
          <Link
            href="/editor?mode=quick&source=black-friday-preview"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-full border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            Create a free preview
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="offers-heading"
        className="text-midnight rounded-3xl border border-amber-200/40 bg-amber-50/90 p-6 shadow-xl shadow-black/10"
      >
        <h2 id="offers-heading" className="text-2xl font-semibold">
          Plan your Black Friday gift
        </h2>
        {earlyChristmasOffer ? (
          <p className="mt-3 text-lg font-semibold" data-testid="current-offer">
            Available now: 15% off prints with code XMAS15.
          </p>
        ) : null}
        {blackFridayOffer ? (
          <p className="mt-3 text-base" data-testid="blackfriday-offer">
            {blackFridayOffer}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-neutral-700">
          Seasonal codes apply to prints only; HD digital is excluded. Enter your code at checkout. Catalogue
          prices below are shown before discounts. Shipping and taxes are shown at checkout.
        </p>
        {freeShippingOfferLine ? <p className="mt-3 font-semibold">{freeShippingOfferLine}</p> : null}
      </section>

      <section id="catalogue" aria-labelledby="catalogue-heading" className="scroll-mt-28">
        <h2 id="catalogue-heading" className="text-2xl font-semibold text-white">
          Choose your keepsake
        </h2>
        <p className="mt-2 text-sm text-neutral-200">
          Compare catalogue prices in USD and CAD. Customize your map before you buy.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRINT_CATALOG.map((product) => (
            <article key={product.id} data-print-variant={product.id} className="flex">
              <Card variant="light" padding="none" className="flex w-full flex-col overflow-hidden">
                <div className="relative aspect-[4/3] bg-white">
                  <ResilientImage
                    src={productImages[product.id]}
                    fallbackSrc={productImages[product.id]}
                    alt={`Example personalized star map: ${product.labelFallback}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-contain"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <h3 className="text-midnight text-lg font-semibold">{product.labelFallback}</h3>
                  <p className="font-semibold text-amber-900">
                    {formatPrice(product.priceFallbackCents, "USD")}
                    <span className="mt-1 block text-sm">
                      {formatPrice(product.priceCadFallbackCents, "CAD")}
                    </span>
                  </p>
                  <Link
                    href={`/editor?mode=quick&source=black-friday-${product.id}&checkout=print&print_variant=${product.id}`}
                    prefetch={false}
                    className={`${primaryCta} mt-auto`}
                  >
                    Customize {product.labelFallback}
                  </Link>
                </div>
              </Card>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="order-by-heading"
        className="text-midnight rounded-3xl border border-amber-200/40 bg-amber-50/90 p-5 sm:p-6"
      >
        <h2 id="order-by-heading" className="text-2xl font-semibold">
          Christmas order-by dates
        </h2>
        <p className="mt-2 text-sm text-neutral-700">Plan ahead for your 2026 Christmas gift.</p>
        {/* Operator-verified campaign dates. Keep separate from the shared table,
            which includes digital delivery copy and a different US poster cutoff. */}
        <table className="mt-5 w-full text-left text-sm" data-testid="black-friday-order-by">
          <caption className="sr-only">Christmas 2026 order-by dates for framed prints and posters</caption>
          <thead className="border-b border-amber-300">
            <tr>
              <th scope="col" className="py-3 pr-3">
                Product / destination
              </th>
              <th scope="col" className="py-3">
                Order by
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200">
            <tr>
              <th scope="row" className="py-3 pr-3 font-medium">
                Framed print · Canada
              </th>
              <td className="py-3">Dec 3</td>
            </tr>
            <tr>
              <th scope="row" className="py-3 pr-3 font-medium">
                Framed print · US
              </th>
              <td className="py-3">Dec 8</td>
            </tr>
            <tr>
              <th scope="row" className="py-3 pr-3 font-medium">
                Posters
              </th>
              <td className="py-3">Dec 10</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-neutral-700">
          Buffered estimates for standard shipping, not guarantees.
        </p>
        <Link
          href="/shipping"
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-900 underline"
        >
          Read the shipping policy
        </Link>
      </section>

      <footer className="space-y-4 text-center">
        <h2 className="text-2xl font-semibold text-white">Start with the sky you share</h2>
        <p className="text-neutral-200">Choose a date and place, then make the design your own.</p>
        <Link href="/editor?mode=quick&source=black-friday-footer" prefetch={false} className={primaryCta}>
          Preview your star map
        </Link>
      </footer>
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
