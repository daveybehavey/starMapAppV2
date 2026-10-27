/**
 * Google review proof for StarMapCo — the single source of truth for every
 * rating claim on the site. The trust component (GoogleRatingsTrust) and the
 * homepage Product JSON-LD both read from here, so the structured data can
 * never drift from what the page displays.
 *
 * Source: Google Business Profile "StarMapCo Star Maps" — verified in the GBP
 * manager on 2026-10-18: 5.0 stars from 2 reviews. Trustpilot is claimed but
 * has 0 reviews, so no Trustpilot rating is displayed anywhere.
 *
 * When a new Google review lands, update `ratingValue` / `reviewCount` here
 * (one place) and every surface stays consistent.
 *
 * DISPLAY RULE (owner ruling, 2026-10-27): the numbers stay on file here
 * but are NOT displayed anywhere public — no rating value, no review
 * count, no aggregate stars — until the count is impressive. Surfaces say
 * "Google Reviews" and link to the listing instead. The display helpers
 * below are kept for the day the numbers come back; the only permitted
 * consumer of the aggregate values in the meantime is this module.
 * Pinned by scripts/unit/reviewCountsHidden.test.mjs.
 */

export type GoogleReviewQuote = {
  /** Verbatim review text, copied word-for-word from the Google listing. */
  quote: string;
  /** Reviewer's first name, as shown on Google. */
  authorFirstName: string;
  /** Star rating the reviewer gave, 1–5. */
  rating: number;
};

export const GOOGLE_RATINGS: {
  ratingValue: number;
  reviewCount: number;
  /** Leave-a-review link for the Google listing (reviews are read there too). */
  reviewUrl: string;
  reviews: GoogleReviewQuote[];
} = {
  ratingValue: 5.0,
  reviewCount: 2,
  reviewUrl: "https://g.page/r/CVMm_3hOFgRTEAI",
  reviews: [
    // TODO(owner): paste each Google review VERBATIM here and it will render
    // as a quote card automatically, e.g.
    //   { quote: "…exact words from the listing…", authorFirstName: "…", rating: 5 },
    // The review text could not be pulled automatically (Google serves it
    // behind JS), and paraphrasing a customer's words would be fabrication —
    // so this stays empty until the text is copied from the listing by hand.
    // Never add a quote that is not word-for-word from Google.
  ],
};

/** "5.0" — one decimal place, the way Google displays the aggregate. */
export function formatGoogleRatingValue(): string {
  return GOOGLE_RATINGS.ratingValue.toFixed(1);
}

/** "2 reviews" / "1 review" — the count stated plainly, never inflated. */
export function getGoogleReviewCountLabel(): string {
  return GOOGLE_RATINGS.reviewCount === 1 ? "1 review" : `${GOOGLE_RATINGS.reviewCount} reviews`;
}

/** Whole stars to fill for the aggregate (5.0 → 5). */
export function getGoogleFullStarCount(): number {
  return Math.round(GOOGLE_RATINGS.ratingValue);
}
