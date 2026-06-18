import type { SeoOccasion } from "@/data/seoOccasions";

const DEFAULT_DESCRIPTION_SUFFIX =
  "Start with a free preview, then choose framed + HD digital (free shipping at $100+), unframed poster, or instant HD delivery.";

export function getOccasionSeoTitle(occasion: SeoOccasion): string {
  if (occasion.seoTitle?.trim()) return occasion.seoTitle.trim();
  return `Star Map for ${occasion.label} | StarMapCo`;
}

export function getOccasionSeoDescription(occasion: SeoOccasion): string {
  if (occasion.seoDescription?.trim()) return occasion.seoDescription.trim();
  return `Create a star map for ${occasion.label.toLowerCase()}. ${DEFAULT_DESCRIPTION_SUFFIX}`;
}

export function getOccasionPageH1(occasion: SeoOccasion): string {
  if (occasion.seoH1?.trim()) return occasion.seoH1.trim();
  return `Star Map for ${occasion.label}`;
}
