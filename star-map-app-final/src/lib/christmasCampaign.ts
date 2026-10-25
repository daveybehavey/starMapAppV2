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
  | "poster_us"
  | "poster_ca"
  | "mug_us"
  | "mug_ca"
  | "card_us"
  | "card_ca";

/** Local calendar dates in America/Los_Angeles. */
export const CHRISTMAS_ORDER_BY_DATES: Record<ChristmasCutoffKey, string> = {
  // No rest-of-world keys exist for any product: Printful publishes
  // holiday deadlines per destination country only, never a single
  // rest-of-world date (verified 2026-10-18 — the framed Nov 30 /
  // poster Dec 1 figures previously here appear in no Printful
  // source). Every rest-of-world cell shows "Order early" instead.
  framed_us: "2026-12-08",
  // framed_ca tightened Dec 9 → Dec 3 (decision 2026-10-22): Printful
  // fulfilment runs 2–5 business days and Canada delivery 3–10 business
  // days, so a Dec 9 order can land after Christmas; a Dec 3 order's
  // worst case lands Dec 24. Canvas has no cutoff key of its own and
  // shares this value (see ORDER_BY_PRODUCT_CUTOFFS), so the canvas
  // Canada order-by date moves with it.
  framed_ca: "2026-12-03",
  poster_us: "2026-12-09",
  poster_ca: "2026-12-10",
  // Mug + keepsake card: owner-approved provisional cutoffs (2026-10-18).
  // No rest-of-world date is confirmed for either — the order-by table
  // shows "Order early" there instead of inventing one.
  mug_us: "2026-12-07",
  mug_ca: "2026-12-08",
  card_us: "2026-12-07",
  card_ca: "2026-12-08",
};

/**
 * Seasonal print promo codes, publicised per phase below. The code
 * strings redeem as Stripe promotion codes with the same code text, so
 * changing a code or percent here requires the matching Stripe coupon /
 * promotion code to exist before its phase starts. Black Friday and
 * Cyber Monday depth set to 25% by owner decision 2026-10-25.
 */
export const CHRISTMAS_PROMO = {
  xmas15: { code: "XMAS15", percent: 15 },
  blackFriday: { code: "BLACKFRIDAY25", percent: 25 },
} as const;

/**
 * Owner kill-switch for publicising the seasonal print promo codes
 * (XMAS15 / BLACKFRIDAY25). While true — the behaviour the site has today —
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
/** Cyber Monday (Nov 30) plus its usual extension day; BLACKFRIDAY25 continues. */
const CYBER_MONDAY_START = "2026-11-30";
const XMAS15_LAST_CALL_START = "2026-12-02";
/** Starts Dec 11 — after the Dec 10 Canada poster order-by day, print ordering has closed. */
const DIGITAL_LAST_MINUTE_START = "2026-12-11";
const DIGITAL_LAST_MINUTE_END = "2026-12-25";
/** Boxing Day only (Dec 26): XMAS15 returns for prints; Dec 27+ is off-season. */
const BOXING_DAY = "2026-12-26";

/**
 * The sitewide banner's order-by summary. Built from
 * CHRISTMAS_ORDER_BY_DATES (never hard-coded dates) and leads with the
 * earliest cutoff per country — today framed/canvas in Canada (Dec 3)
 * and the mug and keepsake card in the US (Dec 7) — because the loudest
 * surface on the site must carry the tightest deadline (persona sweep
 * U05: the banner previously named only framed/canvas and posters, so
 * the earliest cutoffs lived only inside the order-by table).
 */
function getOrderByBannerLine(): string {
  const earliest = getEarliestChristmasCutoff();
  return (
    `Order by these dates for Christmas delivery — earliest cutoffs: ` +
    `US ${earliest.unitedStates} (${formatEarliestProductsLabel(earliest.unitedStatesProducts)}) · ` +
    `Canada ${earliest.canada} (${formatEarliestProductsLabel(earliest.canadaProducts)}). ` +
    `Framed/canvas: US ${formatOrderByDisplayDate("framed_us")} · Canada ${formatOrderByDisplayDate("framed_ca")} · rest of world: order early. ` +
    `Posters: US ${formatOrderByDisplayDate("poster_us")} · Canada ${formatOrderByDisplayDate("poster_ca")} · rest of world: order early.`
  );
}

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

