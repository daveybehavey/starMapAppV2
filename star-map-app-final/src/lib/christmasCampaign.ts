/**
 * Date-driven Christmas 2026 campaign copy and visibility (America/Los_Angeles).
 * Cutoffs are buffered order-by dates; discount codes apply to prints only (not HD digital).
 */

export type ChristmasBannerPhase =
  | "order_by"
  | "xmas15_early"
  | "black_friday"
  | "cyber_monday"
  | "xmas15_last_call"
  | "digital_last_minute"
  | "boxing_day"
  | "hidden";

export type ChristmasCutoffKey =
  | "framed_us"
  | "framed_ca"
  | "framed_row"
  | "poster_us"
  | "poster_ca"
  | "poster_row"
  | "mug_us"
  | "mug_ca"
  | "card_us"
  | "card_ca";

/** Local calendar dates in America/Los_Angeles. */
export const CHRISTMAS_ORDER_BY_DATES: Record<ChristmasCutoffKey, string> = {
  framed_us: "2026-12-08",
  framed_ca: "2026-12-09",
  framed_row: "2026-11-30",
  poster_us: "2026-12-09",
  poster_ca: "2026-12-10",
  poster_row: "2026-12-01",
  // Mug + greeting card: owner-approved provisional cutoffs (2026-10-18).
  // No rest-of-world date is confirmed for either — the order-by table
  // shows "Order early" there instead of inventing one.
  mug_us: "2026-12-07",
  mug_ca: "2026-12-08",
  card_us: "2026-12-07",
  card_ca: "2026-12-08",
};

export const CHRISTMAS_PROMO = {
  xmas15: { code: "XMAS15", percent: 15 },
  blackFriday: { code: "BLACKFRIDAY20", percent: 20 },
} as const;

/**
 * Owner kill-switch for publicising the seasonal print promo codes
 * (XMAS15 / BLACKFRIDAY20). While true — the behaviour the site has today —
 * the codes are named in the sitewide banner, the Christmas landing promo
 * box, and the landing-page FAQ during their campaign phases. Set to false
 * to stop publicising them: those surfaces fall back to order-by content
 * with no codes named. The codes still redeem at checkout either way;
 * this flag only gates their display.
 */
export const CHRISTMAS_PROMO_PUBLICITY = true;

const CAMPAIGN_YEAR_START = "2026-10-01";
const XMAS15_EARLY_START = "2026-11-01";
const BLACK_FRIDAY_START = "2026-11-27";
/** Cyber Monday (Nov 30) plus its usual extension day; BLACKFRIDAY20 continues. */
const CYBER_MONDAY_START = "2026-11-30";
const XMAS15_LAST_CALL_START = "2026-12-02";
/** Starts Dec 11 — after the Dec 10 Canada poster order-by day, print ordering has closed. */
const DIGITAL_LAST_MINUTE_START = "2026-12-11";
const DIGITAL_LAST_MINUTE_END = "2026-12-25";
/** Boxing Day only (Dec 26): XMAS15 returns for prints; Dec 27+ is off-season. */
const BOXING_DAY = "2026-12-26";

const ORDER_BY_BANNER_LINE =
  "Order by these dates for Christmas delivery — framed/canvas: US Dec 8 · Canada Dec 9 · worldwide Nov 30. Posters: US Dec 9 · Canada Dec 10 · worldwide Dec 1.";

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

/**
 * Parse a campaign clock override.
 * Accepts `YYYY-MM-DD` (treated as noon Pacific) or a full ISO timestamp.
 */
export function parseChristmasCampaignNowOverride(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // 20:00 UTC is noon PST / 1pm PDT — same Pacific calendar day in both offsets.
    const ms = Date.parse(`${trimmed}T20:00:00.000Z`);
    return Number.isFinite(ms) ? ms : null;
  }

  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve the effective campaign clock.
 * Priority: explicit nowMs → options.override → env CHRISTMAS_CAMPAIGN_NOW /
 * NEXT_PUBLIC_CHRISTMAS_CAMPAIGN_NOW → Date.now().
 */
