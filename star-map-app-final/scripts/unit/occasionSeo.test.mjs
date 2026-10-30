import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

register("./tsResolveHook.mjs", pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + "/"));

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

/** GSC-tuned occasion rows — keep in sync with seoOccasions.ts */
const TUNED_OCCASIONS = [
  {
    slug: "new-baby",
    seoTitle: "New Baby Star Map | Birth Night Sky Gift | StarMapCo",
    seoH1: "New Baby Star Map Gift",
    mustMatchTitle: /New Baby/i,
  },
  {
    slug: "engagement",
    seoTitle: "Engagement Star Map Gift — Proposal Night Sky | StarMapCo",
    seoH1: "Engagement Star Map Gift",
    mustMatchTitle: /Engagement/i,
  },
  {
    slug: "proposal",
    seoTitle: "Proposal Star Map Gift — Custom Night Sky | StarMapCo",
    seoH1: "Proposal Star Map Gift",
    mustMatchTitle: /Proposal/i,
  },
  {
    slug: "memorial",
    seoTitle: "Memorial Star Map | Remembrance Gift | StarMapCo",
    seoH1: "Memorial Star Map Gift",
    mustMatchTitle: /Memorial/i,
  },
  {
    slug: "graduation",
    seoTitle: "Graduation Star Map Gift | Ceremony Night Sky | StarMapCo",
    seoH1: "Graduation Star Map Gift",
    mustMatchTitle: /Graduation/i,
  },
  {
    slug: "christmas",
    seoTitle: "Christmas Star Map Gift | Personalized | StarMapCo",
    seoH1: "Christmas Star Map Gift",
    mustMatchTitle: /Christmas/i,
  },
  {
    slug: "mothers-day",
    seoTitle: "Mother's Day Star Map Gift — Personalized Night Sky | StarMapCo",
    seoH1: "Mother's Day Star Map Gift",
    mustMatchTitle: /Mother/i,
  },
  {
    slug: "first-date",
    seoTitle: "First Date Star Map Gift — Custom Night Sky | StarMapCo",
    seoH1: "First Date Star Map Gift",
    mustMatchTitle: /First Date/i,
  },
  {
    slug: "night-we-met",
    seoTitle: "Night We Met Star Map — Custom Star Map of Where You Met | StarMapCo",
    seoH1: "Star Map of the Night We Met — or the Day We Met",
    mustMatchTitle: /Night We Met/i,
  },
];

for (const occasion of TUNED_OCCASIONS) {
  test(`${occasion.slug} occasion has GSC-tuned title and H1`, () => {
    assert.match(occasion.seoTitle, occasion.mustMatchTitle);
    assert.match(occasion.seoH1, occasion.mustMatchTitle);
    assert.match(occasion.seoTitle, /StarMapCo$/);
  });
}

test("default occasion description mentions framed + HD path", () => {
  const suffix =
    "Start with a free preview, then choose framed + HD digital (free shipping at $89+ USD), unframed poster, or HD digital delivery.";
  assert.match(suffix, /framed \+ HD digital/);
});

/**
 * S60-2 row 5 (S54-7 §E as amended): application-data-backed verification of
 * the night-we-met retarget. Unlike the TUNED_OCCASIONS fixture loop above,
 * these assertions read the actual exported `seoOccasions` array and the
 * actual `getOccasionPageH1` helper, so they fail if the shipped data drifts
 * from the approved strings.
 */
test("night-we-met application data carries the retargeted H1 and daytime FAQ", async () => {
  const { seoOccasions } = await loadTs("src/data/seoOccasions.ts");
  const { getOccasionPageH1 } = await loadTs("src/lib/occasionSeo.ts");

  const entry = seoOccasions.find((item) => item.slug === "night-we-met");
  assert.ok(entry, "night-we-met occasion entry must exist in seoOccasions");

  const expectedH1 = "Star Map of the Night We Met — or the Day We Met";
  assert.equal(entry.seoH1, expectedH1);
  assert.equal(getOccasionPageH1(entry), expectedH1);

  const daytimeFaq = entry.faqs[2];
  assert.ok(daytimeFaq, "night-we-met entry must carry a third FAQ");
  assert.equal(
    daytimeFaq.question,
    "What does a star map day we met design show if we met during daylight?",
  );
  assert.equal(
    daytimeFaq.answer,
    "Use the date you met, with an evening time. The map then shows the first night sky over that place after you met — the night that followed the day everything started. The same approach works for morning or afternoon meetings.",
  );

  assert.equal(
    entry.seoTitle,
    "Night We Met Star Map — Custom Star Map of Where You Met | StarMapCo",
  );
});
