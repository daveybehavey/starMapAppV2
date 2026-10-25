/**
 * Q4 Block 2 (#376): BlogPosting JSON-LD builder + serializer contract.
 *
 * - One coherent BlogPosting entity per article with a stable @id.
 * - Fields come only from real article data: dates and image are omitted
 *   when the article records none (never invented, never build time).
 * - Serialization is safe to inline in a <script> element: article text
 *   containing markup (e.g. a closing script tag in a headline) cannot
 *   break out, and the output parses back to the identical JSON value.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildBlogPostingJsonLd, serializeJsonLd } from "../../src/lib/blogPostingSchema.ts";

const URL = "https://starmapco.com/blog/example-post";

test("builds a BlogPosting entity with a stable @id and canonical mainEntityOfPage", () => {
  const entity = buildBlogPostingJsonLd({
    url: URL,
    headline: "Example Post",
    description: "An example description.",
    datePublished: "2026-01-15",
    dateModified: "2026-01-15",
    image: "https://starmapco.com/example.webp",
  });

  assert.equal(entity["@type"], "BlogPosting");
  assert.equal(entity["@id"], `${URL}#blogposting`);
  assert.deepEqual(entity.mainEntityOfPage, { "@type": "WebPage", "@id": URL });
  assert.equal(entity.headline, "Example Post");
  assert.equal(entity.description, "An example description.");
  assert.equal(entity.datePublished, "2026-01-15");
  assert.equal(entity.dateModified, "2026-01-15");
  assert.equal(entity.image, "https://starmapco.com/example.webp");
  assert.deepEqual(entity.author, { "@type": "Organization", name: "StarMapCo" });
  assert.equal(entity.publisher.name, "StarMapCo");
});

test("omits date and image fields the article does not record", () => {
  const entity = buildBlogPostingJsonLd({
    url: "https://starmapco.com/blog/valentines-day-star-map",
    headline: "Valentine's Day Star Map Gift Guide",
    description: "A gift guide.",
  });

  assert.equal("datePublished" in entity, false);
  assert.equal("dateModified" in entity, false);
  assert.equal("image" in entity, false);
  assert.equal(entity["@type"], "BlogPosting");
});

test("serialization cannot break out of the host script element and round-trips exactly", () => {
  const hostileHeadline = 'Quotes "and" </script><script>alert(1)</script> & <b>tags</b>';
  const entity = buildBlogPostingJsonLd({
    url: URL,
    headline: hostileHeadline,
    description: "D\u00e9j\u00e0 vu \u2014 a description with unicode.",
    datePublished: "2026-02-02",
  });

  const serialized = serializeJsonLd(entity);
  assert.equal(/<\/script/i.test(serialized), false);
  assert.equal(serialized.includes("</"), false);
  assert.deepEqual(JSON.parse(serialized), entity);
});

test("serialization preserves ordinary entities byte-for-byte semantically", () => {
  const entity = buildBlogPostingJsonLd({
    url: URL,
    headline: "Plain headline",
    description: "Plain description.",
  });
  assert.deepEqual(JSON.parse(serializeJsonLd(entity)), JSON.parse(JSON.stringify(entity)));
});
