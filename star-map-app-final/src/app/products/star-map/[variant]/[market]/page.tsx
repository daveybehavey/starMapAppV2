import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import {
  formatPrintPriceWithShipping,
  getPrintProductionReviewDisclosure,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { getPrintFreeShippingThresholdCents } from "@/lib/printFreeShipping";
import { isSecondCopyEligibleVariant } from "@/lib/printCatalog";
import { resolveSecondCopyOfferVisibility } from "@/lib/secondCopyOffer";
import SecondCopyOfferNote from "@/components/SecondCopyOfferNote";
import {
  VARIANT_PAGE_MANIFEST,
  buildVariantPageMetadata,
  buildVariantPagePath,
  buildVariantProductSchema,
  parseVariantPageParams,
  resolveVariantOffer,
} from "@/lib/variantPages";

/**
 * Merchant Center variant landing page — one exact variant in one
 * market, price resolved server-side from checkout's own pricing
 * helpers (`src/lib/variantPages.ts`). This route is the Phase B feed
 * `link` target.
 *
 * force-dynamic, never ISR: the price in this HTML must be the price
 * checkout charges right now. A cached render could serve yesterday's
 * price while checkout — reading live env in the same Worker — already
 * charges today's. The funnel page's `revalidate = 0` is the in-repo
 * precedent for no-cache commercial surfaces.
 */
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ variant: string; market: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { variant, market } = await params;
  const parsed = parseVariantPageParams(variant, market);
  if (!parsed) return {};
  const offer = resolveVariantOffer(parsed.slug, parsed.market);
  if (!offer) return {};
  return buildVariantPageMetadata(offer);
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

export default async function VariantLandingPage({ params }: PageProps) {
  const { variant, market } = await params;
  const parsed = parseVariantPageParams(variant, market);
  if (!parsed) notFound();
  const offer = resolveVariantOffer(parsed.slug, parsed.market);
  if (!offer) notFound();

  const otherMarket = parsed.market === "usd" ? "cad" : "usd";
  const otherMarketOffer = resolveVariantOffer(parsed.slug, otherMarket);
  const shippingDisclosure = getPrintShippingDisclosure();
  // Free-shipping eligibility is judged on the USD merchandise subtotal
  // at checkout (route.ts promotionEstimateLineItemsUsd), in BOTH
  // markets — so the page makes no market-currency threshold claim.
  // The single threshold statement lives inside shippingDisclosure,
  // whose offer line is USD-denominated; the pill below claims no amount.
  const freeShippingActive = getPrintFreeShippingThresholdCents() !== null;
  // Lever A note (S55-7): only when this page's exact checkout variant
  // is second-copy eligible and the server-resolved offer visibility is
  // on. The editor handoff preselects this variant, and the editor's
  // purchase panel exposes the second-copy choice for it.
  const showSecondCopyOffer =
    resolveSecondCopyOfferVisibility() && isSecondCopyEligibleVariant(offer.variant);
  const productionReviewDisclosure = getPrintProductionReviewDisclosure();
  const schema = buildVariantProductSchema(offer);

  const breadcrumbs = [
    { href: "/", label: "Home" },
    { href: "/star-map-poster", label: "Star map poster" },
    { href: offer.path, label: offer.title },
  ];

  const siblingRows = VARIANT_PAGE_MANIFEST.filter((row) => row.slug !== offer.slug);

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-12 sm:pt-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
      <section className="content-visibility-auto overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(241,194,125,0.18),transparent_34%),linear-gradient(135deg,rgba(10,18,39,0.96),rgba(7,12,26,0.96))] shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
        <div className="grid gap-0 lg:grid-cols-[1.12fr,0.88fr]">
          <header className="space-y-5 p-6 sm:p-8">
            <Breadcrumbs items={breadcrumbs} className="flex flex-wrap gap-2" />
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold tracking-[0.2em] text-amber-100/85 uppercase">
              <span className="brand-pill rounded-full px-3 py-1">Made to order</span>
              <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
                {offer.sizeLabel}
              </span>
              {freeShippingActive ? (
                <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
                  Free standard shipping on qualifying orders
                </span>
              ) : null}
            </div>
            <div className="space-y-3">
              <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
              <h1 className="max-w-2xl text-3xl font-bold text-white sm:text-4xl">
                {offer.title}
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-white/88 sm:text-base">
                {offer.description}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200/35 bg-amber-300/12 p-5">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-100/80 uppercase">
                Price
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{offer.formattedPrice}</p>
              <p className="mt-2 text-sm text-amber-100/90">
                {formatPrintPriceWithShipping(offer.amountCents, offer.currency)} — the exact{" "}
                {offer.label.toLowerCase()} price charged at checkout for this format.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/78">
                {shippingDisclosure}
              </p>
              {showSecondCopyOffer ? (
                <SecondCopyOfferNote className="text-amber-100/85" />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={offer.editorHref}
                className="text-midnight inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold transition hover:-translate-y-[1px] hover:bg-amber-200"
              >
                Create yours — free preview
              </Link>
              <Link
                href="/star-map-poster"
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/14"
              >
                See all formats
              </Link>
            </div>
            {otherMarketOffer ? (
              <p className="text-xs text-white/70">
                Shopping in {otherMarket === "cad" ? "Canada" : "the United States"}?{" "}
                <Link href={otherMarketOffer.path} className="text-amber-200 underline">
                  See this print priced in {otherMarketOffer.currency} ({otherMarketOffer.formattedPrice})
                </Link>
              </p>
            ) : null}
          </header>

          <aside className="border-t border-white/8 bg-white/6 p-6 lg:border-t-0 lg:border-l">
            <div className="overflow-hidden rounded-[28px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
              <Image
                src={offer.imagePath}
                alt={offer.title}
                width={1200}
                height={1200}
                className="h-auto w-full object-cover"
                priority
              />
            </div>
            {offer.additionalImagePath ? (
              <div className="mt-4 overflow-hidden rounded-[28px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
                <Image
                  src={offer.additionalImagePath}
                  alt={`${offer.title} shown in a room`}
                  width={1200}
                  height={1200}
                  className="h-auto w-full object-cover"
                />
              </div>
            ) : null}
            <ul className="mt-5 space-y-3 text-sm text-white/82">
              <li className="rounded-2xl border border-white/10 bg-white/6 p-4">
                You approve the exact preview in the editor before anything is printed.
              </li>
              <li className="rounded-2xl border border-white/10 bg-white/6 p-4">
                {productionReviewDisclosure}
              </li>
              <li className="rounded-2xl border border-white/10 bg-white/6 p-4">
                Shipping is calculated and shown before payment — no surprises at checkout.
              </li>
            </ul>
          </aside>
        </div>
      </section>

      <nav aria-label="Other star map formats" className="mt-8">
        <h2 className="text-sm font-semibold tracking-[0.18em] text-white/70 uppercase">
          Other formats in {offer.currency}
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {siblingRows.map((row) => {
            const sibling = resolveVariantOffer(row.slug, parsed.market);
            if (!sibling) return null;
            return (
              <li key={row.slug}>
                <Link
                  href={buildVariantPagePath(row.slug, parsed.market)}
                  className="block rounded-2xl border border-white/10 bg-white/6 p-4 transition hover:bg-white/10"
                >
                  <span className="block text-sm font-semibold text-white">{sibling.title}</span>
                  <span className="mt-1 block text-sm text-amber-100/90">
                    {sibling.formattedPrice} · {sibling.sizeLabel}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </main>
  );
}
