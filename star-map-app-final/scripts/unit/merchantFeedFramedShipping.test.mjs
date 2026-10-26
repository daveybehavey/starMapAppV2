/**
 * Lever B consistency (Codex P2 on PR #388): the standalone framed item in
 * the generated Merchant Center feed must advertise the same shipping total
 * checkout charges. A framed-only order is exactly the framed price, so at
 * the default $89 threshold the $99 framed item ships free in the feed too;
 * a threshold override above the framed price restores the paid rate.
 * Covers both the shipping-map path and the no-shipping-map fallback path.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const GENERATOR_PATH = path.join(APP_ROOT, "scripts", "generate-merchant-feed.mjs");
const SHIPPING_MAP_PATH = path.join(APP_ROOT, "data", "printful-shipping.json");

function runGenerator({ withShippingMap, extraEnv = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merchant-feed-framed-"));
  try {
    // seedEnv() reads wrangler.toml from the cwd; an empty file seeds no vars.
    fs.writeFileSync(path.join(dir, "wrangler.toml"), "");
    if (withShippingMap) {
      fs.mkdirSync(path.join(dir, "data"), { recursive: true });
      fs.copyFileSync(SHIPPING_MAP_PATH, path.join(dir, "data", "printful-shipping.json"));
    }
    // Deliberately minimal env: no PRINT_* / NEXT_PUBLIC_* leakage from the
    // test runner, so the generator's own defaults decide unless overridden.
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...extraEnv };
    execFileSync(process.execPath, [GENERATOR_PATH], { cwd: dir, env, stdio: "pipe" });
    return fs.readFileSync(path.join(dir, "public", "merchant-feed.xml"), "utf8");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function itemShipping(xml, id) {
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match = itemRegex.exec(xml);
  while (match) {
    if (match[1].includes(`<g:id>${id}</g:id>`)) {
      return [...match[1].matchAll(/<g:shipping><g:country>([A-Z]{2})<\/g:country><g:price>([^<]+)<\/g:price>/g)]
        .map((entry) => [entry[1], entry[2]]);
    }
    match = itemRegex.exec(xml);
  }
  return null;
}

function mapRate(country, profile) {
  const map = JSON.parse(fs.readFileSync(SHIPPING_MAP_PATH, "utf8"));
  return `${map[profile][country].rate.toFixed(2)} USD`;
}

test("feed framed item ships free at the default threshold (shipping-map path)", () => {
  const xml = runGenerator({ withShippingMap: true });
  const framed = itemShipping(xml, "print_poster_framed");
  assert.ok(framed && framed.length > 1, "expected per-country framed shipping entries");
  for (const [, price] of framed) {
    assert.equal(price, "0.00 USD");
  }
  // Unframed stays on the paid map rate; the bundle stays free.
  const unframed = itemShipping(xml, "print_poster_unframed");
  assert.equal(unframed.find(([country]) => country === "US")[1], mapRate("US", "poster_unframed"));
  const bundle = itemShipping(xml, "print_poster_framed_hd_bundle");
  for (const [, price] of bundle) {
    assert.equal(price, "0.00 USD");
  }
});

test("feed framed item is paid again when a threshold override exceeds the framed price", () => {
  const xml = runGenerator({
    withShippingMap: true,
    extraEnv: { PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "10000" },
  });
  const framed = itemShipping(xml, "print_poster_framed");
  assert.equal(framed.find(([country]) => country === "US")[1], mapRate("US", "poster_framed"));
  assert.equal(framed.find(([country]) => country === "CA")[1], mapRate("CA", "poster_framed"));
});

test("feed framed item ships free at the default threshold (no-map fallback path)", () => {
  const xml = runGenerator({ withShippingMap: false });
  assert.deepEqual(itemShipping(xml, "print_poster_framed"), [["US", "0.00 USD"]]);
});

test("feed framed item uses the paid fallback when a threshold override exceeds the framed price", () => {
  const xml = runGenerator({
    withShippingMap: false,
    extraEnv: { PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "10000" },
  });
  // PRINT_SHIPPING_CENTS default (1399) is the generator's paid fallback.
  assert.deepEqual(itemShipping(xml, "print_poster_framed"), [["US", "13.99 USD"]]);
});
