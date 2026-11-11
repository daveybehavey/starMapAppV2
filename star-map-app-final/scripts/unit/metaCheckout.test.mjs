import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

register("./tsAliasLoader.mjs", import.meta.url);
register("./metaCheckout.hooks.mjs", import.meta.url);
process.env.REFERRAL_SIGNING_SECRET = "unit-test-meta-signing-secret";
process.env.NEXT_PUBLIC_MERCH_BETA_ENABLED = "true";
for (const name of ["STICKERS", "MAGNETS", "PINS", "TEE", "HOODIE"]) process.env[`NEXT_PUBLIC_MERCH_${name}_ENABLED`] = "true";

const { GET } = await import("../../src/app/api/meta/checkout/route.ts");
const { NextRequest } = await import("next/server.js");
const { resolveMetaCheckout, filterMetaCoupon, getMetaCheckoutTarget, META_CHECKOUT_COOKIE_NAME: COOKIE } = await import("../../src/lib/metaCheckout.ts");
const { readMetaCheckoutCarry, createMetaCheckoutCarry } = await import("../../src/lib/metaCheckoutCookie.ts");
const { resolveEditorCheckoutPromoCode } = await import("../../src/lib/checkoutPromotions.ts");
const { resolveEditorSubmitPromotion } = await import("../../src/lib/editorCheckoutPromotion.ts");
const { clearEditorMetaCheckoutCarry } = await import("../../src/app/editor/actions.ts");
const { parseReferralSourceCookieValue } = await import("../../src/lib/referralCookie.ts");
const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NOW = Date.parse("2026-11-28T20:00:00Z");

for (const [name, code, orderType, fieldEdited, expected, cleared] of [
  ["C1 XMAS15 carry to One HD", "XMAS15", "digital", false, null, true],
  ["C2 XMAS15 carry to framed print", "XMAS15", "print", false, "XMAS15", false],
  ["C3 BLACKFRIDAY25 carry to poster", "BLACKFRIDAY25", "print", false, "BLACKFRIDAY25", false],
  ["C3 BLACKFRIDAY25 carry to HD", "BLACKFRIDAY25", "digital", false, null, true],
  ["C4 typed XMAS15 to HD", "XMAS15", "digital", true, "XMAS15", false],
  ["C5 no code", null, "digital", false, null, false],
]) test(name, () => {
  const carry = readMetaCheckoutCarry(createMetaCheckoutCarry("poster_framed", code, NOW), NOW);
  const selected = resolveEditorCheckoutPromoCode({ fieldValue: fieldEdited ? code : "", fieldEdited, queryPromoCode: carry.promoCode ?? null, storedPromoCode: null });
  const result = resolveEditorSubmitPromotion({ promoCode: selected, fieldEdited, orderType, plan: "single" });
  const payload = { plan: "single", ...(result.promoCode ? { promoCode: result.promoCode } : {}) };
  assert.equal(payload.promoCode ?? null, expected);
  assert.equal(Object.hasOwn(payload, "promoCode"), Boolean(expected));
  assert.equal(result.clearCarry, cleared);
});

for (const [name, code, source, expected, cleared] of [
  ["C6 digital_comp from query", "digital_comp", "query", "digital_comp", false],
  ["C6 digital_comp from storage", "digital_comp", "storage", "digital_comp", false],
  ["C7 other code from query", "OTHER_CODE", "query", "OTHER_CODE", false],
  ["C7 other code from storage", "OTHER_CODE", "storage", "OTHER_CODE", false],
  ["C8 XMAS15 from storage without carry", "XMAS15", "storage", null, true],
]) test(name, () => {
  const promoCode = resolveEditorCheckoutPromoCode({
    fieldValue: "", fieldEdited: false,
    queryPromoCode: source === "query" ? code : null,
    storedPromoCode: source === "storage" ? code : null,
  });
  assert.deepEqual(resolveEditorSubmitPromotion({ promoCode, fieldEdited: false, orderType: "digital", plan: "single" }), { promoCode: expected, clearCarry: cleared });
});