export function resolveChristmasCampaignNowMs(options?: {
  nowMs?: number;
  override?: string | null;
}): number {
  if (typeof options?.nowMs === "number" && Number.isFinite(options.nowMs)) {
    return options.nowMs;
  }
  const fromArg = parseChristmasCampaignNowOverride(options?.override ?? undefined);
  if (fromArg != null) return fromArg;

  const fromEnv = parseChristmasCampaignNowOverride(
    process.env.CHRISTMAS_CAMPAIGN_NOW ?? process.env.NEXT_PUBLIC_CHRISTMAS_CAMPAIGN_NOW
  );
  if (fromEnv != null) return fromEnv;

  return Date.now();
}

export function resolveChristmasBannerPhase(nowMs: number = Date.now()): ChristmasBannerPhase {
  const today = getPacificCalendarDate(nowMs);
  if (compareYmd(today, CAMPAIGN_YEAR_START) < 0) return "hidden";
  if (compareYmd(today, BOXING_DAY) === 0) return "boxing_day";
  if (compareYmd(today, DIGITAL_LAST_MINUTE_END) > 0) return "hidden";
  if (compareYmd(today, DIGITAL_LAST_MINUTE_START) >= 0) return "digital_last_minute";
  if (compareYmd(today, XMAS15_LAST_CALL_START) >= 0) return "xmas15_last_call";
  if (compareYmd(today, CYBER_MONDAY_START) >= 0) return "cyber_monday";
  if (compareYmd(today, BLACK_FRIDAY_START) >= 0) return "black_friday";
  if (compareYmd(today, XMAS15_EARLY_START) >= 0) return "xmas15_early";
  return "order_by";
}

export type ChristmasBannerContent = {
  phase: ChristmasBannerPhase;
  message: string;
  ctaHref: string;
  ctaLabel: string;
  /** Present when a print-only discount code is in market. */
  promoCode?: string;
  promoPercent?: number;
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

  if (phase === "xmas15_early" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      message: `15% off prints with code ${CHRISTMAS_PROMO.xmas15.code}. ${ORDER_BY_BANNER_LINE}`,
      ctaHref: "/christmas-star-map-gift",
      ctaLabel: "Shop Christmas prints",
      promoCode: CHRISTMAS_PROMO.xmas15.code,
      promoPercent: CHRISTMAS_PROMO.xmas15.percent,
    };
  }

  if (phase === "black_friday" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      message: `Black Friday: 20% off prints with code ${CHRISTMAS_PROMO.blackFriday.code}`,
      ctaHref: "/christmas-star-map-gift",
      ctaLabel: "Shop Black Friday prints",
      promoCode: CHRISTMAS_PROMO.blackFriday.code,
      promoPercent: CHRISTMAS_PROMO.blackFriday.percent,
    };
  }

  if (phase === "cyber_monday" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      message: `Cyber Monday: 20% off prints with code ${CHRISTMAS_PROMO.blackFriday.code}`,
      ctaHref: "/christmas-star-map-gift",
      ctaLabel: "Shop Cyber Monday prints",
      promoCode: CHRISTMAS_PROMO.blackFriday.code,
      promoPercent: CHRISTMAS_PROMO.blackFriday.percent,
    };
  }

  if (phase === "boxing_day") {
    if (!CHRISTMAS_PROMO_PUBLICITY) {
      // No code-free fallback fits Boxing Day — the order-by line is all
      // Christmas-delivery framing, which has passed — so the banner
      // stays hidden rather than show stale dates.
      return null;
    }
    return {
      phase,
      message: `Boxing Day: 15% off prints with code ${CHRISTMAS_PROMO.xmas15.code}`,
      ctaHref: "/christmas-star-map-gift",
      ctaLabel: "Shop Boxing Day prints",
      promoCode: CHRISTMAS_PROMO.xmas15.code,
      promoPercent: CHRISTMAS_PROMO.xmas15.percent,
    };
  }

  if (phase === "xmas15_last_call" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      message: `Last call: 15% off prints with ${CHRISTMAS_PROMO.xmas15.code}. ${ORDER_BY_BANNER_LINE}`,
      ctaHref: "/christmas-star-map-gift",
      ctaLabel: "Shop Christmas prints",
      promoCode: CHRISTMAS_PROMO.xmas15.code,
      promoPercent: CHRISTMAS_PROMO.xmas15.percent,
    };
  }

  // Before Nov 1 (still in campaign season): order-by banner without discount codes.
  // Also the fallback for the promo phases when CHRISTMAS_PROMO_PUBLICITY is off.
  return {
    phase,
    message: ORDER_BY_BANNER_LINE,
    ctaHref: "/christmas-star-map-gift",
    ctaLabel: "Christmas star map gifts",
  };
}

