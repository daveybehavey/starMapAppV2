import type { Metadata } from "next";
import Link from "next/link";
import { getBusinessPhoneHref, getBusinessProfile } from "@/lib/businessProfile";
import { isBulkOrdersEnabled } from "@/lib/bulkQuotes";
import { SUPPORT_FAQ_ITEMS } from "@/lib/supportFaq";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

export const metadata: Metadata = {
  title: "Support | StarMapCo",
  description:
    "Get help with StarMapCo orders, HD downloads, print shipping, and returns. Quick links to policies and contact options.",
  alternates: { canonical: `${siteUrl}/support` },
};

export default function SupportPage() {
  const profile = getBusinessProfile();
  const phoneHref = getBusinessPhoneHref();
  const bulkEnabled = isBulkOrdersEnabled();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SUPPORT_FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="cosmic-panel rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">Help center</p>
        <h1 className="mt-2 text-3xl font-semibold text-midnight sm:text-4xl">Support</h1>
        <p className="mt-3 text-sm text-neutral-900 sm:text-base">
          Find answers for downloads, print orders, shipping timelines, and returns. For anything not covered here, use{" "}
          <Link className="font-semibold text-midnight underline" href="/contact">
            Contact
          </Link>{" "}
          or email us directly. Short answers below point to our full policies.
        </p>

        <nav className="mt-6 rounded-2xl border border-amber-200/70 bg-white/70 p-4 text-sm text-neutral-900" aria-label="FAQ topics">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Jump to</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {SUPPORT_FAQ_ITEMS.map((item) => (
              <li key={item.id}>
                <a className="text-midnight underline hover:text-amber-900" href={`#faq-${item.id}`}>
                  {item.question}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section className="mt-8 space-y-6 text-sm text-neutral-900 sm:text-base" aria-labelledby="support-faq-heading">
          <h2 id="support-faq-heading" className="text-lg font-semibold text-midnight sm:text-xl">
            Common questions
          </h2>
          {SUPPORT_FAQ_ITEMS.map((item) => (
            <article
              key={item.id}
              id={`faq-${item.id}`}
              className="scroll-mt-24 rounded-2xl border border-amber-200/60 bg-white/75 p-4 sm:p-5"
            >
              <h3 className="text-base font-semibold text-midnight sm:text-lg">{item.question}</h3>
              <p className="mt-2 text-neutral-800">{item.answer}</p>
            </article>
          ))}
          <p className="text-sm text-neutral-800">
            Full policies:{" "}
            <Link className="font-semibold text-midnight underline" href="/terms">
              Terms
            </Link>
            ,{" "}
            <Link className="font-semibold text-midnight underline" href="/shipping">
              Shipping
            </Link>
            ,{" "}
            <Link className="font-semibold text-midnight underline" href="/returns">
              Returns
            </Link>
            ,{" "}
            <Link className="font-semibold text-midnight underline" href="/privacy">
              Privacy
            </Link>
            ,{" "}
            <Link className="font-semibold text-midnight underline" href="/my-downloads">
              My Downloads
            </Link>
            ,{" "}
            <Link className="font-semibold text-midnight underline" href="/contact">
              Contact
            </Link>
            .
          </p>
        </section>

        <section className="mt-8 space-y-3 text-sm text-neutral-900 sm:text-base">
          <h2 className="text-base font-semibold text-midnight sm:text-lg">Reach {profile.name}</h2>
          <p>
            <strong>Email:</strong>{" "}
            <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
              {profile.email}
            </a>
          </p>
          {profile.phone ? (
            <p>
              <strong>Phone:</strong>{" "}
              <a className="font-semibold text-midnight underline" href={`tel:${phoneHref}`}>
                {profile.phone}
              </a>
            </p>
          ) : null}
          {profile.hours ? (
            <p>
              <strong>Support hours:</strong> {profile.hours}
            </p>
          ) : null}
          <p>
            Include your <strong>order email</strong> and, for print issues, <strong>photos or screenshots</strong> so we
            can help faster.
          </p>
        </section>

        <section className="mt-8 space-y-3 text-sm text-neutral-900 sm:text-base">
          <h2 className="text-base font-semibold text-midnight sm:text-lg">Policy pages</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <Link className="font-semibold text-midnight underline" href="/my-downloads">
                My Downloads
              </Link>{" "}
              — access HD files after purchase.
            </li>
            <li>
              <Link className="font-semibold text-midnight underline" href="/shipping">
                Shipping policy
              </Link>{" "}
              — fulfillment timelines, carriers, and rates by country.
            </li>
            <li>
              <Link className="font-semibold text-midnight underline" href="/returns">
                Returns &amp; refunds
              </Link>{" "}
              — eligibility, timelines, and how to start a return.
            </li>
            <li>
              <Link className="font-semibold text-midnight underline" href="/privacy">
                Privacy policy
              </Link>{" "}
              and{" "}
              <Link className="font-semibold text-midnight underline" href="/terms">
                Terms of service
              </Link>
              .
            </li>
            {bulkEnabled ? (
              <li>
                <Link className="font-semibold text-midnight underline" href="/bulk-event-orders">
                  Bulk &amp; event orders
                </Link>{" "}
                — quotes for 25+ maps.
              </li>
            ) : null}
          </ul>
        </section>

        <p className="mt-8 text-sm text-neutral-800 sm:text-base">
          Prefer the full contact block (address, hours, and context)? See{" "}
          <Link className="font-semibold text-midnight underline" href="/contact">
            Contact
          </Link>
          .
        </p>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </main>
  );
}
