import {
  GOOGLE_RATINGS,
  formatGoogleRatingValue,
  getGoogleFullStarCount,
  getGoogleReviewCountLabel,
} from "@/lib/googleRatings";

/**
 * Truthful Google-ratings trust display. Every number comes from
 * src/lib/googleRatings.ts (Google Business Profile, verified 2026-10-18:
 * 5.0 stars, 2 reviews) — nothing is hard-coded here, and quote cards render
 * only when verbatim review text has been added to that module.
 *
 * Variants:
 * - "full"  — cream card for the homepage proof area (heading, aggregate,
 *   optional quote cards, read/review links).
 * - "strip" — one-line rating summary for the /shop header card.
 */

const STAR_PATH = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

function StarRow({ filled, starClassName = "h-5 w-5" }: { filled: number; starClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`${starClassName} ${i < filled ? "text-gold" : "text-gold/30"}`}
        >
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

type GoogleRatingsTrustProps = {
  variant?: "full" | "strip";
  className?: string;
};

export default function GoogleRatingsTrust({ variant = "full", className = "" }: GoogleRatingsTrustProps) {
  const rating = formatGoogleRatingValue();
  const countLabel = getGoogleReviewCountLabel();
  const fullStars = getGoogleFullStarCount();
  const { reviewUrl, reviews } = GOOGLE_RATINGS;

  if (variant === "strip") {
    return (
      <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 ${className}`}>
        <StarRow filled={fullStars} starClassName="h-4 w-4" />
        <span className="text-midnight text-sm font-semibold">Rated {rating} on Google</span>
        <span className="text-sm text-neutral-600">· {countLabel}</span>
        <a
          href={reviewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2 transition hover:text-amber-800"
        >
          Read reviews
        </a>
        <span className="sr-only">
          StarMapCo is rated {rating} out of 5 stars from {countLabel} on Google.
        </span>
      </div>
    );
  }

  return (
    <div
      className={`text-midnight rounded-3xl border border-amber-200/60 bg-white/85 px-5 py-8 text-center shadow-md sm:px-8 ${className}`}
    >
      <p className="text-xs font-semibold tracking-[0.25em] text-amber-800 uppercase">Customer ratings</p>
      <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Rated {rating} on Google</h2>
      <div className="mt-4 flex justify-center">
        <StarRow filled={fullStars} starClassName="h-6 w-6" />
      </div>
      <p className="sr-only">
        Rated {rating} out of 5 stars from {countLabel} on Google.
      </p>
      <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-700 sm:text-base">
        We&apos;re a young shop, and our first customers have rated us {rating} out of 5 across {countLabel}{" "}
        on our Google listing. Read them there — and if you&apos;ve ordered from us, we&apos;d love yours too.
      </p>

      {reviews.length > 0 ? (
        <div className="mt-6 grid gap-4 text-left sm:grid-cols-2">
          {reviews.map((review) => (
            <figure
              key={`${review.authorFirstName}-${review.quote.slice(0, 24)}`}
              className="rounded-2xl border border-amber-200/70 bg-white/80 p-4 shadow-[0_10px_24px_rgba(14,22,40,0.08)]"
            >
              <StarRow filled={review.rating} starClassName="h-4 w-4" />
              <blockquote className="mt-2 text-sm text-neutral-800">&ldquo;{review.quote}&rdquo;</blockquote>
              <figcaption className="mt-2 text-xs font-semibold text-neutral-600">
                {review.authorFirstName} · via Google
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href={reviewUrl}
          target="_blank"
          rel="noreferrer"
          className="cta-gradient text-midnight inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
        >
          Read reviews on Google
        </a>
        <a
          href={reviewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-midnight inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-white/70 px-5 py-2.5 text-sm font-semibold transition hover:-translate-y-1 hover:bg-white"
        >
          Review us on Google
        </a>
      </div>
    </div>
  );
}