test("seasonal membership is normalized without changing submitted codes", () => {
  for (const promoCode of [" xmas15 ", " blackfriday25 "]) {
    assert.deepEqual(resolveEditorSubmitPromotion({ promoCode, fieldEdited: false, orderType: "digital", plan: "single" }), { promoCode: null, clearCarry: true });
    assert.deepEqual(resolveEditorSubmitPromotion({ promoCode, fieldEdited: false, orderType: "print", plan: "single" }), { promoCode, clearCarry: false });
    assert.deepEqual(resolveEditorSubmitPromotion({ promoCode, fieldEdited: true, orderType: "digital", plan: "single" }), { promoCode, clearCarry: false });
  }
});

test("stored auto codes are checked for every digital plan; edited values remain authoritative", () => {
  for (const plan of ["single", "pack3", "subscription"]) {
    const promoCode = resolveEditorCheckoutPromoCode({ fieldValue: "", fieldEdited: false, queryPromoCode: null, storedPromoCode: "XMAS15" });
    assert.deepEqual(resolveEditorSubmitPromotion({ promoCode, fieldEdited: false, orderType: "digital", plan }), { promoCode: null, clearCarry: true });
    assert.deepEqual(resolveEditorSubmitPromotion({ promoCode, fieldEdited: true, orderType: "digital", plan }), { promoCode: "XMAS15", clearCarry: false });
  }
});

