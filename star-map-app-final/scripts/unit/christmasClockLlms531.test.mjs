/**
 * Issue #531 / #532 regression pins.
 * #531: the production campaign clock must never be visitor-controllable —
 * the `christmas_now` query override let anyone render future campaign
 * phases (including Black Friday) early. Only the resolver's explicit
 * function arguments (unit-test idiom) may move the clock.
 * #532: public/llms.txt must carry only accurate public-facing facts —
 * no internal process wording, no stale prices.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

test("#531 ChristmasBanner never reads a christmas_now query override", () => {
  const banner = readSrc("src/components/ChristmasBanner.tsx");
  assert.doesNotMatch(banner, /useSearchParams/);
  assert.doesNotMatch(banner, /get\("christmas_now"\)/);
  assert.match(banner, /resolveChristmasCampaignNowMs\(\{ nowMs \}\)/);
});

test("#531 Christmas landing page never reads a christmas_now search param", () => {
  const page = readSrc("src/app/christmas-star-map-gift/page.tsx");
  assert.doesNotMatch(page, /searchParams/);
  assert.doesNotMatch(page, /christmas_now\?:/);
  assert.doesNotMatch(page, /params\.christmas_now/);
  assert.match(page, /resolveChristmasCampaignNowMs\(\)/);
});

test("#531 default campaign clock resolution is the real clock", async () => {
  const savedA = process.env.CHRISTMAS_CAMPAIGN_NOW;
  const savedB = process.env.NEXT_PUBLIC_CHRISTMAS_CAMPAIGN_NOW;
  delete process.env.CHRISTMAS_CAMPAIGN_NOW;
  delete process.env.NEXT_PUBLIC_CHRISTMAS_CAMPAIGN_NOW;
  try {
    const { resolveChristmasCampaignNowMs } = await loadTs("src/lib/christmasCampaign.ts");
    const before = Date.now();
    const resolved = resolveChristmasCampaignNowMs();
    const after = Date.now();
    assert.ok(resolved >= before - 1000 && resolved <= after + 1000);
    // The explicit-argument test idiom still works for unit tests.
    assert.equal(resolveChristmasCampaignNowMs({ nowMs: 1_700_000_000_000 }), 1_700_000_000_000);
  } finally {
    if (savedA !== undefined) process.env.CHRISTMAS_CAMPAIGN_NOW = savedA;
    if (savedB !== undefined) process.env.NEXT_PUBLIC_CHRISTMAS_CAMPAIGN_NOW = savedB;
  }
});

test("#532 llms.txt carries no internal wording or stale claims", () => {
  const llms = readSrc("public/llms.txt");
  assert.doesNotMatch(llms, /manual approval mode/i);
  assert.doesNotMatch(llms, /evidence register/i);
  assert.doesNotMatch(llms, /Q4 Block/i);
  assert.doesNotMatch(llms, /immediately after payment/i);
  // Lowest-cost print is the 16x16 poster at $39 (printCatalog.ts), not $49.
  assert.match(llms, /unframed poster \(16×16, \$39\) is the lowest-cost print/);
  assert.doesNotMatch(llms, /\(18×18, \$49\) is the lowest-cost/);
  assert.match(llms, /unframed poster \(16×16\) \$39 or \(18×18\) \$49/);
  // Conversion-copy contract sentence stays pinned (issue206ConversionCopy).
  assert.match(
    llms,
    /By default, production begins after payment once the order is submitted to our print partner/i
  );
});
