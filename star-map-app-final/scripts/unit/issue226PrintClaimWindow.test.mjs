/**
 * Issue #226 — damaged/defective/materially-wrong print claim window must stay
 * aligned at 30 days across customer-facing policy/support copy and the
 * derived store-quality / policy-smoke checks. Does not expand change-of-mind
 * returns or promise automatic refunds.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CLAIM_WINDOW_DAYS = 30;
const WITHIN_30_DAYS = /within\s+30\s+days/i;
const STALE_WITHIN_7_DAYS = /within\s+7\s+days/i;

function readSrc(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("returns policy states 30-day damage/defect claim window with evidence + case review", () => {
  const src = readSrc("src/app/returns/ReturnsContent.tsx");
  assert.match(src, /damaged,\s*defective,\s*or\s*materially\s*different/i);
  assert.match(src, WITHIN_30_DAYS);
  assert.match(src, /photos and order details/i);
  assert.match(src, /Approved cases may be resolved with a replacement\s+or refund/i);
  assert.match(src, /change-of-mind returns are not accepted/i);
  assert.doesNotMatch(src, STALE_WITHIN_7_DAYS);
});

test("support FAQ damaged-print answer matches 30-day returns window", () => {
  const src = readSrc("src/lib/supportFaq.ts");
  const damagedBlock = src.match(/id:\s*"damaged-print"[\s\S]*?answer:\s*"([^"]+)"/);
  assert.ok(damagedBlock, "damaged-print FAQ answer missing");
  assert.match(damagedBlock[1], WITHIN_30_DAYS);
  assert.match(damagedBlock[1], /photos and your order details/i);
  assert.match(damagedBlock[1], /Returns & Refunds policy/i);
  assert.doesNotMatch(damagedBlock[1], STALE_WITHIN_7_DAYS);
});

test("shipping policy damage contact window matches returns (30 days)", () => {
  const src = readSrc("src/app/shipping/page.tsx");
  assert.match(src, /If a print arrives damaged or there is a shipping issue/i);
  assert.match(src, WITHIN_30_DAYS);
  assert.match(src, /order details and photos/i);
  assert.doesNotMatch(src, STALE_WITHIN_7_DAYS);
});

test("store-quality facts mirror the published 30-day damage/defect window", () => {
  const src = readSrc("scripts/store-quality-facts.mjs");
  assert.match(src, new RegExp(`damageDefectWindowDays:\\s*${CLAIM_WINDOW_DAYS}\\b`));
  assert.doesNotMatch(src, /damageDefectWindowDays:\s*7\b/);
});

test("policy-smoke asserts the 30-day returns claim window (not 7)", () => {
  const src = readSrc("scripts/policy-smoke.mjs");
  assert.match(src, /Returns 30-day window/);
  assert.match(src, /\/30\\s\*days\/i/);
  assert.doesNotMatch(src, /Returns 7-day window/);
});

test("policy last-updated dates moved for shipping and returns after claim-window change", () => {
  const src = readSrc("src/lib/policyMeta.ts");
  assert.match(src, /shipping:\s*"2026-08-07"/);
  assert.match(src, /returns:\s*"2026-08-07"/);
});
