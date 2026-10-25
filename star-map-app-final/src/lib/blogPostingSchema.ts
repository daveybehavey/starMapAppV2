/**
 * BlogPosting JSON-LD for published blog articles (Q4 Block 2, issue #376).
 *
 * Field provenance rules — this builder never invents metadata:
 * - `datePublished` / `dateModified` are emitted only when the caller passes
 *   a date the article's own data records. Articles that record no date
 *   (e.g. valentines-day-star-map) omit both fields.
 * - `dateModified` must come from article data, never from build time.
 * - The `@id` is stable per article: `<canonical URL>#blogposting`.
 * - Author/publisher are the responsible organization, matching the
 *   metadata the article pages already publish.
 */

export type BlogPostingJsonLdInput = {
  /** Canonical article URL. */
  url: string;
  headline: string;
  description: string;
  datePublished?: string;
  dateModified?: string;
  /** Representative image URL, when the article has one. */
  image?: string;
};

export function buildBlogPostingJsonLd(input: BlogPostingJsonLdInput) {
  const entity: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${input.url}#blogposting`,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    headline: input.headline,
    description: input.description,
    author: { "@type": "Organization", name: "StarMapCo" },
    publisher: {
      "@type": "Organization",
      name: "StarMapCo",
      logo: { "@type": "ImageObject", url: "https://starmapco.com/favicon.ico" },
    },
  };
  if (input.datePublished) entity.datePublished = input.datePublished;
  if (input.dateModified) entity.dateModified = input.dateModified;
  if (input.image) entity.image = input.image;
  return entity;
}

/**
 * Serialize a JSON-LD entity for a `dangerouslySetInnerHTML` script element.
 * Escaping `<` as a JSON unicode escape keeps article text (e.g. a headline
 * containing a closing script tag) from closing the host script element;
 * the output still parses as the identical JSON value.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
