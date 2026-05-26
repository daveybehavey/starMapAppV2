import type { Metadata } from "next";
import Link from "next/link";
import printproofManifest from "../../../public/printproof/manifest.json";
import upsellCandidates from "../../../data/upsell-candidates.json";
import {
  formatPrintPriceWithShipping,
  getPrintAvailabilityBadgeLabel,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { formatPrice, getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import { parseShopExternalOffers } from "@/lib/shopExternalOffers";
import {
  getMerchPublicDisplayLabel,
  getMerchPublicDisplayPriceCents,
  listMerchFamiliesEnabledForPublicUi,
  type MerchFamilyId,
} from "@/lib/merchCatalog";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

type UpsellCandidate = {
  id: string;
  label: string;
  variantId: number;
  phase: string;
  bundleOnly?: boolean;
  notes?: string;
};

const upsellRows = upsellCandidates as UpsellCandidate[];

function merchShopTeaser(id: MerchFamilyId): string {
  switch (id) {
    case "sticker_kisscut":
      return "Weatherproof kiss-cut stickers — laptops, bottles, and gift bundles.";
    case "magnet_diecut":
      return "Flexible fridge magnets with crisp constellation detail.";
    case "pins_set":
      return "Pin-back buttons with metallic fronts.";
    case "tee_unisex_bc3001":
      return "DTG-printed staple tee; curated sizes and colors.";
    case "hoodie_unisex_g18500":
      return "Midweight hoodie with front print placement.";
    default:
      return "Printed merch fulfilled via Printful.";
  }
}

export const metadata: Metadata = {
  title: "Shop prints & gifts | StarMapCo",
  description:
    "Browse museum-grade star map posters, framed prints, optional stickers and apparel, plus HD digital delivery. Fulfillment via Printful — customize every map in the editor before checkout.",
  alternates: { canonical: `${siteUrl}/shop` },
  openGraph: {
    title: "Shop prints & gifts | StarMapCo",
    description:
    "Browse museum-grade star map posters, framed prints, optional stickers and apparel, plus HD digital delivery. Customize every map in the editor before checkout.",
    url: `${siteUrl}/shop`,
    type: "website",
  },
};

export default function ShopPage() {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
  const printBadge = getPrintAvailabilityBadgeLabel();
  const shippingDisclosure = getPrintShippingDisclosure();
  const printTiers = getPrintPricingTiers();
  const digitals = getPricingTiers();

  const proofImage = (entry?: { localPath?: string; sourceUrl?: string }) =>
    entry?.localPath?.trim() || entry?.sourceUrl?.trim() || "";
  const framedImg =
    proofImage(printproofManifest.catalog?.framed) ||
    proofImage(printproofManifest.mockups?.framed) ||
    proofImage(printproofManifest.framed);
  const unframedImg =
    proofImage(printproofManifest.catalog?.unframed) ||
    proofImage(printproofManifest.mockups?.unframed) ||
    proofImage(printproofManifest.unframed);
  const framedAlt = printproofManifest.catalog?.framed?.label || "Framed star map print preview";
  const unframedAlt = printproofManifest.catalog?.unframed?.label || "Unframed star map poster preview";

  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    (printTiers.poster_framed.currency || "USD").toUpperCase(),
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    (printTiers.poster_unframed.currency || "USD").toUpperCase(),
  );
  const digitalPrice = formatPrice(digitals.single.amountCents, (digitals.single.currency || "USD").toUpperCase());

  const roadmapSkus = upsellRows.filter((row) => row.phase !== "core");
  const partnerOffers = parseShopExternalOffers(process.env.NEXT_PUBLIC_SHOP_EXTERNAL_OFFERS_JSON);
  const merchFamilies = listMerchFamiliesEnabledForPublicUi();

  return (
    <main className="mx-auto min-h-[60vh] w-full max-w-5xl px-4 py-10 text-neutral-900 sm:px-6 lg:py-14">
      <div className="rounded-3xl border border-white/15 bg-white/90 px-5 py-8 shadow-xl shadow-black/10 sm:px-10 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Shop</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-midnight sm:text-4xl">
          Physical prints & instant downloads
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-neutral-700 sm:text-lg">
          Every product starts in the editor so your sky, typography, and occasion lines stay yours. Physical orders ship
          through Printful with manual review before production.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-neutral-700">
          <li className="rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1">{printBadge}</li>
          <li className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">{shippingDisclosure}</li>
          {!printCheckoutEnabled ? (
            <li className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-900">
              Physical checkout is paused — digital HD still available.
            </li>
          ) : null}
        </ul>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-midnight">Ready at checkout</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Tap a card to open the editor with the matching fulfillment path pre-selected.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <article className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="relative aspect-[4/3] bg-neutral-100">
                {framedImg ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote Printful CDN asset
                  <img src={framedImg} alt={framedAlt} className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-lg font-semibold text-midnight">{printTiers.poster_framed.label}</h3>
                <p className="text-sm text-neutral-700">
                  Premium presentation — gift-ready framing matched to our Printful storefront SKU.
                </p>
                <p className="text-base font-semibold text-amber-800">{framedPrice}</p>
                <Link
                  href="/editor?mode=quick&source=shop-framed&checkout=print&print_variant=poster_framed"
                  prefetch={false}
                  className="mt-auto inline-flex justify-center rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-midnight transition hover:bg-amber-400"
                >
                  Customize framed print
                </Link>
              </div>
            </article>

            <article className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="relative aspect-[4/3] bg-neutral-100">
                {unframedImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={unframedImg} alt={unframedAlt} className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-lg font-semibold text-midnight">{printTiers.poster_unframed.label}</h3>
                <p className="text-sm text-neutral-700">
                  Large-format poster print — ideal when you want to frame it locally or keep total cost lower.
                </p>
                <p className="text-base font-semibold text-amber-800">{unframedPrice}</p>
                <Link
                  href="/editor?mode=quick&source=shop-unframed&checkout=print&print_variant=poster_unframed"
                  prefetch={false}
                  className="mt-auto inline-flex justify-center rounded-full border border-amber-400/70 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
                >
                  Customize poster
                </Link>
              </div>
            </article>

            <article className="flex flex-col rounded-2xl border border-neutral-200 bg-gradient-to-br from-indigo-950 via-[#0c1738] to-[#050915] p-4 text-white shadow-sm sm:col-span-2 lg:col-span-1">
              <h3 className="text-lg font-semibold text-white">HD digital export</h3>
              <p className="mt-2 text-sm leading-relaxed text-indigo-100">
                Same editor fidelity — instant download credits for DIY printing, same-night gifting, or international
                delivery without freight.
              </p>
              <p className="mt-3 text-lg font-semibold text-amber-200">{digitalPrice}</p>
              <Link
                href="/editor?mode=quick&source=shop-digital"
                prefetch={false}
                className="mt-auto inline-flex justify-center rounded-full bg-white/95 px-4 py-2.5 text-sm font-semibold text-midnight transition hover:bg-white"
              >
                Start digital map
              </Link>
            </article>
          </div>
        </section>

        {merchFamilies.length ? (
          <section id="merch-beta" className="mt-14 border-t border-neutral-200 pt-10">
            <h2 className="text-xl font-semibold text-midnight">Wearables & small merch (beta)</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Same editor artwork — pick product options after your preview. Shipping appears in Stripe before payment.
              Fulfillment via Printful with manual review on physical orders.
            </p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {merchFamilies.map((family) => {
                const cents = getMerchPublicDisplayPriceCents(family);
                const label = getMerchPublicDisplayLabel(family);
                const priceLine = formatPrice(cents, "USD");
                return (
                  <li
                    key={family.id}
                    className="flex flex-col rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-white p-4 shadow-sm"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Merch beta</p>
                    <p className="mt-2 text-lg font-semibold text-midnight">{label}</p>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-700">{merchShopTeaser(family.id)}</p>
                    <p className="mt-3 text-base font-semibold text-violet-900">{priceLine}+ shipping at checkout</p>
                    <Link
                      href={`/editor?mode=quick&source=shop-merch&merch_family=${encodeURIComponent(family.id)}`}
                      prefetch={false}
                      className="mt-4 inline-flex justify-center rounded-full bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800"
                    >
                      Customize in editor
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {roadmapSkus.length ? (
          <section className="mt-14 border-t border-neutral-200 pt-10">
            <h2 className="text-xl font-semibold text-midnight">More Printful formats on the roadmap</h2>
            <p className="mt-2 text-sm text-neutral-700">
              These SKUs are tracked internally but are not wired into Stripe checkout yet — tell us what you want next.
            </p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {roadmapSkus.map((row) => (
                <li key={row.id} className="rounded-2xl border border-dashed border-amber-300/70 bg-amber-50/40 p-4">
                  <p className="font-semibold text-midnight">{row.label}</p>
                  <p className="mt-1 text-xs font-medium tracking-wide text-neutral-500">
                    {row.phase.startsWith("phase-") ? `Phase ${row.phase.replace(/^phase-/i, "")}` : row.phase} · Variant{" "}
                    {row.variantId}
                  </p>
                  {row.notes ? <p className="mt-2 text-sm text-neutral-700">{row.notes}</p> : null}
                  <Link
                    href={`/contact?topic=shop-roadmap&sku=${encodeURIComponent(row.id)}`}
                    prefetch={false}
                    className="mt-3 inline-flex text-sm font-semibold text-amber-800 underline hover:text-amber-950"
                  >
                    Request this format
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {partnerOffers.length ? (
          <section className="mt-14 border-t border-neutral-200 pt-10">
            <h2 className="text-xl font-semibold text-midnight">Partner picks</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Curated storefront links configured via <code className="rounded bg-neutral-100 px-1 text-xs">NEXT_PUBLIC_SHOP_EXTERNAL_OFFERS_JSON</code>.
            </p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {partnerOffers.map((offer) => (
                <li key={offer.href} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-midnight">{offer.title}</p>
                  <p className="mt-2 text-sm text-neutral-700">{offer.description}</p>
                  <a
                    href={offer.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex text-sm font-semibold text-amber-800 underline hover:text-amber-950"
                  >
                    {offer.cta || "Open listing"}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-14 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-800">
          <p className="font-semibold text-midnight">Fulfillment note</p>
          <p className="mt-2 leading-relaxed">
            Poster and framed SKUs map directly to your configured Printful variants (
            <span className="whitespace-nowrap">unframed {printproofManifest.catalog?.unframed?.variantId ?? "—"}</span>,{" "}
            <span className="whitespace-nowrap">framed {printproofManifest.catalog?.framed?.variantId ?? "—"}</span>
            ). Beta merch (stickers, magnets, pins, apparel) uses Printful catalog variants per selected options. Broader
            roadmap formats (canvas, mugs, cards) still need Stripe prices, margin guards, and fulfillment QA before they
            ship.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/how-to-print-star-map" prefetch={false} className="font-semibold text-amber-800 underline">
              Print guide
            </Link>
            <Link href="/shipping" prefetch={false} className="font-semibold text-amber-800 underline">
              Shipping policy
            </Link>
            <Link href="/returns" prefetch={false} className="font-semibold text-amber-800 underline">
              Returns
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
