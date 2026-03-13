import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import {
  formatPrice,
  getPricingTiers,
  getPrintDigitalAddOnPrice,
  getPrintPricingTiers,
} from "@/lib/pricing";
import {
  formatPrintPriceWithShipping,
  getPrintAllowedCountries,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { getPrintShippingEstimate } from "@/lib/printfulShipping";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-gift-formats", label: "Gift formats" },
];

export const metadata: Metadata = {
  title: "Star Map Gift Formats | StarMapCo",
  description:
    "Compare StarMapCo gift formats in one place: HD digital, framed print, unframed poster, and upcoming pilot products.",
  alternates: { canonical: `${siteUrl}/star-map-gift-formats` },
  openGraph: {
    title: "Star Map Gift Formats | StarMapCo",
    description:
      "Compare StarMapCo gift formats in one place: HD digital, framed print, unframed poster, and upcoming pilot products.",
    url: `${siteUrl}/star-map-gift-formats`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

export default function StarMapGiftFormatsPage() {
  const pricing = getPricingTiers();
  const printPricing = getPrintPricingTiers();
  const digitalAddOn = getPrintDigitalAddOnPrice();
  const printCountryCount = getPrintAllowedCountries().length;
  const shippingDisclosure = getPrintShippingDisclosure();

  const usFramedShipping = getPrintShippingEstimate("poster_framed", "US");
  const usUnframedShipping = getPrintShippingEstimate("poster_unframed", "US");
  const usFramedShippingLabel = usFramedShipping
    ? formatPrice(usFramedShipping.amountCents, usFramedShipping.currency)
    : "varies";
  const usUnframedShippingLabel = usUnframedShipping
    ? formatPrice(usUnframedShipping.amountCents, usUnframedShipping.currency)
    : "varies";

  const liveFormats = [
    {
      title: "HD digital download",
      badge: "Instant",
      price: formatPrice(pricing.single.amountCents, pricing.single.currency),
      detail: "Best for same-day gifting and local print shops.",
      href: "/editor?mode=quick&source=gift-formats-digital",
    },
    {
      title: `${printPricing.poster_framed.label}`,
      badge: "Most popular",
      price: formatPrintPriceWithShipping(printPricing.poster_framed.amountCents, printPricing.poster_framed.currency),
      detail: `Premium ready-to-hang gift path. US shipping starts around ${usFramedShippingLabel}.`,
      href: "/editor?mode=quick&source=gift-formats-framed&checkout=print&print_variant=poster_framed&shipping_country=US",
    },
    {
      title: `${printPricing.poster_unframed.label}`,
      badge: "Lower physical cost",
      price: formatPrintPriceWithShipping(printPricing.poster_unframed.amountCents, printPricing.poster_unframed.currency),
      detail: `Professional poster print path. US shipping starts around ${usUnframedShippingLabel}.`,
      href: "/editor?mode=quick&source=gift-formats-unframed&checkout=print&print_variant=poster_unframed&shipping_country=US",
    },
  ] as const;

  const plannedFormats = [
    { name: "Canvas wall art", status: "Pilot queue", note: "Premium upsell candidate if margin gates hold." },
    { name: "Mug gift add-on", status: "Pilot queue", note: "Low-friction add-on for birthdays and holidays." },
    { name: "Greeting card bundle", status: "Bundle only", note: "Ships as add-on only to keep checkout simple." },
    { name: "Gift-pack bundles", status: "Design stage", note: "Print + digital + card combinations for AOV growth." },
    { name: "Apparel and accessories", status: "Research", note: "Only launched if quality and support risk stay low." },
  ] as const;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Star map gift formats</h1>
        <p className="text-sm text-white/90 sm:text-base">
          Start with one preview, then choose your delivery format. This page shows what is live now and what is next.
        </p>
      </header>

      <PreviewStartForm source="star-map-gift-formats" />
      <StickyCtaBar
        source="sticky-gift-formats"
        secondaryButtonLabel="Preview framed"
        secondaryHref="/editor?mode=quick&source=sticky-gift-formats-framed&checkout=print&print_variant=poster_framed&shipping_country=US"
        secondaryPlan="print_framed"
      />

      <section className="content-visibility-auto mt-8 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-xl font-semibold text-midnight">Live checkout formats</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          We keep live options focused on formats that perform well for quality, delivery, and support. {shippingDisclosure}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {liveFormats.map((item) => (
            <article key={item.title} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <p className="inline-flex rounded-full border border-amber-300/60 bg-amber-100/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">
                {item.badge}
              </p>
              <h3 className="mt-2 text-sm font-semibold text-midnight">{item.title}</h3>
              <p className="mt-1 text-sm font-semibold text-amber-700">{item.price}</p>
              <p className="mt-2 text-xs text-neutral-700">{item.detail}</p>
              <Link
                href={item.href}
                prefetch={false}
                className="mt-4 inline-flex rounded-full border border-black/10 bg-midnight px-4 py-2 text-xs font-semibold text-white hover:bg-midnight/90"
              >
                Preview this format
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-amber-200 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-xl font-semibold text-midnight">Format expansion queue</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          These are the next candidate products. We only launch a format when it passes margin and fulfillment checks.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {plannedFormats.map((item) => (
            <article key={item.name} className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-midnight">{item.name}</h3>
                <span className="rounded-full border border-amber-300/70 bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-800">
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-neutral-700">{item.note}</p>
            </article>
          ))}
        </div>
        <a
          href="mailto:support@starmapco.com?subject=Gift%20format%20pilot%20interest"
          className="inline-flex rounded-full border border-amber-300/70 bg-white px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Join format pilot list
        </a>
      </section>

      <section className="content-visibility-auto mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">How we decide what launches</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>Quality standard: no weak print quality or fragile packaging.</li>
          <li>Margin gate: every SKU must clear profitability targets across top shipping countries.</li>
          <li>Support risk: we avoid formats that create avoidable returns and support load.</li>
          <li>Checkout focus: too many options hurt conversions, so we keep primary checkout clean.</li>
        </ul>
        <p className="text-xs text-neutral-700">
          Current print coverage: {printCountryCount} shipping countries. Current print + HD add-on price:{" "}
          {formatPrice(digitalAddOn.amountCents, digitalAddOn.currency)}.
        </p>
      </section>

      <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-lg font-semibold text-midnight">Gift formats FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          <div>
            <h3 className="font-semibold text-midnight">Can I choose format before designing?</h3>
            <p>Yes, but the recommended flow is preview first, then choose digital, framed, or unframed checkout.</p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Will you add more products?</h3>
            <p>Yes. New products are added in pilots after quality and margin checks pass.</p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Can I buy digital and print together?</h3>
            <p>Yes. Print checkout can include the HD digital add-on so you have both immediately.</p>
          </div>
          <div>
            <h3 className="font-semibold text-midnight">Where can I request a new product format?</h3>
            <p>Email support@starmapco.com with your request and country so we can prioritize pilot demand.</p>
          </div>
        </div>
      </section>

      <FaqSchema
        items={[
          {
            question: "Can I choose format before designing?",
            answer: "Yes, but the recommended flow is preview first, then choose digital, framed, or unframed checkout.",
          },
          {
            question: "Will you add more products?",
            answer: "Yes. New products are added in pilots after quality and margin checks pass.",
          },
          {
            question: "Can I buy digital and print together?",
            answer: "Yes. Print checkout can include the HD digital add-on so you have both immediately.",
          },
          {
            question: "Where can I request a new product format?",
            answer: "Email support@starmapco.com with your request and country so we can prioritize pilot demand.",
          },
        ]}
      />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
