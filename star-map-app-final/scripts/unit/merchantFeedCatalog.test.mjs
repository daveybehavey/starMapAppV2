import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
const { PRINT_CATALOG } = await import("../../src/lib/printCatalog.ts");
const pricing = await import("../../src/lib/pricing.ts");
const root = fileURLToPath(new URL("../../", import.meta.url));
const oldIds = ["print_poster_unframed", "print_poster_framed", "print_poster_framed_hd_bundle"];
const newIds = ["print_poster_unframed_16x16", "print_canvas_wrap", "print_mug_11oz", "print_card_4x6", "digital_single_hd"];

function generate(overrides = {}, withMap = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feed-catalog-"));
  try {
    fs.writeFileSync(path.join(dir, "wrangler.toml"), "");
    if (withMap) {
      fs.mkdirSync(path.join(dir, "data"));
      fs.copyFileSync(path.join(root, "data/printful-shipping.json"), path.join(dir, "data/printful-shipping.json"));
    }
    execFileSync(process.execPath, [path.join(root, "scripts/generate-merchant-feed.mjs")], {
      cwd: dir, env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, TZ: "UTC", ...overrides }, stdio: "pipe",
    });
    return [...fs.readFileSync(path.join(dir, "public/merchant-feed.xml"), "utf8").matchAll(/<item>(.*?)<\/item>/gs)].map(([, xml]) => ({
      xml,
      id: /<g:id>(.*?)<\/g:id>/.exec(xml)[1],
      price: /<g:price>(.*?)<\/g:price>/.exec(xml)[1],
    }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function assertParity(items, overrides = {}) {
  const saved = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) {
      if (/PRICE|CURRENCY/.test(key)) delete process.env[key];
    }
    Object.assign(process.env, overrides);
    const physical = pricing.getPrintPricingTiers();
    const digital = pricing.getPricingTiers();
    const amounts = new Map(PRINT_CATALOG.map(row => [`print_${row.id}`, physical[row.id].amountCents]));
    amounts.set("print_poster_framed_hd_bundle", physical.poster_framed.amountCents + pricing.getPrintDigitalAddOnPrice().amountCents);
    amounts.set("digital_single_hd", digital.single.amountCents);
    for (const item of items) {
      assert.ok(amounts.has(item.id), item.id);
      assert.equal(item.price, `${(amounts.get(item.id) / 100).toFixed(2)} ${(overrides.NEXT_PUBLIC_CURRENCY || "usd").toUpperCase()}`, item.id);
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

test("feed pins eight unique offers, preserves live IDs, and matches real catalogue pricing", () => {
  const items = generate();
  assert.equal(items.length, 8);
  assert.deepEqual(items.map(item => item.id).sort(), [...oldIds, ...newIds].sort());
  assert.ok(!items.some(item => item.id === "digital_pack3_hd"));
  assertParity(items);
  for (const item of items) {
    assert.match(item.xml, /<g:availability>in_stock<\/g:availability>/);
    assert.doesNotMatch(item.xml, /<g:link>[^<]*\/editor/);
  }
  assert.doesNotMatch(items.map(item => item.id).join(","), /unlimited|subscription/);
});

test("feed public price overrides retain catalogue parity for every offer", () => {
  const overrides = Object.fromEntries(PRINT_CATALOG.map((row, i) => [row.publicPriceEnv, String(row.priceFallbackCents + (i + 1) * 100)]));
  overrides.NEXT_PUBLIC_PRICE_SINGLE_CENTS = String(pricing.getPricingTiers().single.amountCents + 100);
  overrides.NEXT_PUBLIC_PACK3_PRICE_CENTS = String(pricing.getPricingTiers().pack3.amountCents + 100);
  overrides.NEXT_PUBLIC_PRINT_DIGITAL_ADDON_PRICE_CENTS = String(pricing.getPrintDigitalAddOnPrice().amountCents + 100);
  assertParity(generate(overrides), overrides);
});

test("feed server price overrides retain catalogue parity", () => {
  const overrides = Object.fromEntries(PRINT_CATALOG.map(row => [row.priceEnv, String(row.priceFallbackCents + 200)]));
  overrides.PACK3_PRICE_CENTS = "2300";
  overrides.PRICE_SINGLE_CENTS = "1100";
  overrides.PRINT_DIGITAL_ADDON_PRICE_CENTS = "800";
  assertParity(generate(overrides), overrides);
});

test("feed preserves public-first override precedence and single-currency emission", () => {
  const overrides = { NEXT_PUBLIC_CURRENCY: "eur", CURRENCY: "cad", NEXT_PUBLIC_PRICE_SINGLE_CENTS: "2500", PRICE_SINGLE_CENTS: "2600" };
  const items = generate(overrides);
  assertParity(items, { NEXT_PUBLIC_CURRENCY: "eur", NEXT_PUBLIC_PRICE_SINGLE_CENTS: "2500" });
  assert.equal(items.length, 8);
});

test("feed digital opt-out leaves seven physical offers", () => {
  const items = generate({ MERCHANT_FEED_INCLUDE_DIGITAL: "false" });
  assert.equal(items.length, 7);
  assert.ok(items.every(item => item.id.startsWith("print_")));
});

test("feed additional products use catalogue shipping profiles and digital delivery is free", () => {
  const map = JSON.parse(fs.readFileSync(path.join(root, "data/printful-shipping.json"), "utf8"));
  const items = generate({ MERCHANT_FEED_COUNTRIES: "US,CA,KR" });
  for (const row of PRINT_CATALOG.filter(row => !["poster_unframed", "poster_framed"].includes(row.id))) {
    const item = items.find(item => item.id === `print_${row.id}`);
    const expected = `${map[row.shippingProfile].US.rate.toFixed(2)} USD`;
    assert.ok(item.xml.includes(`<g:shipping><g:country>US</g:country><g:price>${expected}</g:price>`), row.id);
  }
  for (const item of items) {
    assert.doesNotMatch(item.xml, /<g:country>KR<\/g:country>/);
    if (item.id.startsWith("digital_")) {
      const shipping = [...item.xml.matchAll(/<g:shipping>(.*?)<\/g:shipping>/g)];
      assert.equal(shipping.length, 2);
      for (const [, entry] of shipping) assert.match(entry, /<g:price>0.00 USD<\/g:price>/);
    }
  }
});

test("feed keeps threshold gating and no-map shipping fallbacks", () => {
  const items = generate({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "99999", PRINT_STANDARD_SHIPPING_CENTS: "1234" }, false);
  assert.equal(items.length, 7);
  assert.ok(!items.some(item => item.id === "print_poster_framed_hd_bundle"));
  for (const item of items.filter(item => item.id.startsWith("print_"))) {
    assert.ok(item.xml.includes("<g:shipping><g:country>US</g:country><g:price>12.34 USD</g:price>"));
  }
  const free = generate({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "1" }, false);
  for (const item of free.filter(item => newIds.includes(item.id))) {
    assert.ok(item.xml.includes("<g:shipping><g:country>US</g:country><g:price>0.00 USD</g:price>"));
  }
});
