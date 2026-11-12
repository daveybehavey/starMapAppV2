import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";

register("./tsAliasLoader.mjs", import.meta.url);
register("./metaCheckout.hooks.mjs", import.meta.url);
register("./metaPromoDisclosure.loader.mjs", import.meta.url);
process.env.REFERRAL_SIGNING_SECRET = "unit-test-meta-signing-secret";

const { GET } = await import("../../src/app/api/meta/checkout/route.ts");
const { NextRequest } = await import("next/server.js");
const { default: EditorPage } = await import("../../src/app/editor/page.tsx");
const { default: MetaPromoDisclosure } = await import("../../src/components/MetaPromoDisclosure.tsx");
const { resolveEditorCheckoutPromoCode } = await import("../../src/lib/checkoutPromotions.ts");
const { readMetaCheckoutCarry } = await import("../../src/lib/metaCheckoutCookie.ts");
const { resolveMetaCheckout, META_CHECKOUT_COOKIE_NAME: COOKIE } = await import("../../src/lib/metaCheckout.ts");
const NOW = Date.parse("2026-11-28T20:00:00Z");
const NOTICE = "That discount code could not be applied to this item, so the price shown is the full price.";

function arrive(productId, coupon) {
  const params = new URLSearchParams({ product_id: productId });
  if (coupon !== undefined) params.set("coupon_code", coupon);
  const result = resolveMetaCheckout(params, Date.now());
  const response = GET(new NextRequest(`https://starmapco.com/api/meta/checkout?${params}`));
  assert.equal(new URL(response.headers.get("location")).pathname, "/editor");
  return { raw: response.cookies.get(COOKIE).value, result };
}

async function render(raw, source = "meta_shop", storedPromoCode = null) {
  globalThis.metaCheckoutTestCookies = { get: () => ({ value: raw }) };
  globalThis.metaPromoTestState = { source, storedPromoCode };
  try {
    return renderToStaticMarkup(await EditorPage({ searchParams: Promise.resolve({ source }) }));
  } finally {
    delete globalThis.metaCheckoutTestCookies;
    delete globalThis.metaPromoTestState;
  }
}

for (const [name, product, coupon, dropped] of [
  ["unknown", "poster_framed", "UNKNOWN", true],
  ["invalid", "poster_framed", "XMAS15<script>", true],
  ["incompatible", "hd_single", "XMAS15", true],
  ["pack incompatible", "hd_pack3", "XMAS15", true],
  ["applied", "poster_framed", "XMAS15", false],
  ["absent", "poster_framed", undefined, false],
  ["absent digital", "hd_single", undefined, false],
  ["empty", "poster_framed", "", false],
]) test(`Meta disclosure: ${name}`, async (t) => {
  t.mock.method(Date, "now", () => NOW);
  const { raw, result } = arrive(product, coupon);
  assert.equal(result.couponDropped, dropped);
  assert.equal(readMetaCheckoutCarry(raw).couponDropped, dropped ? true : undefined);
  const html = await render(raw);
  assert.equal(html.includes(NOTICE), dropped);
  assert.ok(html.includes("Editor purchase controls"));
  const withStoredPromo = await render(raw, "meta_shop", "RETURNING15");
  assert.equal(withStoredPromo.includes(NOTICE), false);
  assert.equal(withStoredPromo.includes("full price"), false);
  assert.equal(withStoredPromo.includes("RETURNING15"), false);
  if (dropped) {
    assert.ok(html.indexOf(NOTICE) < html.indexOf("Editor purchase controls"));
    assert.equal(raw.includes(coupon), false);
    assert.equal((await render(raw, null)).includes(NOTICE), false);
    assert.equal((await render(raw, "ordinary")).includes(NOTICE), false);
    assert.equal((await render(raw, "")).includes(NOTICE), false);
  }
});

test("Meta disclosure: unresolved storage, query promos and edited fields use effective checkout state", () => {
  const renderNotice = (effectivePromoCode) => renderToStaticMarkup(createElement(MetaPromoDisclosure, {
    source: "meta_shop", couponDropped: true, effectivePromoCode,
  }));
  assert.equal(renderNotice(undefined), "", "no claim before client storage is available");
  for (const [fieldValue, fieldEdited, queryPromoCode, storedPromoCode, show] of [
    ["", false, null, null, true],
    ["", false, null, "RETURNING15", false],
    ["", false, "URL15", null, false],
    ["EDITED15", true, null, null, false],
    ["", true, null, "RETURNING15", true],
  ]) {
    const effective = resolveEditorCheckoutPromoCode({ fieldValue, fieldEdited, queryPromoCode, storedPromoCode });
    assert.equal(renderNotice(effective).includes(NOTICE), show);
  }
});

test("Meta disclosure: editor wires the notice to the same client resolver as checkout", () => {
  const editor = readFileSync(new URL("../../src/components/EditorExperience.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../src/app/editor/page.tsx", import.meta.url), "utf8");
  assert.match(editor, /<MetaPromoDisclosure\s+source=\{searchParams\.get\("source"\)\}\s+couponDropped=\{metaCarry\?\.couponDropped\}\s+effectivePromoCode=\{typeof window === "undefined" \? undefined : getCheckoutPromoCode\(\)\}/);
  assert.match(editor, /storedPromoCode: readStoredPromoCode\(\)/);
  assert.equal(page.includes(NOTICE), false, "the server cannot decide the effective promo");
});

test("Meta disclosure: expired campaign is disclosed on arrival", async (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-12-27T08:00:00Z"));
  const { raw, result } = arrive("poster_framed", "XMAS15");
  assert.equal(result.couponDropped, true);
  assert.ok((await render(raw)).includes(NOTICE));
});

test("Meta disclosure: tampered, expired, future, unsigned and malformed carries never render", async (t) => {
  t.mock.method(Date, "now", () => NOW);
  const { raw } = arrive("poster_framed", "UNKNOWN");
  const payload = JSON.parse(raw);
  for (const value of [
    JSON.stringify({ ...payload, droppedPromo: payload.droppedPromo + "tamper" }),
    JSON.stringify({ ...payload, productId: "canvas_wrap" }),
    JSON.stringify({ ...payload, issuedAt: NOW + 1 }),
    JSON.stringify({ ...payload, issuedAt: NOW - 1 }),
    JSON.stringify({ ...payload, droppedPromo: true }),
    JSON.stringify({ ...payload, droppedPromo: undefined, couponDropped: true }),
    "null", "{}", "garbage", "x".repeat(1025), undefined,
  ]) assert.equal((await render(value)).includes(NOTICE), false);
  t.mock.method(Date, "now", () => NOW + 86400000);
  assert.equal((await render(raw)).includes(NOTICE), false);
  t.mock.method(Date, "now", () => NOW - 1);
  assert.equal((await render(raw)).includes(NOTICE), false);
  t.mock.method(Date, "now", () => NOW);
  delete process.env.REFERRAL_SIGNING_SECRET;
  try {
    assert.equal((await render(raw)).includes(NOTICE), false);
    assert.equal((await render(arrive("poster_framed", "UNKNOWN").raw)).includes(NOTICE), false);
  } finally {
    process.env.REFERRAL_SIGNING_SECRET = "unit-test-meta-signing-secret";
  }
});