test("editor drops before checkout, clears stored/loaded carry, and server action deletes HttpOnly cookie", async () => {
  const deleted = [];
  globalThis.metaCheckoutTestCookies = { delete: (name) => deleted.push(name) };
  try {
    await clearEditorMetaCheckoutCarry();
    assert.deepEqual(deleted, [COOKIE]);
  } finally {
    delete globalThis.metaCheckoutTestCookies;
  }
  const editor = read("src/components/EditorExperience.tsx");
  assert.match(editor, /resolveEditorSubmitPromotion\(\{\s*promoCode: getCheckoutPromoCode\(\),\s*fieldEdited: promoCodeEdited,\s*orderType,\s*plan,/);
  assert.match(editor, /if \(clearCarry\) \{[\s\S]*?setPromoCodeEdited\(true\);[\s\S]*?setEditorPromoCode\(""\);[\s\S]*?localStorage.removeItem\(PROMO_CODE_KEY\);[\s\S]*?await clearEditorMetaCheckoutCarry\(\);/);
  assert.ok(editor.indexOf("await clearEditorMetaCheckoutCarry()") < editor.indexOf("if (promoCode) checkoutPayload.promoCode = promoCode"));
});
function request(id, extras = {}) {
  return new NextRequest(`https://starmapco.com/api/meta/checkout?${new URLSearchParams({ product_id: id, ...extras })}`);
}
function landing(response) { return new URL(response.headers.get("location")); }
const prints = ["poster_unframed", "poster_unframed_16x16", "poster_framed", "canvas_wrap", "mug_11oz", "card_4x6"];
const families = ["sticker_kisscut", "magnet_diecut", "pins_set", "tee_unisex_bc3001", "hoodie_unisex_g18500"];

for (const id of prints) test(`A1 print ${id} maps exactly`, () => {
  const response = GET(request(id));
  assert.equal(response.status, 302);
  assert.equal(landing(response).pathname, "/editor");
  assert.equal(landing(response).searchParams.get("print_variant"), id);
  assert.equal(landing(response).searchParams.get("source"), "meta_shop");
  assert.equal(parseReferralSourceCookieValue(response.cookies.get("starmap_ref_src").value).source, "meta_shop");
  assert.match(response.headers.get("cache-control"), /no-store/);
});
for (const family of families) test(`A1 enabled merch ${family}`, () => {
  const url = landing(GET(request(`merch:${family}`)));
  assert.equal(url.pathname, "/editor");
  assert.equal(url.searchParams.get("merch_family"), family);
  assert.equal(url.searchParams.get("mode"), "quick");
  assert.equal(url.searchParams.get("source"), "meta_shop");
});
for (const [id, plan] of [["hd_single", "single"], ["hd_pack3", "pack3"]]) test(`A1 digital ${id} carries plan without inventing a query param`, () => {
  const response = GET(request(id));
  assert.equal(landing(response).pathname, "/editor");
  assert.equal(landing(response).search, "?source=meta_shop");
  assert.deepEqual(readMetaCheckoutCarry(response.cookies.get(COOKIE).value), { plan });
});
for (const id of ["unknown", "", "subscription", "hd_unlimited", "gift", "second_copy", "__proto__", "constructor", " poster_framed", "poster_framed,canvas_wrap", "merch:unknown"]) test(`A2 reject ${JSON.stringify(id)}`, () => {
  const response = GET(request(id, { coupon_code: "XMAS15" }));
  assert.equal(response.status, 302);
  assert.equal(landing(response).pathname, "/shop");
  assert.equal(response.headers.get("set-cookie"), null);
});
test("A2 missing and duplicate product ids do not guess a product", () => {
  for (const query of ["", "product_id=poster_framed&product_id=canvas_wrap"]) {
    const response = GET(new NextRequest(`https://starmapco.com/api/meta/checkout?${query}`));
    assert.equal(landing(response).pathname, "/shop");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});
test("A3 signed httpOnly carry reaches the existing editor promoCode selection", (t) => {
  t.mock.method(Date, "now", () => NOW);
  const response = GET(request("poster_unframed", { coupon_code: "BLACKFRIDAY25" }));
  const cookie = response.cookies.get(COOKIE);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.maxAge, 86400);
  const carry = readMetaCheckoutCarry(cookie.value, NOW);
  assert.equal(carry.promoCode, "BLACKFRIDAY25");
  // UX/garbage filter only: never duplicate/import the PRIVATE Stripe resolver.
  // Checkout re-resolves existence/activity/currency/minimum at session creation.
  const promoCode = resolveEditorCheckoutPromoCode({ fieldValue: "", fieldEdited: false, queryPromoCode: carry.promoCode, storedPromoCode: null });
  assert.equal(promoCode, "BLACKFRIDAY25");
  assert.equal(resolveEditorCheckoutPromoCode({ fieldValue: "", fieldEdited: true, queryPromoCode: carry.promoCode, storedPromoCode: null }), null);
  assert.match(read("src/app/editor/page.tsx"), /readMetaCheckoutCarry\(\(await cookies\(\)\)\.get\(META_CHECKOUT_COOKIE_NAME\)/);
  assert.match(read("src/app/editor/EditorPageClient.tsx"), /metaCarry=\{metaCarry\}/);
  const editor = read("src/components/EditorExperience.tsx");
  assert.match(editor, /queryPromoCode: queryPromoCode \?\? metaCarry\?\.promoCode \?\? null/);
  assert.match(editor, /if \(promoCode\) checkoutPayload\.promoCode = promoCode/);
  assert.match(editor, /JSON\.stringify\(checkoutPayload\)/);
});
test("A4 invalid, expired, wrong-product coupons clear carry without changing landing", (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const coupon_code of ["UNKNOWN", "FRIEND-ABCD", "BLACKFRIDAY25<script>", ""]) {
    const response = GET(request("poster_framed", { coupon_code }));
    assert.equal(response.cookies.get(COOKIE).maxAge, 0);
    assert.equal(landing(response).searchParams.get("print_variant"), "poster_framed");
  }
  const target = getMetaCheckoutTarget("poster_framed");
  for (const [code, time, expected] of [
    ["BLACKFRIDAY25", "2026-11-27T07:59:59Z", null],
    ["BLACKFRIDAY25", "2026-11-27T08:00:00Z", "BLACKFRIDAY25"],
    ["BLACKFRIDAY25", "2026-12-02T07:59:59Z", "BLACKFRIDAY25"],
    ["BLACKFRIDAY25", "2026-12-02T08:00:00Z", null],
    ["XMAS15", "2026-11-01T06:59:59Z", null],
    ["XMAS15", "2026-11-01T07:00:00Z", "XMAS15"],
    ["XMAS15", "2026-12-27T07:59:59Z", "XMAS15"],
    ["XMAS15", "2026-12-27T08:00:00Z", null],
    ["XMAS15", "2027-11-28T20:00:00Z", null],
  ]) assert.equal(filterMetaCoupon(code, target, Date.parse(time)), expected);
  for (const id of ["hd_single", "hd_pack3"]) assert.equal(resolveMetaCheckout(new URLSearchParams({ product_id: id, coupon_code: "XMAS15" }), NOW).promoCode, null);
  t.mock.method(Date, "now", () => Date.parse("2026-12-27T08:00:00Z"));
  assert.equal(GET(request("poster_framed", { coupon_code: "XMAS15" })).cookies.get(COOKIE).maxAge, 0);
});
test("carry expires within 24h and fails closed on tampering, malformed input and missing signing key", () => {
  const value = createMetaCheckoutCarry("poster_framed", "XMAS15", NOW);
  assert.equal(readMetaCheckoutCarry(value, NOW + 86400000).promoCode, undefined);
  assert.deepEqual(readMetaCheckoutCarry(value, NOW - 1), {});
  const payload = JSON.parse(value);
  payload.promo += "tamper";
  assert.deepEqual(readMetaCheckoutCarry(JSON.stringify(payload), NOW), {});
  for (const raw of ["null", "{}", "garbage", "x".repeat(1025)]) assert.deepEqual(readMetaCheckoutCarry(raw, NOW), {});
  delete process.env.REFERRAL_SIGNING_SECRET;
  assert.equal(createMetaCheckoutCarry("poster_framed", "XMAS15", NOW), null);
  process.env.REFERRAL_SIGNING_SECRET = "unit-test-meta-signing-secret";
});
test("A5 eligible quantity two uses the second-copy selection, never a bulk price", () => {
  for (const id of prints) for (const quantity of ["1", "2", "3", "100", "0", "-1", "2.0", "nope"]) {
    const result = resolveMetaCheckout(new URLSearchParams({ product_id: id, quantity }), NOW);
    const eligible = prints.indexOf(id) < 4 && quantity === "2";
    assert.equal(new URL(result.href, "https://starmapco.com").searchParams.get("include_second_copy"), eligible ? "1" : null);
    assert.equal(result.quantityClamped, quantity !== "1" && !eligible);
  }
  for (const id of ["hd_single", "hd_pack3", "merch:pins_set"]) assert.equal(resolveMetaCheckout(new URLSearchParams({ product_id: id, quantity: "2" }), NOW).quantityClamped, true);
  assert.equal(resolveMetaCheckout(new URLSearchParams({ product_id: "poster_framed" }), NOW).quantityClamped, false);
  const editor = read("src/components/EditorExperience.tsx");
  assert.match(editor, /searchParams.get\("include_second_copy"\)/);
  assert.match(editor, /Add a second copy — 10% off/);
});
test("A6 every adapter path makes zero Stripe calls or network requests", (t) => {
  t.mock.method(console, "info", () => {});
  t.mock.method(Date, "now", () => NOW);
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", () => { networkCalls++; throw new Error("unexpected network"); });
  globalThis.metaCheckoutStripeCalls = 0;
  for (const id of [...prints, ...families.map((id) => `merch:${id}`), "hd_single", "hd_pack3", "bad"]) {
    for (const quantity of ["1", "2", "3"]) for (const coupon_code of ["", "XMAS15", "BLACKFRIDAY25", "bad"]) GET(request(id, { quantity, coupon_code }));
  }
  assert.equal(globalThis.metaCheckoutStripeCalls, 0);
  assert.equal(networkCalls, 0);
});
test("A7 actual env gates reject disabled merch families", async () => {
  // New child process gets a fresh literal-env catalog module, as a real build does.
  const { spawnSync } = await import("node:child_process");
  const runner = new URL("./metaCheckoutDisabledMerch.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(runner)], { encoding: "utf8", env: { ...process.env, NEXT_PUBLIC_MERCH_PINS_ENABLED: "false" } });
  assert.equal(result.status, 0, result.stderr);
});
test("Tier C fence: checkout route and promotion policy match base 905ac521 blobs", () => {
  for (const [file, expected] of [
    ["src/app/api/checkout/route.ts", "4f8b28bed8d8d58e214e9bda2d50a2d5b264ed00"],
    ["src/lib/checkoutPromotions.ts", "927699d1920cc4905f7bbe20c75daaf728a2e467"],
  ]) {
    const content = Buffer.from(read(file));
    const hash = createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
    assert.equal(hash, expected, `${file} must remain unchanged; stop and re-brief`);
  }
});
test("translation ignores aliases and never forwards untrusted editor/currency params", () => {
  const params = new URLSearchParams("product_id=poster_framed&quantity=2&quantity=2&plan=subscription&currency=cad&print_variant=canvas_wrap&source=evil&promo=XMAS15");
  const result = resolveMetaCheckout(params, NOW);
  assert.equal(result.href, "/editor?source=meta_shop&print_variant=poster_framed");
  assert.equal(result.promoCode, null);
  assert.equal(result.quantityClamped, true);
});
