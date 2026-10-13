/**
 * Date-driven Christmas 2026 campaign copy and visibility.
 * Cutoffs are buffered order-by dates (Printful-informed); digital push Dec 11–25.
 */

export type ChristmasBannerPhase = "order_by" | "digital_last_minute" | "hidden";

export type ChristmasCutoffKey = "framed_us" | "framed_ca" | "framed_row" | "poster_us" | "poster_ca" | "poster_row";

/** Local calendar dates in America/Los_Angeles (plan prepared in PT). */
export const CHRISTMAS_ORDER_BY_DATES: Record<ChristmasCutoffKey, string> = {
  framed_us: "2026-12-08",
  framed_ca: "2026-12-09",
  framed_row: "2026-11-30",
  poster_us: "2026-12-09",
  poster_ca: "2026-12-10",
  poster_row: "2026-12-01",
};

const DIGITAL_LAST_MINUTE_START = "2026-12-11";
const DIGITAL_LAST_MINUTE_END = "2026-12-25";
const CAMPAIGN_YEAR_START = "2026-10-01";

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map((part) => Number(part));
  return { y, m, d };
}

/** Calendar YYYY-MM-DD in America/Los_Angeles for a given instant. */
export function getPacificCalendarDate(nowMs: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function resolveChristmasBannerPhase(nowMs: number = Date.now()): ChristmasBannerPhase {
  const today = getPacificCalendarDate(nowMs);
  if (compareYmd(today, CAMPAIGN_YEAR_START) < 0) return "hidden";
  if (compareYmd(today, DIGITAL_LAST_MINUTE_END) > 0) return "hidden";
  if (compareYmd(today, DIGITAL_LAST_MINUTE_START) >= 0) return "digital_last_minute";
  return "order_by";
}

export type ChristmasBannerContent = {
  phase: ChristmasBannerPhase;
  message: string;
  ctaHref: string;
  ctaLabel: string;
};

export function getChristmasBannerContent(
  nowMs: number = Date.now(),
  instantHdPriceLabel = "$9"
): ChristmasBannerContent | null {
  const phase = resolveChristmasBannerPhase(nowMs);
  if (phase === "hidden") return null;

  if (phase === "digital_last_minute") {
    return {
      phase,
      message: `Last-minute Christmas gift: get the ${instantHdPriceLabel} instant HD star map file — ready to send today.`,
      ctaHref: "/christmas-star-map-gift",
      ctaLabel: "Shop instant HD gift",
    };
  }

  return {
    phase,
    message:
      "Order by for Christmas delivery — framed/canvas: US Dec 8 · Canada Dec 9 · worldwide Nov 30. Posters: US Dec 9 · Canada Dec 10 · worldwide Dec 1.",
    ctaHref: "/christmas-star-map-gift",
    ctaLabel: "Christmas star map gifts",
  };
}

/** Exported for tests / landing page display. */
export function getChristmasOrderBySummaryLines(): string[] {
  return [
    "Framed & canvas: United States Dec 8 · Canada Dec 9 · rest of world Nov 30",
    "Posters: United States Dec 9 · Canada Dec 10 · rest of world Dec 1",
  ];
}

export function isChristmasLandingInSeason(nowMs: number = Date.now()): boolean {
  const today = getPacificCalendarDate(nowMs);
  return compareYmd(today, CAMPAIGN_YEAR_START) >= 0 && compareYmd(today, DIGITAL_LAST_MINUTE_END) <= 0;
}

/** Test helper — unused in production paths. */
export function __christmasDatePartsForTests(ymd: string) {
  return parseYmd(ymd);
}
