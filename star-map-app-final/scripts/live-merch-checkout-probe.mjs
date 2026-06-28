#!/usr/bin/env node
/**
 * Live probe: map save, share page, merch + print checkout API (no payment).
 * Usage: node scripts/live-merch-checkout-probe.mjs [--site https://starmapco.com]
 */

const site = (process.argv.find((a, i) => process.argv[i - 1] === "--site") || "https://starmapco.com").replace(
  /\/+$/,
  "",
);

function ok(name, passed, detail = "") {
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  return passed;
}

async function main() {
  let failed = false;
  const run = (name, passed, detail) => {
    if (!ok(name, passed, detail)) failed = true;
  };

  console.log(`Live merch checkout probe: ${site}\n`);

  const shop = await fetch(`${site}/shop`, { cache: "no-store" }).then((r) => r.text());
  run("/shop 200", shop.length > 1000, `bytes=${shop.length}`);
  run("shop merch section", shop.includes('id="merch-addons"'), "merch-addons anchor");
  run("shop sticker CTA", shop.includes("merch_family=sticker_kisscut"), "deep link");

  const editorRes = await fetch(`${site}/editor?mode=quick&merch_family=sticker_kisscut`, { cache: "no-store" });
  run("/editor merch deep link", editorRes.status === 200, `status=${editorRes.status}`);

  const recipe = {
    version: 1,
    seed: "probe",
    datetimeISO: "2020-06-15T22:30:00.000Z",
    location: { name: "New York, NY", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York" },
    textBoxes: [{ id: "t1", text: "Probe night sky", fontFamily: "playfair", color: "#ffffff", size: 24, align: "center", position: { x: 0.5, y: 0.2 } }],
    selectedStyle: "navyGold",
    aspectRatio: "square",
    shape: "circle",
    renderOptions: { visualMode: "realistic" },
  };

  const mapRes = await fetch(`${site}/api/maps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recipe),
  });
  const mapJson = await mapRes.json().catch(() => ({}));
  run("POST /api/maps", mapRes.status === 200 && mapJson.id, `status=${mapRes.status} id=${mapJson.id || "none"}`);

  if (mapJson.id) {
    const getRes = await fetch(`${site}/api/maps?id=${encodeURIComponent(mapJson.id)}`, { cache: "no-store" });
    run("GET /api/maps?id=", getRes.status === 200, `status=${getRes.status}`);

    const shareRes = await fetch(`${site}/m/${mapJson.id}`, { cache: "no-store" });
    const shareHtml = await shareRes.text();
    run("GET /m/:id share page", shareRes.status === 200, `status=${shareRes.status}`);
    run("share page map hub section", shareHtml.includes('id="shop-this-map"'), "shop-this-map anchor");
    run("share page HD CTA", shareHtml.includes("checkout=hd"), "map hub HD link");
    run("share page edit CTA", shareHtml.includes("map_id=") && shareHtml.includes("source=map-hub"), "editor deep links");

    const noAsset = await fetch(`${site}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapId: mapJson.id,
        plan: "single",
        orderType: "print",
        printVariant: "poster_framed",
        merchFamily: "sticker_kisscut",
        merchOptions: { size: "3×3" },
        shippingCountry: "US",
      }),
    });
    const noAssetJson = await noAsset.json().catch(() => ({}));
    run(
      "merch checkout rejects missing print asset",
      noAsset.status === 400 && noAssetJson.code === "missing_print_asset",
      `status=${noAsset.status} code=${noAssetJson.code}`,
    );

    const fakeAsset = "00000000-0000-4000-8000-000000000001";
    const merchCheckout = await fetch(`${site}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapId: mapJson.id,
        plan: "single",
        orderType: "print",
        printVariant: "poster_framed",
        merchFamily: "sticker_kisscut",
        merchOptions: { size: "3×3" },
        shippingCountry: "US",
        printAssetId: fakeAsset,
      }),
    });
    const merchJson = await merchCheckout.json().catch(() => ({}));
    const merchUrlOk =
      merchCheckout.status === 200 &&
      typeof merchJson.url === "string" &&
      merchJson.url.includes("checkout.stripe.com");
    run(
      "merch checkout returns Stripe URL",
      merchUrlOk,
      `status=${merchCheckout.status} code=${merchJson.code || "ok"}`,
    );

    const cardCheckout = await fetch(`${site}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapId: mapJson.id,
        plan: "single",
        orderType: "print",
        printVariant: "poster_framed",
        includeCardAddOn: true,
        includeDigitalAddOn: false,
        shippingCountry: "US",
        printAssetId: fakeAsset,
      }),
    });
    const cardJson = await cardCheckout.json().catch(() => ({}));
    run(
      "card add-on checkout (fake asset)",
      cardCheckout.status === 200 || cardCheckout.status === 400,
      `status=${cardCheckout.status} code=${cardJson.code || (cardJson.url ? "stripe_url" : "none")}`,
    );
  }

  console.log(failed ? "\nProbe result: FAILED" : "\nProbe result: PASSED");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
