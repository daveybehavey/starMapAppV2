import Link from "next/link";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";
import GiftFormatCtaLink from "@/components/GiftFormatCtaLink";
import MoneyPagePriceAtGlance from "@/components/MoneyPagePriceAtGlance";
import PreviewStartForm from "@/components/PreviewStartForm";
import StickyCtaBar from "@/components/StickyCtaBar";
import { getPaywallDigitalBullets, getPrintPhysicalOrderSummaryLine } from "@/lib/commerceFacts";
import {
  buildPrintEditorCheckoutHref,
  formatStandalonePrintPriceWithShipping,
  getPrintShippingDisclosure,
} from "@/lib/printCheckoutConfig";
import { getPrintPricingTiers } from "@/lib/pricing";
import type { PrintVariant } from "@/lib/printCatalog";
import type { Metadata } from "next";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const pageUrl = `${siteUrl}/star-map-size-guide`;
const ogImage = `${siteUrl}/custom-star-map-anniversary.webp`;
const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/star-map-size-guide", label: "Star map size guide" },
];

const title = "What Size Star Map Should I Buy? | Size Guide | StarMapCo";
const description =
  "Compare StarMapCo wall print sizes — framed 14×14, canvas 14×14, poster 16×16, and poster 18×18. Every wall print is square; choose by viewing distance and format.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: pageUrl },
  openGraph: {
    title,
    description,
    url: pageUrl,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "article",
  },
  twitter: { card: "summary_large_image", images: [ogImage] },
};

const WALL_SIZE_ROWS: ReadonlyArray<{
  variant: PrintVariant;
  sizeLabel: string;
  fitNote: string;
  finishNote: string;
  source: string;
  orderType: "print";
  plan: "single";
  index: number;
}> = [
  {
    variant: "poster_framed",
    sizeLabel: "14×14",
    fitNote: "Close viewing — bedside, desk wall, or a tight hallway niche.",
    finishNote: "Framed and ready to hang — no extra frame shopping.",
    source: "size-guide-framed-14",
    orderType: "print",
    plan: "single",
    index: 0,
  },
  {
    variant: "canvas_wrap",
    sizeLabel: "14×14",
    fitNote: "Same 14-inch footprint as framed, with a gallery-wrap depth on the wall.",
    finishNote: "Canvas gallery wrap — hang as-is, no frame required.",
    source: "size-guide-canvas-14",
    orderType: "print",
    plan: "single",
    index: 1,
  },
  {
    variant: "poster_unframed_16x16",
    sizeLabel: "16×16",
    fitNote: "Mid-wall presence from a few steps back — apartments and smaller rooms.",
    finishNote: "Unframed poster — choose your own frame or mat.",
    source: "size-guide-poster-16",
    orderType: "print",
    plan: "single",
    index: 2,
  },
  {
    variant: "poster_unframed",
    sizeLabel: "18×18",
    fitNote: "Statement size for a living-room or entry wall viewed from across the room.",
    finishNote: "Unframed poster — largest square wall option in the live catalogue.",
    source: "size-guide-poster-18",
    orderType: "print",
    plan: "single",
    index: 3,
  },
];

const faqItems = [
  {
    question: "What size star map should I buy?",
    answer:
      "Every StarMapCo wall print is square — the choice is size plus finish, not orientation. Start with viewing distance: 14×14 for close walls, 16×16 for mid-room, and 18×18 when the map will be seen from farther away. Then choose framed-ready, canvas, or frame-it-yourself poster.",
  },
  {
    question: "Are StarMapCo wall prints square or rectangular?",
    answer:
      "All live wall prints in the catalogue are square: framed 14×14, canvas 14×14, unframed poster 16×16, and unframed poster 18×18. There is no landscape-versus-portrait wall choice in the editor offer set.",
  },
  {
    question: "Should I buy framed, canvas, or an unframed poster?",
    answer:
      "Framed 14×14 arrives ready to hang. Canvas 14×14 is also hang-ready with a gallery wrap. Unframed 16×16 and 18×18 posters are for buyers who already have a frame or want to choose one later. Compare finishes on the gift formats page if you are still deciding format rather than size.",
  },
  {
    question: "Can I print the HD digital file myself at any size?",
    answer:
      "Yes. The HD digital file is 6,000 px high resolution — poster-quality print. Use it at a local print shop or at home, then frame it yourself. See the how-to-print guide for paper and framing tips.",
  },
  {
    question: "How long do wall prints take to arrive?",
    answer: getPrintPhysicalOrderSummaryLine(),
  },
] as const;

