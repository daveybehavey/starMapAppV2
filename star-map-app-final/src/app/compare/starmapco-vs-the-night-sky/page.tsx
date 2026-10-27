import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs, BreadcrumbSchema } from "@/components/Breadcrumbs";
import FaqSchema from "@/components/FaqSchema";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const pageUrl = `${siteUrl}/compare/starmapco-vs-the-night-sky`;
const title = "StarMapCo vs The Night Sky: Star Map Comparison (2026)";
const description =
  "A sourced, side-by-side comparison of StarMapCo and The Night Sky: what the map shows, USD and CAD prices, sizes, paper, shipping, returns and reviews. Competitor facts checked October 26, 2026.";

const breadcrumbs = [
  { href: "/", label: "Home" },
  { href: "/compare/starmapco-vs-the-night-sky", label: "StarMapCo vs The Night Sky" },
];

export const metadata: Metadata = {
  title: `${title} | StarMapCo`,
  description,
  alternates: { canonical: pageUrl },
  openGraph: {
    title,
    description,
    url: pageUrl,
    type: "article",
    images: [{ url: `${siteUrl}/custom-star-map-anniversary.webp`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${siteUrl}/custom-star-map-anniversary.webp`],
  },
};

const faqItems = [
  {
    question: "Does StarMapCo show planets on the star map?",
    answer:
      "Yes. When you enable them, the map shows Mercury, Venus, Mars, Jupiter and Saturn, plus the Moon in its phase — each only when it was above the horizon at your date, time and place, so not every map shows all six.",
  },
  {
    question: "Does The Night Sky show planets?",
    answer:
      "No. The Night Sky's own comparison page says its star maps show the Moon but \"No planets\". It sells a separate Planets Aligned solar-system print instead (checked October 25, 2026).",
  },
  {
    question: "Can I see my StarMapCo map before I pay?",
    answer:
      "Yes. The full preview in the editor is free and needs no account. You only pay when you unlock the HD file or order a print, and the map you approve is the map you get.",
  },
  {
    question: "Which is cheaper, StarMapCo or The Night Sky?",
    answer:
      "It depends on the format. At 16×16 unframed, StarMapCo is $39 and The Night Sky's Classic print is $55. Framed, StarMapCo's 14×14 is $99 against The Night Sky's $110 (12×12) and $125 (16×16). The Night Sky's smallest print starts at $39 (12×12), and StarMapCo's HD digital file starts at $9. Prices are list prices in USD, checked October 26, 2026, before shipping and promos.",
  },
  {
    question: "Which is better for foil, glow-in-the-dark, jewelry or a really big print?",
    answer:
      "The Night Sky. It sells foil and glow-in-the-dark prints, jewelry, and sizes up to 24×32 inches. StarMapCo's largest print is 18×18 and it does not sell jewelry or foil.",
  },
  {
    question: "Can I return a StarMapCo map if I change my mind?",
    answer:
      "No. Every map is personalised, so StarMapCo does not accept change-of-mind returns. If a print arrives damaged or misprinted, contact us within 30 days of delivery and we reprint it free. The Night Sky accepts returns within 30 days if you are not happy with your order.",
  },
  {
    question: "How far back can I make a map?",
    answer:
      "StarMapCo's editor takes the date you enter — it does not stop at a preset year — and calculates the sky for that date, time and place. The Night Sky states a supported range of 1900–2100 in its site code (checked October 26, 2026).",
  },
  {
    question: "Which one ships free?",
    answer:
      "The Night Sky offers free standard shipping on US orders, with one exception — framed and canvas 24×32 orders add $20 — plus free standard shipping on unframed prints to Canada. StarMapCo offers free standard shipping on print orders with a merchandise subtotal of $89 or more; below that, standard shipping starts at $4.49 in the US.",
  },
];

const usdPriceRows: Array<{ label: string; starmapco: string; nightSky: string }> = [
  { label: "Unframed poster, 16×16", starmapco: "$39", nightSky: "$55 (Classic)" },
  { label: "Unframed poster, 18×18", starmapco: "$49", nightSky: "No 18×18 — 18×24 Classic is $69" },
  { label: "Framed print", starmapco: "$99 (14×14)", nightSky: "$110 (12×12), $125 (16×16)" },
  { label: "Canvas wrap", starmapco: "$79 (14×14)", nightSky: "$90 (12×12), $100 (16×16)" },
  { label: "HD digital file", starmapco: "From $9", nightSky: "Offered; price not in the public price list we checked" },
];

const cadPriceRows: Array<{ label: string; starmapco: string; nightSky: string }> = [
  { label: "Unframed poster, 16×16", starmapco: "CA$55", nightSky: "CA$79 (Classic)" },
  { label: "Framed print", starmapco: "CA$139 (14×14)", nightSky: "CA$155 (12×12), CA$175 (16×16)" },
  { label: "Canvas wrap", starmapco: "CA$111 (14×14)", nightSky: "CA$125 (12×12), CA$140 (16×16)" },
];

const featureRows: Array<{ label: string; starmapco: string; nightSky: string }> = [
  {
    label: "Star data",
    starmapco: "Yale Bright Star Catalog (9,000+ stars), positions calculated with astronomy-engine",
    nightSky: "ESA Hipparcos catalog, stars to magnitude 6 (their comparison page)",
  },
  {
    label: "What the map shows",
    starmapco: "Stars, constellation lines and labels, the Moon in its phase, and Mercury, Venus, Mars, Jupiter and Saturn when above the horizon (optional)",
    nightSky: "Stars, constellation lines and the Moon. \"No planets\" — constellation names come in an included eBook, not on the map (their comparison page)",
  },
  {
    label: "Free preview before paying",
    starmapco: "Yes — full live preview in the editor, no account needed",
    nightSky: "Not stated on the pages we checked; we make no claim either way",
  },
  {
    label: "Date range",
    starmapco: "The editor takes the date you enter; no preset start or end year",
    nightSky: "1900–2100 (stated in their site code, checked October 26, 2026)",
  },
  {
    label: "Formats",
    starmapco: "HD digital file, unframed posters, framed print, canvas wrap, mug, keepsake card add-on",
    nightSky: "Classic print, framed, canvas, foil, foil framed, glow-in-the-dark, jewelry, Planets Aligned print",
  },
  {
    label: "Print sizes",
    starmapco: "16×16 and 18×18 posters; 14×14 framed and canvas",
    nightSky: "12×12, 12×16, 16×16, 18×24, 20×20 and 24×32",
  },
  {
    label: "Paper",
    starmapco: "Enhanced matte poster paper, 189 g/m² (10.3 mil), per our print partner's spec for the poster product",
    nightSky: "200 g/m² enhanced matte fine art paper, giclée archival pigment inks, 100+ year colour guarantee (their published claims)",
  },
  {
    label: "Second copy of the same print",
    starmapco: "10% off a second copy of the same print (posters, framed and canvas)",
    nightSky: "Extra 5×7 print add-on, $25 USD / CA$35 (their price list)",
  },
  {
    label: "Shipping cost (standard)",
    starmapco: "Free on print orders of $89 or more; otherwise from $4.49 US / $5.17 CA for posters, $9.84 US / $10.77 CA framed",
    nightSky: "Free on US orders except framed/canvas 24×32 (+$20); Canada: unframed free, framed/canvas +CA$30 to CA$95. Paid faster tiers offered",
  },
  {
    label: "Delivery time",
    starmapco: "Made to order in 2–5 business days, then tracked standard shipping (US transit typically 4–6 business days for posters and framed). Standard shipping only — no express option",
    nightSky: "Quoted delivery windows (October 26, 2026): US standard 4–11 business days depending on state and format; Canada standard 3–10 business days",
  },
  {
    label: "Christmas order-by (2026)",
    starmapco: "Framed and canvas: Canada Dec 3, US Dec 8. Posters: US Dec 9, Canada Dec 10. HD digital is delivered the same day, right up to Dec 25",
    nightSky: "No dated Christmas cutoff found on their site when we checked (October 2026)",
  },
  {
    label: "Returns",
    starmapco: "No change-of-mind returns (every map is personalised). Free reprint if a print arrives damaged or misprinted — contact us within 30 days of delivery",
    nightSky: "Returns accepted within 30 days if you are not happy with your order (their help pages)",
  },
  {
    label: "Reviews",
    starmapco: "Google reviews on our listing (linked from our homepage)",
    nightSky: "Trustpilot 4.6 from over 10,000 reviews, per their own comparison page",
  },
];

export default function StarMapCoVsTheNightSkyPage() {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    author: { "@type": "Organization", name: "StarMapCo" },
    publisher: {
      "@type": "Organization",
      name: "StarMapCo",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/favicon.ico`,
      },
    },
    mainEntityOfPage: pageUrl,
    datePublished: "2026-10-26",
    dateModified: "2026-10-26",
    image: `${siteUrl}/og-default.png`,
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <Breadcrumbs items={breadcrumbs} className="flex justify-center" />
      <article className="mt-4 space-y-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,36,0.92),rgba(6,12,30,0.96))] p-6 text-white shadow-[0_24px_64px_rgba(0,0,0,0.35)] sm:p-8">
        <header className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Comparison</p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">StarMapCo vs The Night Sky</h1>
          <p className="mx-auto max-w-3xl text-sm leading-relaxed text-neutral-200 sm:text-base">
            StarMapCo wrote this page, and we sell star maps too — so every fact below comes from each company&apos;s own
            published pages, linked in the sources, and we say plainly where The Night Sky is the better pick. Prices
            and competitor facts last checked October 26, 2026.
          </p>
        </header>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">The short answer</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            Both companies calculate a real star map for your date, time and place. StarMapCo lets you design and see
            the whole map free before you pay, with no account, and can add the Moon in its phase and the five
            naked-eye planets — Mercury, Venus, Mars, Jupiter and Saturn — when they were above the horizon. The Night
            Sky&apos;s star maps show stars, constellation lines and the Moon, not planets. In return, The Night Sky
            offers far more formats and sizes, free standard shipping on US orders, change-of-mind returns, and a
            much larger review history. On price, StarMapCo is lower at the sizes both companies sell, in both USD and
            CAD.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold text-white">Choose StarMapCo if…</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-200 sm:text-base">
              <li>you want to see the exact map, free, before paying — no account needed;</li>
              <li>you want the Moon and the five planets from that night on the map;</li>
              <li>you want the lower price at 16×16, framed or canvas, in USD or CAD;</li>
              <li>you want an HD digital file from $9, or 10% off a second copy of the same print;</li>
              <li>your date falls outside a 1900–2100 window.</li>
            </ul>
          </div>
          <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-semibold text-white">Choose The Night Sky if…</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-200 sm:text-base">
              <li>you want foil, glow-in-the-dark, jewelry, or a print larger than 18×18 (they go to 24×32);</li>
              <li>free standard shipping on a small order matters more than the print price;</li>
              <li>you want a 30-day return that covers orders you are simply not happy with;</li>
              <li>a large public review history (Trustpilot 4.6, over 10,000 reviews) matters to you;</li>
              <li>you want a published archival colour guarantee (100+ years, per their pages).</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">Prices, side by side (USD)</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            List prices before shipping and promos, as published on October 26, 2026. The Night Sky discounts
            frequently, so its live prices may be lower than list. Frame and canvas sizes differ between the two
            companies — each cell shows the size that price buys.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm text-neutral-100">
              <thead>
                <tr className="border-b border-white/10 text-amber-200">
                  <th className="py-2 pr-4">Format</th>
                  <th className="py-2 pr-4">StarMapCo</th>
                  <th className="py-2">The Night Sky</th>
                </tr>
              </thead>
              <tbody>
                {usdPriceRows.map((row) => (
                  <tr key={row.label} className="border-b border-white/10 align-top">
                    <td className="py-3 pr-4 font-semibold text-white">{row.label}</td>
                    <td className="py-3 pr-4">{row.starmapco}</td>
                    <td className="py-3">{row.nightSky}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">Prices for Canadian buyers (CAD)</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            Both companies publish Canadian pricing. StarMapCo charges Canadians from a fixed CAD price list; The Night
            Sky publishes its own CAD prices (list, checked October 26, 2026).
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm text-neutral-100">
              <thead>
                <tr className="border-b border-white/10 text-amber-200">
                  <th className="py-2 pr-4">Format</th>
                  <th className="py-2 pr-4">StarMapCo</th>
                  <th className="py-2">The Night Sky</th>
                </tr>
              </thead>
              <tbody>
                {cadPriceRows.map((row) => (
                  <tr key={row.label} className="border-b border-white/10 align-top">
                    <td className="py-3 pr-4 font-semibold text-white">{row.label}</td>
                    <td className="py-3 pr-4">{row.starmapco}</td>
                    <td className="py-3">{row.nightSky}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">Features, side by side</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            “Not stated” means we could not find it on that company&apos;s own pages on the check date — not that they
            don&apos;t offer it.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm text-neutral-100">
              <thead>
                <tr className="border-b border-white/10 text-amber-200">
                  <th className="py-2 pr-4">Compare</th>
                  <th className="py-2 pr-4">StarMapCo</th>
                  <th className="py-2">The Night Sky</th>
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.label} className="border-b border-white/10 align-top">
                    <td className="py-3 pr-4 font-semibold text-white">{row.label}</td>
                    <td className="py-3 pr-4">{row.starmapco}</td>
                    <td className="py-3">{row.nightSky}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            One honest note on paper: on published specs, The Night Sky lists the heavier stock (200 g/m² against our
            189 g/m²) and an archival colour guarantee. We publish our paper weight and make no archival-life claim.
          </p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">What will be on your map?</h2>
          <figure className="space-y-2">
            <div className="relative mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-2xl border border-white/10">
              <Image
                src="/examples/example-anniversary-heirloom.webp"
                alt="Real StarMapCo star map render for Paris, France, September 17, 2016, in the Heirloom preset"
                width={1200}
                height={1200}
                sizes="(max-width: 640px) 100vw, 576px"
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="text-center text-xs text-neutral-300">
              A real StarMapCo render — Paris, France · September 17, 2016 (Heirloom preset), generated with the same
              engine you use in the editor. More renders are in the{" "}
              <Link href="/star-map-gallery" className="text-amber-200 underline hover:text-amber-100">
                gallery
              </Link>
              .
            </figcaption>
          </figure>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            StarMapCo calculates the stars, the Moon&apos;s phase and the positions of Mercury, Venus, Mars, Jupiter
            and Saturn for your exact date, time and place. A planet or the Moon only appears if it was above the
            horizon at that moment, so not every map shows all six. The Night Sky&apos;s star maps show the Moon but not
            planets; it sells a separate Planets Aligned solar-system print instead. To be fair: some other star map
            makers show planets too — this is a difference from The Night Sky, not something only we do.
          </p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">See it before you pay</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            You can design and preview your full map in the StarMapCo editor without an account and without paying.
            You pay only when it looks right, and the map you approve is the map you get. We have not tested The Night
            Sky&apos;s checkout, so this page makes no claim about how its preview works — check it yourself if that
            matters to you.
          </p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">Is it accurate? Check it yourself</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            StarMapCo uses your date, local time, timezone and location, and calculates star, planet and Moon
            positions with astronomy-engine and star catalog data. You can verify any star map — ours or anyone
            else&apos;s — in a few minutes:
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-200 sm:text-base">
            <li>Open the free Stellarium planetarium (linked below) or another planetarium you trust.</li>
            <li>Set the same place, date and time as the map you are checking.</li>
            <li>Compare the bright stars, the Moon and any planets near the horizon.</li>
          </ol>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            Our longer guide,{" "}
            <Link href="/how-accurate-are-star-maps" className="text-amber-200 underline hover:text-amber-100">
              How accurate are star maps?
            </Link>
            , explains what can still change the result (weather, light pollution, an unknown exact time).
          </p>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">Printing and delivery</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            StarMapCo prints are made to order after you pay, usually in 2–5 business days, then shipped standard with
            tracking. We don&apos;t offer express shipping on prints, so for a last-minute gift the HD digital file —
            delivered the same day — is our fast option. The Night Sky offers free standard shipping on US orders
            and paid faster options, which makes it the safer pick when the deadline is tight and the gift has to be
            physical. Full details are on our{" "}
            <Link href="/shipping" className="text-amber-200 underline hover:text-amber-100">
              shipping page
            </Link>{" "}
            and{" "}
            <Link href="/christmas-star-map-gift" className="text-amber-200 underline hover:text-amber-100">
              Christmas order-by page
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
          <h2 className="text-xl font-semibold text-white">See your sky free before you decide</h2>
          <p className="text-sm leading-relaxed text-neutral-100 sm:text-base">
            Enter your date and place and look at the actual map — then decide which company earns the order.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/editor?mode=quick&source=compare-tns"
              className="inline-flex items-center justify-center rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-midnight transition hover:-translate-y-[1px] hover:bg-amber-200"
            >
              Start free preview
            </Link>
            <Link
              href="/star-map-poster"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-white/12"
            >
              See StarMapCo print formats
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">FAQ</h2>
          <div className="space-y-3 text-sm text-neutral-200 sm:text-base">
            {faqItems.map((item) => (
              <div key={item.question} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="font-semibold text-white">{item.question}</h3>
                <p className="mt-2">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold text-white">Sources</h2>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            StarMapCo facts come from our own site and catalog data; The Night Sky facts come from its own published
            pages and price list. All competitor facts were checked October 25–26, 2026.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-200 sm:text-base">
            <li>
              StarMapCo:{" "}
              <Link href="/" className="text-amber-200 underline hover:text-amber-100">
                homepage
              </Link>
              ,{" "}
              <Link href="/shipping" className="text-amber-200 underline hover:text-amber-100">
                shipping policy
              </Link>
              ,{" "}
              <Link href="/returns" className="text-amber-200 underline hover:text-amber-100">
                returns &amp; refunds
              </Link>
              ,{" "}
              <Link href="/christmas-star-map-gift" className="text-amber-200 underline hover:text-amber-100">
                Christmas order-by dates
              </Link>
              ,{" "}
              <Link href="/how-accurate-are-star-maps" className="text-amber-200 underline hover:text-amber-100">
                how accurate are star maps
              </Link>
              , and our print catalog (prices and the 189 g/m² enhanced matte paper spec come from our print
              partner&apos;s published catalog data for the poster product we sell).
            </li>
            <li>
              The Night Sky:{" "}
              <a
                href="https://www.thenightsky.com/compare/the-night-sky-vs-under-lucky-stars"
                className="text-amber-200 underline hover:text-amber-100"
                rel="noreferrer"
                target="_blank"
              >
                their comparison page
              </a>{" "}
              (star data, planets, paper claims, returns, Trustpilot figures),{" "}
              <a
                href="https://www.thenightsky.com/shop/star-map-print"
                className="text-amber-200 underline hover:text-amber-100"
                rel="noreferrer"
                target="_blank"
              >
                star map print product page
              </a>
              ,{" "}
              <a
                href="https://help.thenightsky.com/en/articles/9507593-how-long-does-delivery-take-for-prints-framed-prints-and-canvas"
                className="text-amber-200 underline hover:text-amber-100"
                rel="noreferrer"
                target="_blank"
              >
                delivery times help article
              </a>
              , and their published USD/CAD price list (all prices on this page, captured October 26, 2026).
            </li>
            <li>
              Verification tool:{" "}
              <a href="https://stellarium.org" className="text-amber-200 underline hover:text-amber-100" rel="noreferrer" target="_blank">
                Stellarium
              </a>
              , the free planetarium.
            </li>
          </ul>
          <p className="text-sm leading-relaxed text-neutral-200 sm:text-base">
            The Night Sky is a trademark of its owner. StarMapCo isn&apos;t affiliated with it. Spotted something
            wrong? Email support@starmapco.com and we&apos;ll fix it.
          </p>
        </section>
      </article>
      <FaqSchema items={faqItems} />
      <BreadcrumbSchema items={breadcrumbs} baseUrl={siteUrl} />
    </main>
  );
}
