/**
 * Sweep U03 (persona sweep 2026-10-19): no customer-facing price may
 * leave its currency ambiguous. formatPrice in src/lib/pricing.ts is the
 * single chokepoint every price path routes through; it now appends the
 * uppercased currency code as a suffix ("$49.00 USD"), exactly once.
 *
 * pricing.ts cannot be imported by the plain-Node unit runner (it pulls
 * "@/lib/printCatalog" through the alias), so behaviour is pinned against
 * the faithful mirror in printPriceLines.harness.mjs, and the mirror is
 * locked to the source construction by the source pins below.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatPrice } from "./printPriceLines.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(APP_ROOT, "src", relativePath), "utf8");
}

test("formatPrice appends the currency code exactly once", () => {
  assert.equal(formatPrice(4900), "$49.00 USD");
  assert.equal(formatPrice(10600), "$106.00 USD");
  assert.equal(formatPrice(0), "$0.00 USD");
  assert.equal(formatPrice(4900).split("USD").length - 1, 1);
});

test("formatPrice uppercases the currency argument and renders its own code", () => {
  assert.equal(formatPrice(4900, "usd"), "$49.00 USD");
  assert.equal(formatPrice(4900, "eur"), "€49.00 EUR");
  assert.equal(formatPrice(4900, ""), "$49.00 USD");
});

test("src/lib/pricing.ts formatPrice carries the same suffix construction (mirror lock)", () => {
  const src = readSrc("lib/pricing.ts");
  assert.match(src, /const code = \(currency \|\| "USD"\)\.toUpperCase\(\);/);
  assert.match(src, /return `\$\{formatted\} \$\{code\}`;/);
});
