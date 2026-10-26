import Link from "next/link";
import {
  VARIANT_PAGE_MANIFEST,
  buildVariantPagePath,
  resolveVariantOffer,
  type ResolvedVariantOffer,
} from "@/lib/variantPages";

/**
 * Crawlable links to the Merchant Center variant landing pages
 * (/products/star-map/<slug>/usd) from the shop and poster money pages
 * — the #395 follow-up (issue #400). Until this component existed the
 * variant pages were discoverable only through the sitemap.
 *
 * Deliberately mirrors the variant pages' own "Other formats" nav:
 * the rows come from VARIANT_PAGE_MANIFEST, hrefs are built with
 * buildVariantPagePath, and the label/price line resolves through
 * resolveVariantOffer — the same helpers the variant pages use — so
 * no slug list, title, or amount is ever duplicated here. Links point
 * at the USD pages; each variant page cross-links its own CAD twin.
 * These are plain content links: no `?source=` param (the #394
 * indexation rule for non-editor links).
 */
export default function VariantFormatLinks({
  tone = "light",
  heading = "Every format, on its own page",
  intro = "Each format has a page with the exact price checkout charges for US orders — open one to see it up close before you customize.",
}: {
  tone?: "light" | "dark";
  heading?: string;
  intro?: string;
}) {
  const offers = VARIANT_PAGE_MANIFEST.map((row) => resolveVariantOffer(row.slug, "usd")).filter(
    (offer): offer is ResolvedVariantOffer => offer !== null,
  );

  const dark = tone === "dark";

  return (
    <nav aria-label="Star map formats priced in USD">
      <h2
        className={
          dark
            ? "text-sm font-semibold tracking-[0.18em] text-white/70 uppercase"
            : "text-lg font-semibold text-midnight"
        }
      >
        {heading}
      </h2>
      <p className={dark ? "mt-2 text-sm text-white/70" : "mt-2 text-sm text-neutral-700"}>{intro}</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {offers.map((offer) => (
          <li key={offer.slug}>
            <Link
              href={buildVariantPagePath(offer.slug, "usd")}
              className={
                dark
                  ? "block rounded-2xl border border-white/10 bg-white/6 p-4 transition hover:bg-white/10"
                  : "block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/60"
              }
            >
              <span
                className={
                  dark
                    ? "block text-sm font-semibold text-white"
                    : "block text-sm font-semibold text-midnight"
                }
              >
                {offer.title}
              </span>
              <span
                className={
                  dark
                    ? "mt-1 block text-sm text-amber-100/90"
                    : "mt-1 block text-sm text-amber-800"
                }
              >
                {offer.formattedPrice} · {offer.sizeLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
