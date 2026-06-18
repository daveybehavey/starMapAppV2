import type { Metadata } from "next";
import Link from "next/link";
import FramedProofSection from "@/components/FramedProofSection";
import PreviewStartForm from "@/components/PreviewStartForm";
import PurchaseTrustPanel from "@/components/PurchaseTrustPanel";
import ResilientImage from "@/components/ResilientImage";
import StickyCtaBar from "@/components/StickyCtaBar";
import WhatYouReceiveModule from "@/components/WhatYouReceiveModule";
import { HOME_MOCKUPS } from "@/lib/homeMockups";
import {
  formatPrintPriceWithShipping,
  getPrintAvailabilityBadgeLabel,
  getPrintProductionReviewDisclosure,
  getPrintProductionReviewTrustPoint,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { formatPrintDeliveryDisclosure, formatPrintShippingEstimateWithDelivery } from "@/lib/printfulShipping";
import { formatPrice, getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";
import { parseShopExternalOffers } from "@/lib/shopExternalOffers";
import {
  getMerchPublicDisplayLabel,
  getMerchPublicDisplayPriceCents,
  listMerchFamiliesEnabledForPublicUi,
  type MerchFamilyId,
} from "@/lib/merchCatalog";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

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
  const productionReviewDisclosure = getPrintProductionReviewDisclosure();
  const productionReviewTrustPoint = getPrintProductionReviewTrustPoint();
  const printTiers = getPrintPricingTiers();
  const digitals = getPricingTiers();
  const printShippingCountry = "US";
  const framedShippingDetail = formatPrintShippingEstimateWithDelivery(
    "poster_framed",
    printShippingCountry,
    "shipping",
  );
  const unframedShippingDetail = formatPrintShippingEstimateWithDelivery(
    "poster_unframed",
    printShippingCountry,
    "shipping",
  );
  const framedDeliveryDisclosure = formatPrintDeliveryDisclosure("poster_framed", printShippingCountry);

  const framedPrice = formatPrintPriceWithShipping(
    printTiers.poster_framed.amountCents,
    (printTiers.poster_framed.currency || "USD").toUpperCase(),
  );
  const unframedPrice = formatPrintPriceWithShipping(
    printTiers.poster_unframed.amountCents,
    (printTiers.poster_unframed.currency || "USD").toUpperCase(),
  );
  const digitalPrice = formatPrice(digitals.single.amountCents, (digitals.single.currency || "USD").toUpperCase());

  const partnerOffers = parseShopExternalOffers(process.env.NEXT_PUBLIC_SHOP_EXTERNAL_OFFERS_JSON);
  const merchFamilies = listMerchFamiliesEnabledForPublicUi();

  const canvasPrice = formatPrintPriceWithShipping(
    printTiers.canvas_wrap.amountCents,
    (printTiers.canvas_wrap.currency || "USD").toUpperCase(),
  );
  const mugPrice = formatPrintPriceWithShipping(
    printTiers.mug_11oz.amountCents,
    (printTiers.mug_11oz.currency || "USD").toUpperCase(),
  );
  const canvasShippingDetail = formatPrintShippingEstimateWithDelivery(
    "canvas_wrap",
    printShippingCountry,
    "shipping",
  );
  const mugShippingDetail = formatPrintShippingEstimateWithDelivery("mug_11oz", printShippingCountry, "shipping");

  const stickerFamily = merchFamilies.find((f) => f.id === "sticker_kisscut");
  const stickerPrice = stickerFamily ? formatPrice(getMerchPublicDisplayPriceCents(stickerFamily), "USD") : null;

  const productCards = [
    {
      key: "framed",
      imageSrc: HOME_MOCKUPS.framedBedroom,
      alt: "Framed StarMapCo print in a styled bedroom",
      title: printTiers.poster_framed.label,
      detail: "Premium presentation — gift-ready framing matched to our Printful storefront SKU.",
      price: framedPrice,
      shippingNote: `Est. to U.S.: ${framedShippingDetail}`,
      href: "/editor?mode=quick&source=shop-framed&checkout=print&print_variant=poster_framed",
      cta: "Customize framed print",
      ctaClass:
        "mt-auto inline-flex justify-center rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-midnight transition hover:bg-amber-400",
      darkCard: false,
    },
    {
      key: "unframed",
      imageSrc: HOME_MOCKUPS.unframedPoster,
      alt: "Unframed StarMapCo poster leaning against a wall",
      title: printTiers.poster_unframed.label,
      detail: "Large-format poster print — ideal when you want to frame it locally or keep total cost lower.",
      price: unframedPrice,
      shippingNote: `Est. to U.S.: ${unframedShippingDetail}`,
      href: "/editor?mode=quick&source=shop-unframed&checkout=print&print_variant=poster_unframed",
      cta: "Customize poster",
      ctaClass:
        "mt-auto inline-flex justify-center rounded-full border border-amber-400/70 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-100",
      darkCard: false,
    },
    {
      key: "canvas",
      imageSrc: HOME_MOCKUPS.framedBedroom,
      alt: "Star map canvas gallery wrap mockup",
      title: printTiers.canvas_wrap.label,
      detail: "Gallery-wrap canvas — premium wall art between poster and framed print.",
      price: canvasPrice,
      shippingNote: `Est. to U.S.: ${canvasShippingDetail}`,
      href: "/editor?mode=quick&source=shop-canvas&checkout=print&print_variant=canvas_wrap",
      cta: "Customize canvas",
      ctaClass:
        "mt-auto inline-flex justify-center rounded-full border border-amber-400/70 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-100",
      darkCard: false,
    },
    {
      key: "mug",
      imageSrc: HOME_MOCKUPS.digitalHd,
      alt: "Star map mug gift mockup",
      title: printTiers.mug_11oz.label,
      detail: "Everyday merch gift — not the wedding hero, but great for birthdays and desk gifts.",
      price: mugPrice,
      shippingNote: `Est. to U.S.: ${mugShippingDetail}`,
      href: "/editor?mode=quick&source=shop-mug&checkout=print&print_variant=mug_11oz",
      cta: "Customize mug",
      ctaClass:
        "mt-auto inline-flex justify-center rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-midnight transition hover:bg-neutral-50",
      darkCard: false,
    },
    {
      key: "digital",
      imageSrc: HOME_MOCKUPS.digitalHd,
      alt: "StarMapCo HD download on laptop and phone",
      title: "HD digital export",
      detail:
        "Same editor fidelity — instant download credits for DIY printing, same-night gifting, or international delivery without freight.",
      price: digitalPrice,
      shippingNote: "Delivered instantly after checkout",
      href: "/editor?mode=quick&source=shop-digital",
      cta: "Start digital map",
      ctaClass:
        "mt-auto inline-flex justify-center rounded-full bg-midnight px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-midnight/90",
      darkCard: true,
    },
    ...(stickerFamily && stickerPrice
      ? [
          {
            key: "stickers",
            imageSrc: "/printproof/gift-raw/sticker/sticker-mockup.png",
            alt: "Kiss-cut star map stickers on a laptop",
            title: getMerchPublicDisplayLabel(stickerFamily),
            detail:
              "Weatherproof kiss-cut stickers from the same map you preview — great add-on gift or laptop keepsake.",
            price: `${stickerPrice}+ shipping`,
            shippingNote: "Pick size in editor · Printful fulfillment",
            href: "/editor?mode=quick&source=shop-sticker&merch_family=sticker_kisscut",
            cta: "Customize stickers",
            ctaClass:
              "mt-auto inline-flex justify-center rounded-full bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800",
            darkCard: false,
          },
        ]
      : []),
  ] as const;

  return (
    <main className="mx-auto min-h-[60vh] w-full max-w-5xl px-4 py-10 text-neutral-900 sm:px-6 lg:py-14">
      <div className="rounded-3xl border border-white/15 bg-white/90 px-5 py-8 shadow-xl shadow-black/10 sm:px-10 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Shop</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-midnight sm:text-4xl">
          Physical prints & instant downloads
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-neutral-700 sm:text-lg">
          Every product starts in the editor so your sky, typography, and occasion lines stay yours. Physical orders ship
          through Printful. {productionReviewDisclosure}
        </p>
        <p className="mt-2 text-sm text-neutral-700">
          HD from <span className="font-semibold text-midnight">{digitalPrice}</span>
          {" · "}
          unframed from <span className="font-semibold text-midnight">{unframedPrice}</span>
          {" · "}
          framed from <span className="font-semibold text-midnight">{framedPrice}</span>
        </p>
        {framedDeliveryDisclosure ? (
          <p className="mt-1 text-xs text-neutral-600">
            Free preview first. {framedDeliveryDisclosure}. {shippingDisclosure}
          </p>
        ) : null}
        <ul className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-neutral-700">
          <li className="rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1">{printBadge}</li>
          <li className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">{shippingDisclosure}</li>
          {!printCheckoutEnabled ? (
            <li className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-900">
              Physical checkout is paused — digital HD still available.
            </li>
          ) : null}
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/editor?mode=quick&source=shop-hero-framed&checkout=print&print_variant=poster_framed"
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px]"
          >
            Preview framed print
          </Link>
          <Link
            href="/editor?mode=quick&source=shop-hero-preview"
            prefetch={false}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-neutral-50"
          >
            Start free preview
          </Link>
        </div>

        <PreviewStartForm
          source="shop"
          title="Customize before you buy"
          description="Enter the date and place, then open the editor with framed print, unframed poster, or HD digital pre-selected."
          intentOptions={[
            {
              label: "Preview framed print",
              sourceSuffix: "framed",
              checkout: "print",
              printVariant: "poster_framed",
              plan: "print_framed",
              tone: "recommended",
              detail: "Gift-ready route — arrives finished and ready to hang.",
            },
            {
              label: "Preview unframed poster",
              sourceSuffix: "unframed",
              checkout: "print",
              printVariant: "poster_unframed",
              plan: "print_unframed",
              tone: "default",
              detail: "Lower physical total when you handle framing yourself.",
            },
            {
              label: "Start HD digital",
              sourceSuffix: "digital",
              plan: "single",
              tone: "neutral",
              detail: "Instant file after payment — no shipping wait.",
            },
          ]}
        />

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-midnight">Ready at checkout</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Tap a card to open the editor with the matching fulfillment path pre-selected.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {productCards.map((card) => (
              <article
                key={card.key}
                className={`flex flex-col overflow-hidden rounded-2xl border shadow-sm ${
                  card.darkCard ? "border-neutral-800 bg-[#0c1738] text-white" : "border-neutral-200 bg-white"
                }`}
              >
                <div className="relative aspect-[4/3] bg-neutral-100">
                  <ResilientImage
                    src={card.imageSrc}
                    fallbackSrc={card.imageSrc}
                    alt={card.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h3 className={`text-lg font-semibold ${card.darkCard ? "text-white" : "text-midnight"}`}>{card.title}</h3>
                  <p className={`text-sm ${card.darkCard ? "text-indigo-100" : "text-neutral-700"}`}>{card.detail}</p>
                  <p className={`text-base font-semibold ${card.darkCard ? "text-amber-200" : "text-amber-800"}`}>
                    {card.price}
                  </p>
                  <p className={`text-xs ${card.darkCard ? "text-indigo-200/80" : "text-neutral-600"}`}>
                    {card.shippingNote}
                  </p>
                  <Link href={card.href} prefetch={false} className={card.ctaClass}>
                    {card.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {merchFamilies.length ? (
          <section id="merch-addons" className="mt-14 border-t border-neutral-200 pt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-midnight">Stickers & small merch</h2>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                Live beta
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-700">
              Same editor artwork — pick product options after your preview. Shipping appears in Stripe before payment.
              {` ${productionReviewDisclosure}`}
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

        {partnerOffers.length ? (
          <section className="mt-14 border-t border-neutral-200 pt-10">
            <h2 className="text-xl font-semibold text-midnight">Partner picks</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Curated storefront links configured via{" "}
              <code className="rounded bg-neutral-100 px-1 text-xs">NEXT_PUBLIC_SHOP_EXTERNAL_OFFERS_JSON</code>.
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
            Poster and framed SKUs map to your configured Printful variants. Merch add-ons use Printful catalog variants
            per selected options. Every order is reviewed before production starts.
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
            <Link href="/star-map-gift-formats" prefetch={false} className="font-semibold text-amber-800 underline">
              Compare gift formats
            </Link>
          </div>
        </section>
      </div>

      <FramedProofSection
        heading="See the finished gift before checkout"
        intro="Room mockups from current StarMapCo artwork — framed, unframed, and HD digital from the same preview you approve."
        sourcePrefix="shop-proof"
      />

      <PurchaseTrustPanel
        heading="Before you buy"
        intro="Preview for free first. Upgrade only once the wording, date, and layout feel right."
        leftTitle="Checkout and files"
        leftPoints={[
          "Secure Stripe checkout",
          "Instant HD download after payment",
          "No watermark on paid exports",
        ]}
        rightTitle="Print and support"
        rightPoints={[
          "Framed and unframed print paths available after preview",
          shippingDisclosure,
          productionReviewTrustPoint,
          "Support is available at support@starmapco.com",
        ]}
        guideLabel="Print and frame guide"
      />
      <WhatYouReceiveModule
        heading="What your shop order includes"
        intro="Same handoff from preview to final delivery as our gift landing pages."
      />

      <StickyCtaBar
        source="sticky-shop"
        buttonLabel="Preview framed print"
        primaryHref="/editor?mode=quick&source=sticky-shop-framed&checkout=print&print_variant=poster_framed"
        primaryPlan="print_framed"
        secondaryButtonLabel="Custom stickers"
        secondaryHref="/editor?mode=quick&source=sticky-shop-sticker&merch_family=sticker_kisscut"
        secondaryPlan="merch_sticker"
      />
    </main>
  );
}