export type ChristmasLandingPromo = {
  phase: ChristmasBannerPhase;
  heading: string;
  discountLine: string | null;
  showOrderBy: boolean;
  showDigitalPitch: boolean;
  promoCode: string | null;
  digitalExcludedNote: string | null;
};

/** Landing-page promo block aligned with the sitewide banner windows. */
export function getChristmasLandingPromo(nowMs: number = Date.now()): ChristmasLandingPromo {
  const phase = resolveChristmasBannerPhase(nowMs);

  if (phase === "digital_last_minute") {
    return {
      phase,
      heading: "Last-minute Christmas gift",
      discountLine: null,
      showOrderBy: false,
      showDigitalPitch: true,
      promoCode: null,
      digitalExcludedNote: null,
    };
  }

  if (phase === "xmas15_early" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      heading: "Christmas print sale",
      discountLine: `15% off prints with code ${CHRISTMAS_PROMO.xmas15.code}`,
      showOrderBy: true,
      showDigitalPitch: true,
      promoCode: CHRISTMAS_PROMO.xmas15.code,
      digitalExcludedNote: "Discount codes apply to prints only — HD digital is excluded.",
    };
  }

  if (phase === "black_friday" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      heading: "Black Friday print sale",
      discountLine: `Black Friday: 20% off prints with code ${CHRISTMAS_PROMO.blackFriday.code}`,
      showOrderBy: true,
      showDigitalPitch: true,
      promoCode: CHRISTMAS_PROMO.blackFriday.code,
      digitalExcludedNote: "Discount codes apply to prints only — HD digital is excluded.",
    };
  }

  if (phase === "cyber_monday" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      heading: "Cyber Monday print sale",
      discountLine: `Cyber Monday: 20% off prints with code ${CHRISTMAS_PROMO.blackFriday.code}`,
      showOrderBy: true,
      showDigitalPitch: true,
      promoCode: CHRISTMAS_PROMO.blackFriday.code,
      digitalExcludedNote: "Discount codes apply to prints only — HD digital is excluded.",
    };
  }

  if (phase === "boxing_day" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      heading: "Boxing Day print sale",
      discountLine: `Boxing Day: 15% off prints with code ${CHRISTMAS_PROMO.xmas15.code}`,
      // Christmas delivery has passed — no order-by content, Boxing Day
      // framing only. The digital pitch is off too: the only pitch line
      // (getChristmasDigitalPitchLine) is Christmas-framed — "last-minute
      // gift through December 25" — which would be expired copy on Dec 26.
      showOrderBy: false,
      showDigitalPitch: false,
      promoCode: CHRISTMAS_PROMO.xmas15.code,
      digitalExcludedNote: "Discount codes apply to prints only — HD digital is excluded.",
    };
  }

  if (phase === "xmas15_last_call" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      heading: "Last call for Christmas prints",
      discountLine: `Last call: 15% off prints with ${CHRISTMAS_PROMO.xmas15.code}`,
      showOrderBy: true,
      showDigitalPitch: true,
      promoCode: CHRISTMAS_PROMO.xmas15.code,
      digitalExcludedNote: "Discount codes apply to prints only — HD digital is excluded.",
    };
  }

  if (phase === "hidden" || phase === "boxing_day") {
    // Boxing Day reaches here only when CHRISTMAS_PROMO_PUBLICITY is off
    // (the on case returned above): show the neutral block rather than
    // order-by dates that have already passed.
    return {
      phase,
      heading: "Christmas star map gifts",
      discountLine: null,
      showOrderBy: false,
      showDigitalPitch: false,
      promoCode: null,
      digitalExcludedNote: null,
    };
  }

  // Order-by phase — and the fallback for the promo phases when
  // CHRISTMAS_PROMO_PUBLICITY is off (dates only, no codes named).
  return {
    phase,
    heading: "Christmas order-by dates",
    discountLine: null,
    showOrderBy: true,
    showDigitalPitch: true,
    promoCode: null,
    digitalExcludedNote: null,
  };
}

