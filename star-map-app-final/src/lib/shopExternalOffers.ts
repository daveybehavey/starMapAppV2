export type ShopExternalOffer = {
  title: string;
  description: string;
  href: string;
  cta?: string;
};

/** Optional curated partner / storefront links (JSON array). Must use absolute https URLs. */
export function parseShopExternalOffers(raw: string | undefined): ShopExternalOffer[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const title = String((item as { title?: unknown }).title ?? "").trim();
      const description = String((item as { description?: unknown }).description ?? "").trim();
      const href = String((item as { href?: unknown }).href ?? "").trim();
      const ctaRaw = (item as { cta?: unknown }).cta;
      const cta = typeof ctaRaw === "string" && ctaRaw.trim() ? ctaRaw.trim() : undefined;
      if (!title || !href || !/^https:\/\//i.test(href)) return [];
      return [{ title, description: description || title, href, ...(cta ? { cta } : {}) }];
    });
  } catch {
    return [];
  }
}
