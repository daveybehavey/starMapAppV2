/** Keep in sync with src/lib/blogConversionLinks.ts */

export const BLOG_MONEY_PAGE_LINKS = [
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
];

const OCCASION_LINK_ORDER = {
  wedding: ["/wedding", "/star-map-generator", "/hd-star-map", "/shop", "/anniversary", "/personalized-star-map"],
  anniversary: ["/anniversary", "/star-map-generator", "/wedding", "/hd-star-map", "/shop", "/personalized-star-map"],
  birthday: ["/birthday", "/star-map-generator", "/hd-star-map", "/shop", "/personalized-star-map"],
  "new-baby": ["/star-map-for/new-baby", "/blog/birth-star-map", "/hd-star-map", "/star-map-generator", "/shop"],
  memorial: ["/star-map-for/memorial", "/blog/memorial-star-map", "/hd-star-map", "/star-map-generator", "/personalized-star-map"],
  seasonal: ["/star-map-generator", "/hd-star-map", "/star-map-gift", "/shop", "/personalized-star-map"],
  "gift-guide": ["/star-map-generator", "/personalized-star-map", "/star-map-gift", "/shop", "/hd-star-map"],
  general: ["/star-map-generator", "/personalized-star-map", "/wedding", "/anniversary", "/hd-star-map", "/shop"],
};

const SLUG_OCCASION_RULES = [
  { test: /wedding|proposal|engagement|valentine/i, occasion: "wedding" },
  { test: /anniversary|meaningful-dates|new-year/i, occasion: "anniversary" },
  { test: /birthday|birth-day/i, occasion: "birthday" },
  { test: /birth-star|new-baby|baby|nursery|shower/i, occasion: "new-baby" },
  { test: /memorial|remembrance|bereavement|loss/i, occasion: "memorial" },
  { test: /canada-day|july-4|fathers-day|mothers-day|graduation|seasonal/i, occasion: "seasonal" },
  { test: /good-gift|gift-for-couples|gift-ideas|milestones|format-choose/i, occasion: "gift-guide" },
];

export function resolveBlogOccasion(slug) {
  const normalized = slug.trim().toLowerCase();
  for (const rule of SLUG_OCCASION_RULES) {
    if (rule.test.test(normalized)) return rule.occasion;
  }
  return "general";
}

export function getOrderedBlogConversionLinks(slug) {
  const occasion = resolveBlogOccasion(slug);
  const priority = OCCASION_LINK_ORDER[occasion];
  const byHref = new Map(BLOG_MONEY_PAGE_LINKS.map((link) => [link.href, link]));
  const ordered = [];
  for (const href of priority) {
    const link = byHref.get(href);
    if (link) ordered.push(link);
  }
  for (const link of BLOG_MONEY_PAGE_LINKS) {
    if (!ordered.some((item) => item.href === link.href)) ordered.push(link);
  }
  return ordered;
}