// instantHdPriceLabel is a required parameter on the helpers below: every
// caller passes a currency-coded label (production callers pass
// getInstantHdPriceLine()), so there is no bare-"$9" fallback that could
// drift from the formatPrice convention.
export function getChristmasBannerContent(
  nowMs: number = Date.now(),
  instantHdPriceLabel: string
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
      message: `15% off prints with code ${CHRISTMAS_PROMO.xmas15.code}. ${getOrderByBannerLine()}`,
      ctaHref: "/christmas-star-map-gift",
      ctaLabel: "Shop Christmas prints",
      promoCode: CHRISTMAS_PROMO.xmas15.code,
      promoPercent: CHRISTMAS_PROMO.xmas15.percent,
    };
  }

  if (phase === "black_friday" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      message: `Black Friday: 25% off prints with code ${CHRISTMAS_PROMO.blackFriday.code}`,
      ctaHref: "/christmas-star-map-gift",
      ctaLabel: "Shop Black Friday prints",
      promoCode: CHRISTMAS_PROMO.blackFriday.code,
      promoPercent: CHRISTMAS_PROMO.blackFriday.percent,
    };
  }

  if (phase === "cyber_monday" && CHRISTMAS_PROMO_PUBLICITY) {
    return {
      phase,
      message: `Cyber Monday: 25% off prints with code ${CHRISTMAS_PROMO.blackFriday.code}`,
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
      message: `Last call: 15% off prints with ${CHRISTMAS_PROMO.xmas15.code}. ${getOrderByBannerLine()}`,
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
    message: getOrderByBannerLine(),
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
      discountLine: `Black Friday: 25% off prints with code ${CHRISTMAS_PROMO.blackFriday.code}`,
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
      discountLine: `Cyber Monday: 25% off prints with code ${CHRISTMAS_PROMO.blackFriday.code}`,
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
 * The physical products' order-by dates, as (Canada, US) cutoff-key
 * pairs — the one place product names meet CHRISTMAS_ORDER_BY_DATES.
 * Canvas has no cutoff key of its own: it ships on the framed profile
 * (see printCatalog `canvas_wrap`) and shares the framed dates. The
 * card is named "Keepsake card" — the register the rest of the site
 * uses (the "Framed + keepsake card" bundle naming in printCatalog).
 */
const ORDER_BY_PRODUCT_CUTOFFS: ReadonlyArray<{
  product: string;
  canadaKey: ChristmasCutoffKey;
  unitedStatesKey: ChristmasCutoffKey;
}> = [
  { product: "Framed print", canadaKey: "framed_ca", unitedStatesKey: "framed_us" },
  { product: "Canvas wrap", canadaKey: "framed_ca", unitedStatesKey: "framed_us" },
  { product: "Unframed poster", canadaKey: "poster_ca", unitedStatesKey: "poster_us" },
  { product: "Mug", canadaKey: "mug_ca", unitedStatesKey: "mug_us" },
  { product: "Keepsake card", canadaKey: "card_ca", unitedStatesKey: "card_us" },
];

export type ChristmasEarliestCutoff = {
  /** Products tied at the earliest date in either country, in table order. */
  products: string[];
  /** Products tied at the earliest Canada date, in table order. */
  canadaProducts: string[];
  /** Products tied at the earliest US date, in table order. */
  unitedStatesProducts: string[];
  /** Display dates (e.g. "Dec 8") of the earliest Canada / US cutoffs. */
  canada: string;
  unitedStates: string;
};

/**
 * The earliest Christmas order-by cutoff across every physical
 * product, derived from CHRISTMAS_ORDER_BY_DATES. Today that is the
 * framed print and canvas wrap in Canada (Dec 3) and the mug and
 * keepsake card in the US (Dec 7) — the deadlines the banner and the
 * landing bullets lead with (persona sweep U05). The per-country
 * product lists stay separate on purpose: one combined label paired
 * with both countries' dates read as a second, wrong US date for
 * framed/canvas (Dec 7 next to the framed line's Dec 8 — flagged
 * 2026-10-24), so surfaces name each country's products with its
 * own date.
 */
export function getEarliestChristmasCutoff(): ChristmasEarliestCutoff {
  // The cutoff table is never empty, so seeding from its first entry is safe.
  let earliestCanadaKey = ORDER_BY_PRODUCT_CUTOFFS[0].canadaKey;
  let earliestUnitedStatesKey = ORDER_BY_PRODUCT_CUTOFFS[0].unitedStatesKey;
  for (const entry of ORDER_BY_PRODUCT_CUTOFFS) {
    if (CHRISTMAS_ORDER_BY_DATES[entry.canadaKey] < CHRISTMAS_ORDER_BY_DATES[earliestCanadaKey]) {
      earliestCanadaKey = entry.canadaKey;
    }
    if (
      CHRISTMAS_ORDER_BY_DATES[entry.unitedStatesKey] <
      CHRISTMAS_ORDER_BY_DATES[earliestUnitedStatesKey]
    ) {
      earliestUnitedStatesKey = entry.unitedStatesKey;
    }
  }

  const products: string[] = [];
  const canadaProducts: string[] = [];
  const unitedStatesProducts: string[] = [];
  for (const entry of ORDER_BY_PRODUCT_CUTOFFS) {
    const canadaTied =
      CHRISTMAS_ORDER_BY_DATES[entry.canadaKey] === CHRISTMAS_ORDER_BY_DATES[earliestCanadaKey];
    const unitedStatesTied =
      CHRISTMAS_ORDER_BY_DATES[entry.unitedStatesKey] ===
      CHRISTMAS_ORDER_BY_DATES[earliestUnitedStatesKey];
    if (canadaTied) canadaProducts.push(entry.product);
    if (unitedStatesTied) unitedStatesProducts.push(entry.product);
    if ((canadaTied || unitedStatesTied) && !products.includes(entry.product)) {
      products.push(entry.product);
    }
  }

  return {
    products,
    canadaProducts,
    unitedStatesProducts,
    canada: formatOrderByDisplayDate(earliestCanadaKey),
    unitedStates: formatOrderByDisplayDate(earliestUnitedStatesKey),
  };
}

/** Lowercase plural label per table product, for prose ("mugs & keepsake cards"). */
const EARLIEST_CUTOFF_LABEL_PARTS: Record<string, string> = {
  "Framed print": "framed prints",
  "Canvas wrap": "canvas wraps",
  "Unframed poster": "posters",
  Mug: "mugs",
  "Keepsake card": "keepsake cards",
};

function formatEarliestProductsLabel(products: string[]): string {
  const parts = products.map(
    (product) => EARLIEST_CUTOFF_LABEL_PARTS[product] ?? product.toLowerCase()
  );
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}

/**
 * Exported for tests / landing page display. These lines feed the
 * landing-page bullets above the order-by table AND the "What are the
 * Christmas order-by dates?" FAQ, so they lead with the earliest
 * cutoff (persona sweep U05) and stay derived from
 * CHRISTMAS_ORDER_BY_DATES like everything else.
 */
export function getChristmasOrderBySummaryLines(): string[] {
  const earliest = getEarliestChristmasCutoff();
  const line = (label: string, unitedStatesKey: ChristmasCutoffKey, canadaKey: ChristmasCutoffKey) =>
    `${label}: United States ${formatOrderByDisplayDate(unitedStatesKey)} · Canada ${formatOrderByDisplayDate(canadaKey)} · rest of world: order early`;
  return [
    `Earliest cutoffs: United States ${earliest.unitedStates} (${formatEarliestProductsLabel(earliest.unitedStatesProducts)}) · Canada ${earliest.canada} (${formatEarliestProductsLabel(earliest.canadaProducts)}) · rest of world: order early`,
    line("Framed & canvas", "framed_us", "framed_ca"),
    line("Posters", "poster_us", "poster_ca"),
  ];
}

/**
 * Rows for the Christmas order-by table, derived from
 * CHRISTMAS_ORDER_BY_DATES so the table can never drift from the banner,
 * the landing summary lines, or the FAQ. Mug and keepsake card use the
 * owner-approved provisional cutoffs (Canada Dec 8 · US Dec 7, approved
 * 2026-10-18). No rest-of-world date is confirmed for ANY product —
 * Printful publishes holiday deadlines per destination country only —
 * so every rest-of-world cell reads "Order early" rather than an
 * invented date.
 */
export function getChristmasOrderByTableRows(): ChristmasOrderByTableRow[] {
  const rows: ChristmasOrderByTableRow[] = ORDER_BY_PRODUCT_CUTOFFS.map((entry) => ({
    product: entry.product,
    canada: formatOrderByDisplayDate(entry.canadaKey),
    unitedStates: formatOrderByDisplayDate(entry.unitedStatesKey),
    restOfWorld: REST_OF_WORLD_UNCONFIRMED_LABEL,
    instantNote: null,
  }));
  rows.push({
    product: "HD digital download",
    canada: null,
    unitedStates: null,
    restOfWorld: null,
    instantNote: "Order any time — delivered instantly",
  });
  return rows;
}

export function isChristmasLandingInSeason(nowMs: number = Date.now()): boolean {
  const today = getPacificCalendarDate(nowMs);
  return compareYmd(today, CAMPAIGN_YEAR_START) >= 0 && compareYmd(today, DIGITAL_LAST_MINUTE_END) <= 0;
}

/** Test helper — unused in production paths. */
export function __christmasDatePartsForTests(ymd: string) {
  return parseYmd(ymd);
}

export function getChristmasDigitalPitchLine(instantHdPriceLabel: string): string {
  return `Missed the print window? The ${instantHdPriceLabel} instant HD file is a last-minute gift through December 25 — ready to send the same day.`;
}