export default function StarMapSizeGuidePage() {
  const printPricing = getPrintPricingTiers();
  const shippingDisclosure = getPrintShippingDisclosure();
  const digitalBullets = getPaywallDigitalBullets();
  const hdResolutionLine =
    digitalBullets.find((line) => /6,?000\s*px/i.test(line)) ?? digitalBullets[0];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <header className="space-y-3 text-center">
        <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase">StarMapCo</p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">What size star map should I buy?</h1>
        <p className="text-sm text-neutral-200 sm:text-base">
          Every wall print is square — the decision is size and finish, not orientation. Compare the four live
          wall formats below, then preview free in the editor before you order.
        </p>
        <MoneyPagePriceAtGlance className="mx-auto max-w-lg" />
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/editor?mode=quick&source=size-guide-hero-preview"
            className="text-midnight focus:ring-gold inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Start free preview
          </Link>
          <Link
            href="/star-map-gift-formats"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
          >
            Compare gift formats
          </Link>
        </div>
      </header>

      <PreviewStartForm
        source="star-map-size-guide"
        title="Preview before you pick a size"
        description="Enter date and place first. Size and finish are chosen after you approve the design."
      />
      <StickyCtaBar
        source="sticky-size-guide-preview"
        title="Still deciding on size?"
        description="Preview free, then choose framed, canvas, or poster from the same design."
        buttonLabel="Start free preview"
        primaryHref="/editor?mode=quick&source=sticky-size-guide-preview"
        primaryPlan="preview"
        secondaryButtonLabel="Gift formats"
        secondaryHref="/star-map-gift-formats"
        secondaryPlan="preview"
      />

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-xl font-semibold">Wall print sizes (all square)</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          StarMapCo wall prints are square only. Use this table for dimensions and fit — for format choice
          (digital vs print, framed vs unframed ladder), see{" "}
          <Link href="/star-map-gift-formats" className="font-semibold text-amber-800 underline">
            gift formats
          </Link>
          .
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm text-neutral-800">
            <thead>
              <tr className="border-b border-black/10 text-midnight">
                <th className="py-2 pr-3">Size</th>
                <th className="py-2 pr-3">Format</th>
                <th className="py-2 pr-3">Price</th>
                <th className="py-2">Fit when</th>
              </tr>
            </thead>
            <tbody>
              {WALL_SIZE_ROWS.map((row) => {
                const tier = printPricing[row.variant];
                return (
                  <tr key={row.variant} className="border-b border-black/5 align-top">
                    <td className="py-3 pr-3 font-semibold text-midnight">{row.sizeLabel}</td>
                    <td className="py-3 pr-3">{tier.label}</td>
                    <td className="py-3 pr-3 font-semibold text-amber-800">
                      {formatStandalonePrintPriceWithShipping(row.variant)}
                    </td>
                    <td className="py-3">{row.fitNote}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {WALL_SIZE_ROWS.map((row) => {
            const tier = printPricing[row.variant];
            const href = buildPrintEditorCheckoutHref({
              source: row.source,
              variant: row.variant,
            });
            return (
              <article
                key={`card-${row.variant}`}
                className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm"
              >
                <p className="text-[10px] font-bold tracking-[0.12em] text-amber-800 uppercase">
                  {row.sizeLabel} square
                </p>
                <h3 className="text-midnight mt-1 text-sm font-semibold">{tier.label}</h3>
                <p className="mt-1 text-sm font-semibold text-amber-700">
                  {formatStandalonePrintPriceWithShipping(row.variant)}
                </p>
                <p className="mt-2 text-xs text-neutral-700">{row.finishNote}</p>
                <p className="mt-1 text-xs text-neutral-700">{row.fitNote}</p>
                <GiftFormatCtaLink
                  href={href}
                  className="bg-midnight hover:bg-midnight/90 mt-4 inline-flex rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-white"
                  source={row.source}
                  plan={row.plan}
                  orderType={row.orderType}
                  printVariant={row.variant}
                  listId="size_guide_wall_options"
                  listName="Size guide wall options"
                  index={row.index}
                >
                  Preview this size
                </GiftFormatCtaLink>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-amber-50/80 p-6 shadow-inner shadow-black/5">
        <h2 className="text-midnight text-lg font-semibold">Choosing by wall and viewing distance</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-800 sm:text-base">
          <li>
            <strong className="text-midnight">14×14 (framed or canvas):</strong> closest viewing — bedside,
            desk walls, and tight spaces where a larger square would overwhelm.
          </li>
          <li>
            <strong className="text-midnight">16×16 poster:</strong> mid-distance walls in apartments and
            smaller living rooms; frame-it-yourself if you already own a square frame.
          </li>
          <li>
            <strong className="text-midnight">18×18 poster:</strong> farther viewing across a room or entry —
            the largest live square wall option.
          </li>
          <li>
            <strong className="text-midnight">Framed-ready vs frame-it-yourself vs canvas:</strong> framed
            arrives ready to hang; canvas hangs without a frame; unframed posters leave the frame choice to
            you.
          </li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">HD digital if you print yourself</h2>
        <p className="text-sm text-neutral-800 sm:text-base">
          Prefer to print locally? The HD digital file is {hdResolutionLine}. Unlock it after payment, then
          follow{" "}
          <Link href="/how-to-print-star-map" className="font-semibold text-amber-800 underline">
            how to print a star map
          </Link>{" "}
          for paper and framing tips. Full digital product detail lives on the{" "}
          <Link href="/hd-star-map" className="font-semibold text-amber-800 underline">
            HD star map
          </Link>{" "}
          page — this guide stays focused on wall dimensions.
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Delivery note</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{getPrintPhysicalOrderSummaryLine()}</p>
        <p className="text-sm text-neutral-800 sm:text-base">{shippingDisclosure}</p>
        <p className="text-sm text-neutral-800 sm:text-base">
          Destination ranges and policy detail:{" "}
          <Link href="/shipping" className="font-semibold text-amber-800 underline">
            shipping
          </Link>
          . Gifting across two cities? See the{" "}
          <Link href="/long-distance" className="font-semibold text-amber-800 underline">
            long-distance star map gift
          </Link>{" "}
          page.
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Related guides</h2>
        <div className="flex flex-wrap gap-3 text-sm text-neutral-800">
          <Link href="/star-map-gift-formats" className="text-amber-700 underline hover:text-amber-800">
            Gift formats
          </Link>
          <Link href="/editor" className="text-amber-700 underline hover:text-amber-800">
            Editor / free preview
          </Link>
          <Link href="/how-to-print-star-map" className="text-amber-700 underline hover:text-amber-800">
            How to print a star map
          </Link>
          <Link href="/hd-star-map" className="text-amber-700 underline hover:text-amber-800">
            HD star map
          </Link>
          <Link href="/shipping" className="text-amber-700 underline hover:text-amber-800">
            Shipping
          </Link>
          <Link href="/long-distance" className="text-amber-700 underline hover:text-amber-800">
            Long-distance gifts
          </Link>
        </div>
      </section>

      <section className="mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
        <h2 className="text-midnight text-lg font-semibold">Star map size FAQ</h2>
        <div className="space-y-4 text-sm text-neutral-800 sm:text-base">
          {faqItems.map((item) => (
            <div key={item.question}>
              <h3 className="text-midnight font-semibold">{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </section>
      <FaqSchema items={[...faqItems]} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