/**
 * Landing-page FAQ answer for "Do Christmas discount codes apply to HD
 * digital?" — names the codes only while CHRISTMAS_PROMO_PUBLICITY is on;
 * otherwise keeps the prints-only rule without publicising either code.
 */
export function getChristmasPromoCodesFaqAnswer(): string {
  if (CHRISTMAS_PROMO_PUBLICITY) {
    return `No. Seasonal codes such as ${CHRISTMAS_PROMO.xmas15.code} and ${CHRISTMAS_PROMO.blackFriday.code} apply to prints only. HD digital is excluded from those promotions.`;
  }
  return "No. Seasonal codes apply to prints only. HD digital is excluded from those promotions.";
}

/** Exported for tests / landing page display. */
export function getChristmasOrderBySummaryLines(): string[] {
  return [
    "Framed & canvas: United States Dec 8 · Canada Dec 9 · rest of world Nov 30",
    "Posters: United States Dec 9 · Canada Dec 10 · rest of world Dec 1",
  ];
}

export type ChristmasOrderByTableRow = {
  product: string;
  /** Display date (e.g. "Dec 9") per region; null only on the instant row. */
  canada: string | null;
  unitedStates: string | null;
  restOfWorld: string | null;
  /** Set on the HD digital row: one note spanning every date column. */
  instantNote: string | null;
};

const ORDER_BY_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatOrderByDisplayDate(key: ChristmasCutoffKey): string {
  const { m, d } = parseYmd(CHRISTMAS_ORDER_BY_DATES[key]);
  return `${ORDER_BY_MONTH_LABELS[m - 1]} ${d}`;
}

/** Shown where no order-by date is confirmed for a region — never invent one. */
const REST_OF_WORLD_UNCONFIRMED_LABEL = "Order early";

/**
 * Rows for the Christmas order-by table, derived from
 * CHRISTMAS_ORDER_BY_DATES so the table can never drift from the banner,
 * the landing summary lines, or the FAQ. Canvas has no cutoff key of its
 * own: it ships on the framed profile (see printCatalog `canvas_wrap`)
 * and shares the framed dates, exactly as the summary lines present it.
 * Mug and greeting card use the owner-approved provisional cutoffs
 * (Canada Dec 8 · US Dec 7, approved 2026-10-18); no rest-of-world date
 * is confirmed for either, so that cell reads "Order early".
 */
export function getChristmasOrderByTableRows(): ChristmasOrderByTableRow[] {
  const framed = {
    canada: formatOrderByDisplayDate("framed_ca"),
    unitedStates: formatOrderByDisplayDate("framed_us"),
    restOfWorld: formatOrderByDisplayDate("framed_row"),
  };
  return [
    { product: "Framed print", ...framed, instantNote: null },
    { product: "Canvas wrap", ...framed, instantNote: null },
    {
      product: "Unframed poster",
      canada: formatOrderByDisplayDate("poster_ca"),
      unitedStates: formatOrderByDisplayDate("poster_us"),
      restOfWorld: formatOrderByDisplayDate("poster_row"),
      instantNote: null,
    },
    {
      product: "Mug",
      canada: formatOrderByDisplayDate("mug_ca"),
      unitedStates: formatOrderByDisplayDate("mug_us"),
      restOfWorld: REST_OF_WORLD_UNCONFIRMED_LABEL,
      instantNote: null,
    },
    {
      product: "Greeting card",
      canada: formatOrderByDisplayDate("card_ca"),
      unitedStates: formatOrderByDisplayDate("card_us"),
      restOfWorld: REST_OF_WORLD_UNCONFIRMED_LABEL,
      instantNote: null,
    },
    {
      product: "HD digital download",
      canada: null,
      unitedStates: null,
      restOfWorld: null,
      instantNote: "Order any time — delivered instantly",
    },
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

export function getChristmasDigitalPitchLine(instantHdPriceLabel = "$9"): string {
  return `Missed the print window? The ${instantHdPriceLabel} instant HD file is a last-minute gift through December 25 — ready to send the same day.`;
}
