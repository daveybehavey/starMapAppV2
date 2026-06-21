export type BlogOccasion =
  | "wedding"
  | "anniversary"
  | "birthday"
  | "new-baby"
  | "memorial"
  | "seasonal"
  | "gift-guide"
  | "general";

export type BlogMoneyPageLink = {
  href: string;
  label: string;
};

/** Canonical money-page targets for blog conversion modules. */
export const BLOG_MONEY_PAGE_LINKS: readonly BlogMoneyPageLink[] = [
  { href: "/star-map-generator", label: "Free star map generator" },
  { href: "/wedding", label: "Wedding star maps" },
  { href: "/anniversary", label: "Anniversary star maps" },
  { href: "/birthday", label: "Birthday star maps" },
  { href: "/star-map-for/new-baby", label: "New baby star maps" },
  { href: "/star-map-for/memorial", label: "Memorial star maps" },
  { href: "/hd-star-map", label: "Instant HD download" },
  { href: "/shop", label: "Shop prints & formats" },
  { href: "/personalized-star-map", label: "Personalized star map gifts" },
  { href: "/star-map-gift", label: "Star map gift ideas" },
  { href: "/blog/memorial-star-map", label: "Memorial star map guide" },
  { href: "/blog/birth-star-map", label: "Birth star map guide" },
] as const;

const OCCASION_LINK_ORDER: Record<BlogOccasion, string[]> = {
  wedding: ["/wedding", "/star-map-generator", "/hd-star-map", "/shop", "/anniversary", "/personalized-star-map"],
  anniversary: ["/anniversary", "/star-map-generator", "/wedding", "/hd-star-map", "/shop", "/personalized-star-map"],
  birthday: ["/birthday", "/star-map-generator", "/hd-star-map", "/shop", "/personalized-star-map"],
  "new-baby": ["/star-map-for/new-baby", "/blog/birth-star-map", "/hd-star-map", "/star-map-generator", "/shop"],
  memorial: ["/star-map-for/memorial", "/blog/memorial-star-map", "/hd-star-map", "/star-map-generator", "/personalized-star-map"],
  seasonal: ["/star-map-generator", "/hd-star-map", "/star-map-gift", "/shop", "/personalized-star-map"],
  "gift-guide": ["/star-map-generator", "/personalized-star-map", "/star-map-gift", "/shop", "/hd-star-map"],
  general: ["/star-map-generator", "/personalized-star-map", "/wedding", "/anniversary", "/hd-star-map", "/shop"],
};

const SLUG_OCCASION_RULES: Array<{ test: RegExp; occasion: BlogOccasion }> = [
  { test: /wedding|proposal|engagement|valentine/i, occasion: "wedding" },
  { test: /anniversary|meaningful-dates|new-year/i, occasion: "anniversary" },
  { test: /birthday|birth-day/i, occasion: "birthday" },
  { test: /birth-star|new-baby|baby|nursery|shower/i, occasion: "new-baby" },
  { test: /memorial|remembrance|bereavement|loss/i, occasion: "memorial" },
  { test: /canada-day|july-4|fathers-day|mothers-day|graduation|seasonal/i, occasion: "seasonal" },
  { test: /good-gift|gift-for-couples|gift-ideas|milestones|format-choose/i, occasion: "gift-guide" },
];

export function resolveBlogOccasion(slug: string): BlogOccasion {
  const normalized = slug.trim().toLowerCase();
  for (const rule of SLUG_OCCASION_RULES) {
    if (rule.test.test(normalized)) return rule.occasion;
  }
  return "general";
}

export function getOrderedBlogConversionLinks(slug: string): BlogMoneyPageLink[] {
  const occasion = resolveBlogOccasion(slug);
  const priority = OCCASION_LINK_ORDER[occasion];
  const byHref = new Map(BLOG_MONEY_PAGE_LINKS.map((link) => [link.href, link]));

  const ordered: BlogMoneyPageLink[] = [];
  for (const href of priority) {
    const link = byHref.get(href);
    if (link) ordered.push(link);
  }
  for (const link of BLOG_MONEY_PAGE_LINKS) {
    if (!ordered.some((item) => item.href === link.href)) {
      ordered.push(link);
    }
  }
  return ordered;
}

export function getBlogConversionIntro(occasion: BlogOccasion): string {
  switch (occasion) {
    case "wedding":
      return "Preview free, then choose framed print, unframed poster, or instant HD for wedding and engagement gifts.";
    case "anniversary":
      return "Start with a free preview, then pick the anniversary format that fits your timeline and budget.";
    case "birthday":
      return "Build the birthday sky first — HD for same-day gifting, or a framed print when timing allows.";
    case "new-baby":
      return "Capture the night they arrived — nursery prints, HD for sharing with family, or both from one design.";
    case "memorial":
      return "Quiet, personal tribute options — instant HD for family near and far, or a physical print when ready.";
    case "seasonal":
      return "Need it soon? HD unlocks right after checkout. Physical prints follow standard production and shipping.";
    case "gift-guide":
      return "Compare formats on the money pages below, then preview free before checkout.";
    default:
      return "Free preview in the editor — HD download or printed delivery when you are happy with the sky.";
  }
}
