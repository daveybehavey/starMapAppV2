import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BulkQuoteRequestForm from "@/components/BulkQuoteRequestForm";
import { getBusinessProfile } from "@/lib/businessProfile";
import { isBulkOrdersEnabled } from "@/lib/bulkQuotes";

export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
const ogImage = `${siteUrl}/og-default.png`;

export const metadata: Metadata = {
  title: "Bulk & Event Orders | StarMapCo",
  description:
    "Manual quote lane for bulk star map orders for corporate events, memorials, weddings, and milestone gifting.",
  alternates: { canonical: `${siteUrl}/bulk-event-orders` },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Bulk & Event Orders | StarMapCo",
    description:
      "Manual quote lane for bulk star map orders for corporate events, memorials, weddings, and milestone gifting.",
    url: `${siteUrl}/bulk-event-orders`,
    images: [{ url: ogImage, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bulk & Event Orders | StarMapCo",
    description:
      "Manual quote lane for bulk star map orders for corporate events, memorials, weddings, and milestone gifting.",
    images: [ogImage],
  },
};

const stats = [
  { value: "25+", label: "pieces to start a manual quote lane" },
  { value: "1 proof", label: "before production begins" },
  { value: "1 route", label: "unframed first, framed by request" },
];

const useCases = [
  {
    title: "Corporate events",
    body: "Team gifts, conference keepsakes, milestone celebrations, or client thank-you runs that need a clean branded presentation.",
  },
  {
    title: "Memorial keepsakes",
    body: "A shared map for celebration-of-life tables, remembrance gifts, or family distribution with one quiet consistent design.",
  },
  {
    title: "Wedding runs",
    body: "Guest gifts, welcome bags, or family keepsakes tied to the ceremony date and place without forcing everyone through a consumer checkout.",
  },
  {
    title: "Milestone events",
    body: "Graduations, reunions, launches, and anniversaries where one meaningful sky map can anchor the event story.",
  },
];

const includedItems = [
  "Custom date and location setup",
  "Subtle logo placement when needed",
  "Manual quote based on quantity, versions, and timing",
  "One proof and one revision round before production",
  "Unframed-first pricing for the cleanest margin and fulfillment path",
];

const steps = [
  "Send the event details, quantity, and shipping destination.",
  "We scope the number of versions and recommend the cleanest production route.",
  "You receive a quote and proof plan before any production starts.",
  "Once the proof is approved, we lock production timing and delivery.",
];

const faqs = [
  {
    question: "What quantity counts as a bulk order?",
    answer:
      "This lane is designed for 25 or more pieces. Below that, the standard consumer flow is still the better fit.",
  },
  {
    question: "Can you support multiple versions in one order?",
    answer:
      "Yes. We can quote multiple date or location versions, but the version count affects proofing and pricing, so we scope that manually.",
  },
  {
    question: "Can you add our logo?",
    answer:
      "Yes. The cleanest approach is usually a subtle bottom-left logo or another restrained branded placement that does not overpower the map.",
  },
  {
    question: "Do you recommend framed or unframed for bulk runs?",
    answer:
      "Unframed is the default recommendation because it is easier to ship, easier to price, and safer operationally. Framed is available by request.",
  },
];

export default function BulkEventOrdersPage() {
  if (!isBulkOrdersEnabled()) {
    notFound();
  }

  const business = getBusinessProfile();

  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:pt-14">
      <section className="overflow-hidden rounded-[36px] border border-amber-200/25 bg-[radial-gradient(circle_at_top_left,rgba(230,193,106,0.16),transparent_32%),linear-gradient(145deg,#050915,#0d1b3d_58%,#152b57)] px-6 py-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:px-10 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">Manual sales lane</p>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                Custom star maps for events, teams, memorials, and milestone gifting.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-100/92 sm:text-lg">
                This is the assisted route for bulk orders that need manual quoting, subtle branding, or multiple versions.
                We scope the event, send a proof plan, and keep production decisions clear before anything is printed.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="#quote-form"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#d7b56c] via-[#e8c87d] to-[#d7b56c] px-6 py-3 text-sm font-semibold text-[#201a0c] shadow-lg shadow-amber-500/20 transition hover:-translate-y-[1px] hover:shadow-[0_14px_40px_rgba(215,181,108,0.35)] focus:outline-none focus:ring-2 focus:ring-amber-300/70"
              >
                Request a custom quote
              </a>
              <a
                href={`mailto:${business.email}`}
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/12 focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                Email {business.email}
              </a>
            </div>
          </div>

          <div className="grid gap-3 rounded-[28px] border border-white/12 bg-white/6 p-4 backdrop-blur-sm sm:grid-cols-3 lg:grid-cols-1">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[24px] border border-white/10 bg-black/15 p-4">
                <div className="text-2xl font-semibold text-amber-300">{stat.value}</div>
                <p className="mt-2 text-sm leading-6 text-slate-100/88">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-6">
          <div className="rounded-[32px] border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">Best fit</p>
            <h2 className="mt-3 text-2xl font-semibold text-midnight">Built for manual event quoting, not self-serve checkout.</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {useCases.map((item) => (
                <div key={item.title} className="rounded-[24px] border border-amber-100 bg-amber-50/70 p-4">
                  <h3 className="text-base font-semibold text-midnight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-800">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.93),rgba(247,241,227,0.95))] p-6 shadow-xl shadow-black/10">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">What is included</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-800">
              {includedItems.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <BulkQuoteRequestForm supportEmail={business.email} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-[32px] border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">How it works</p>
          <ol className="mt-4 space-y-4">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-midnight text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <p className="text-sm leading-7 text-slate-800">{step}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-[32px] border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">FAQ</p>
          <div className="mt-4 space-y-4">
            {faqs.map((item) => (
              <div key={item.question} className="rounded-[24px] border border-amber-100 bg-amber-50/65 p-4">
                <h3 className="text-base font-semibold text-midnight">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-800">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
