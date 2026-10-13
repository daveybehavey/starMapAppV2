import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("assetlinks.json delegates to the Play package with the upload key", () => {
  const links = JSON.parse(read("public/.well-known/assetlinks.json"));
  const target = links[0].target;
  assert.equal(target.namespace, "android_app");
  assert.equal(target.package_name, "app.starmapco.com");
  assert.ok(target.sha256_cert_fingerprints.every((fp) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fp)));
  assert.deepEqual(links[0].relation, ["delegate_permission/common.handle_all_urls"]);
});

test("web manifest is valid and has a maskable 512 icon", () => {
  const m = JSON.parse(read("public/site.webmanifest"));
  assert.equal(m.short_name, "StarMapCo");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, "public", i.src)));
});

test("checkout API enforces app mode on GET and POST", () => {
  const src = read("src/app/api/checkout/route.ts");
  assert.equal((src.match(/isAndroidAppModeRequest\(req\)/g) || []).length, 2);
  assert.match(src, /android_app_digital_unavailable/);
});

test("app-mode policy: only physical orders, never a digital add-on", () => {
  const src = read("src/lib/androidAppMode.ts");
  assert.match(src, /const physical = input\.orderType === "print";/);
  assert.doesNotMatch(src, /\|\| input\.hasMerch/);
  assert.match(src, /includeDigitalAddOn: false/);
  const cookieLine = src.match(/document\.cookie="[^"]*"/)[0];
  assert.doesNotMatch(cookieLine, /max-age|expires/i);
  // the shared cookie must never switch app mode on in a normal tab
  const boot = src.slice(src.indexOf("ANDROID_APP_MODE_BOOTSTRAP"));
  assert.doesNotMatch(boot.slice(0, boot.indexOf("if(on)")), /document\.cookie/);
  // non-app tabs clear a stale app-mode cookie (shared TWA/Chrome cookie jar)
  assert.match(src, /else\{var clr=function\(\)\{if\(document\.cookie\.indexOf\("\$\{ANDROID_APP_COOKIE\}="\)!==-1\)\{document\.cookie="\$\{ANDROID_APP_COOKIE\}=; Path=\/; Max-Age=0/);
  // ...and re-clears whenever the normal tab becomes active again or calls checkout
  for (const ev of ['addEventListener("pageshow",clr)', 'addEventListener("focus",clr)', 'addEventListener("visibilitychange",clr)', 'addEventListener("click",clr,true)']) assert.ok(src.includes(ev), ev);
  assert.match(src, /u\.indexOf\("\/api\/checkout"\)!==-1\)\{clr\(\);\}/);
});

test("layout boots the session flag and links the manifest", () => {
  const src = read("src/app/layout.tsx");
  assert.match(src, /ANDROID_APP_MODE_BOOTSTRAP/);
  assert.match(src, /manifest: "\/site\.webmanifest"/);
});

test("checkout POST enforces app mode before the idempotency cache lookup", () => {
  const src = read("src/app/api/checkout/route.ts");
  const post = src.slice(src.indexOf("export async function POST"));
  const check = post.indexOf("isAndroidAppModeRequest(req)");
  const keyBuild = post.indexOf("checkoutIdempotencyKey({");
  const cacheGet = post.indexOf("kv.get<string>(idempotencyKey)");
  assert.ok(check > 0 && keyBuild > 0 && cacheGet > 0);
  assert.ok(check < keyBuild && check < cacheGet, "app-mode refusal must precede cache key + lookup");
  assert.ok(post.indexOf("ANDROID_APP_DIGITAL_BLOCKED") < cacheGet);
});

test("app-mode checkouts use their own idempotency cache key", () => {
  const src = read("src/app/api/checkout/route.ts");
  assert.match(src, /androidAppMode\?: boolean;/);
  assert.match(src, /\$\{input\.androidAppMode \? ":app-android" : ""\}`/);
  const post = src.slice(src.indexOf("export async function POST"));
  const keyCall = post.slice(post.indexOf("checkoutIdempotencyKey({"), post.indexOf("kv.get<string>(idempotencyKey)"));
  assert.match(keyCall, /androidAppMode,/);
});

test("app mode hides every digital offer surface", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /html\[data-app-mode="android"\] \[data-digital-offer\]/);
  const mobile = read("src/app/MobileCreate.tsx");
  // paid users keep their HD download control: only the unpaid "Unlock HD" state is an offer
  assert.match(mobile, /data-testid="mobile-unlock-hd"\s+data-digital-offer=\{paid \? undefined : true\}/);
  assert.match(mobile, /data-testid="mobile-sticky-unlock-hd"\s+data-digital-offer=\{paid \? undefined : true\}/);
  // render-mode, intensity and font "Unlock HD" upsell chips
  assert.equal((mobile.match(/data-digital-offer\s+className="rounded-full border border-white\/25/g) || []).length, 3);
  assert.match(mobile, /appMode \? rows\.filter\(\(row\) => !row\.includeDigitalAddOn\) : rows/);
  assert.match(mobile, /appMode \? "Framed print recommended" : "Framed \+ HD recommended"/);
  const desktop = read("src/components/EditorExperience.tsx");
  assert.match(desktop, /data-testid="desktop-unlock-hd"\s+data-digital-offer=\{paid \? undefined : true\}/);
  assert.match(desktop, /data-testid="desktop-free-export-hd-upsell"\s+data-digital-offer/);
  assert.match(desktop, /androidAppMode \? rows\.filter\(\(row\) => !row\.includeDigitalAddOn\) : rows/);
  assert.match(read("src/components/SimplifiedEditor/SimplifiedEditor.tsx"), /onClick=\{handleHdDownload\}\s+data-digital-offer=\{paid \? undefined : true\}/);
  assert.match(read("src/components/PreviewStartForm.tsx"), /intent\.checkout === "digital" \|\| intent\.includeDigitalAddOn \? true : undefined/);
  assert.match(css, /\[formaction\*="checkout=digital"\]/);
  assert.match(css, /\[formaction\*="include_digital_addon=1"\]/);
  const home = read("src/components/HomeOfferStack.tsx");
  assert.match(home, /<div data-digital-offer className="brand-dark-card rounded-2xl p-4">\s*<div[^>]*>\s*<p[^>]*>\s*Digital HD options/);
  assert.match(read("src/components/PaywallModal.tsx"), /appMode \? rows\.filter\(\(row\) => !row\.includeDigitalAddOn\) : rows/);
});

test("support phone is never published", () => {
  const src = read("src/lib/businessProfile.ts");
  assert.match(src, /const supportPhone = "";/);
  assert.doesNotMatch(src, /NEXT_PUBLIC_SUPPORT_PHONE \|\|/);
});

test("app-mode tab signals checkout server-side even if another tab cleared the cookie", () => {
  const src = read("src/lib/androidAppMode.ts");
  assert.match(src, /export const ANDROID_APP_HEADER = "x-smc-app-mode";/);
  assert.match(src, /u\.indexOf\("\/api\/checkout"\)!==-1\)\{setC\(\);/);
  assert.match(src, /h\.set\("\$\{ANDROID_APP_HEADER\}"/);
  assert.match(src, /req\.headers\?\.get\(ANDROID_APP_HEADER\) === ANDROID_APP_COOKIE_VALUE/);
  assert.match(src, /addEventListener\("click",setC,true\)/);
});

test("success page HD upsell is hidden in app mode when there is no entitlement", () => {
  assert.match(read("src/app/success/SuccessClient.tsx"), /data-digital-offer=\{hasDigitalEntitlement \? undefined : true\}/);
});

test("priced HD add-on cards are marked as digital offers", () => {
  assert.match(read("src/components/WhatYouReceiveModule.tsx"), /<div data-digital-offer className="brand-light-card rounded-2xl px-4 py-3">\s*<p[^>]*>Optional backup/);
  assert.match(read("src/components/FramedProofSection.tsx"), /<div data-digital-offer className="brand-light-card rounded-2xl px-4 py-4">\s*<p[^>]*>\s*Instant backup/);
});

test("whole digital product cards (shop, delivery formats, gift formats) are marked", () => {
  assert.match(read("src/app/shop/page.tsx"), /data-digital-offer=\{card\.key === "digital" \? true : undefined\}/);
  const dfm = read("src/components/DeliveryFormatModule.tsx");
  assert.match(dfm, /<article data-digital-offer[^>]*>\s*<p[^>]*>HD digital delivery/);
  assert.match(dfm, /data-digital-offer\s+className="[^"]*"\s*>\s*<div[^>]*>\s*<p[^>]*>Framed print \+ HD digital/);
  assert.match(read("src/app/star-map-gift-formats/page.tsx"), /data-digital-offer=\{item\.orderType === "digital" \? true : undefined\}/);
  assert.match(read("src/components/GiftFormatRoadmapModule.tsx"), /<li data-digital-offer>HD digital/);
  assert.match(read("src/components/InstantHdHeroExtras.tsx"), /<p data-digital-offer[^>]*>\s*Last-minute/);
});

test("paywall does not record digital impressions in app mode", () => {
  const src = read("src/components/PaywallModal.tsx");
  assert.match(src, /const inAppMode = appMode \|\| isAndroidAppModeClient\(\);/);
  assert.match(src, /if \(!inAppMode && !viewedListsRef\.current\.has\("paywall_digital_options"\)\)/);
  assert.match(src, /PAYWALL_PRINT_CHECKOUT_ROWS\.filter\(\(row\) => !inAppMode \|\| !row\.includeDigitalAddOn\)/);
});

test("app-mode print paywall copy and ladders never advertise the digital add-on", () => {
  const facts = read("src/lib/commerceFacts.ts");
  assert.match(facts, /return options\?\.appMode \? bullets : \[\.\.\.bullets, "HD digital file available to add at checkout"\]/);
  const pw = read("src/components/PaywallModal.tsx");
  assert.match(pw, /getPaywallPrintBullets\(\{ appMode \}\)/);
  assert.match(pw, /isWeddingGift && activeIntent === "print" && hasPrintOptions && appMode\s*\?\s*`Recommended presentation: a framed, wall-ready print/);
  const tierRe = /data-digital-offer=\{(tier|step)\.id === "digital" \|\| \1\.id === "framed_hd" \? true : undefined\}/;
  assert.match(read("src/components/GiftFormatLadder.tsx"), tierRe);
  assert.match(read("src/components/PrintGiftDecisionPanel.tsx"), tierRe);
  assert.match(read("src/components/MapCommerceHubPanel.tsx"), /data-digital-offer=\{offer\.kind === "digital_hd" \? true : undefined\}/);
  assert.match(read("src/app/globals.css"), /article:has\(a\[href\*="include_digital_addon=1"\]\)/);
});
