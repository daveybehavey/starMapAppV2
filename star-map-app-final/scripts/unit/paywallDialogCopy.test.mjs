/**
 * Paywall dialog title / footer gating (print vs digital copy).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

test("print paywall title is print-appropriate; digital keeps HD title", async () => {
  const { getPaywallDialogTitle } = await loadTs("src/lib/paywallDialogCopy.ts");
  assert.equal(
    getPaywallDialogTitle({
      activeIntent: "print",
      hasPrintOptions: true,
      digitalTitle: "Buy this map in HD",
    }),
    "Order your printed star map"
  );
  assert.equal(
    getPaywallDialogTitle({
      activeIntent: "digital",
      hasPrintOptions: true,
      digitalTitle: "Buy this map in HD",
    }),
    "Buy this map in HD"
  );
  assert.equal(
    getPaywallDialogTitle({
      activeIntent: "print",
      hasPrintOptions: true,
      appMode: true,
      digitalTitle: "Buy this map in HD",
    }),
    "Order this map as a print"
  );
  assert.equal(
    getPaywallDialogTitle({
      activeIntent: "print",
      hasPrintOptions: true,
      isWeddingGift: true,
      digitalTitle: "Buy this map in HD",
    }),
    "Complete your wedding gift"
  );
});

test("subscription cancel footer only when subscription is selected on digital", async () => {
  const { shouldShowPaywallSubscriptionCancelFooter } = await loadTs("src/lib/paywallDialogCopy.ts");
  assert.equal(
    shouldShowPaywallSubscriptionCancelFooter({
      activeIntent: "print",
      subscriptionSelected: true,
    }),
    false
  );
  assert.equal(
    shouldShowPaywallSubscriptionCancelFooter({
      activeIntent: "digital",
      subscriptionSelected: false,
    }),
    false
  );
  assert.equal(
    shouldShowPaywallSubscriptionCancelFooter({
      activeIntent: "digital",
      subscriptionSelected: true,
    }),
    true
  );
  assert.equal(
    shouldShowPaywallSubscriptionCancelFooter({
      activeIntent: "digital",
      appMode: true,
      subscriptionSelected: true,
    }),
    false
  );
});

test("PaywallModal keeps Love-It reprint under print options and digital support under HD options", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/PaywallModal.tsx"), "utf8");
  assert.match(src, /getPaywallDialogTitle/);
  assert.match(src, /DIGITAL_CHECKOUT_SUPPORT_LINE/);
  assert.match(src, /showSubscriptionCancelFooter/);
  assert.doesNotMatch(
    src,
    /appMode \? "" : " Subscription can be canceled anytime\."/
  );

  const digitalPanelStart = src.indexOf('id="paywall-tab-panel-digital"');
  const printLoveIt = src.indexOf("{LOVE_IT_GUARANTEE_LINE}");
  const digitalLoveIt = src.indexOf("{LOVE_IT_GUARANTEE_LINE}", digitalPanelStart);
  assert.ok(printLoveIt > 0 && printLoveIt < digitalPanelStart, "Love-It line should appear in print panel");
  assert.equal(digitalLoveIt, -1, "Love-It reprint line must not appear under digital options");
});

test("Christmas order-by banner never renders 'Order by for'", async () => {
  const { getChristmasBannerContent, resolveChristmasCampaignNowMs } = await loadTs(
    "src/lib/christmasCampaign.ts"
  );
  for (const day of ["2026-10-15", "2026-11-15", "2026-12-05"]) {
    const nowMs = resolveChristmasCampaignNowMs({ override: day });
    const content = getChristmasBannerContent(nowMs);
    if (!content?.message.includes("Order by")) continue;
    assert.match(content.message, /Order by these dates for Christmas delivery/i);
    assert.doesNotMatch(content.message, /Order by for Christmas/i);
  }
});
