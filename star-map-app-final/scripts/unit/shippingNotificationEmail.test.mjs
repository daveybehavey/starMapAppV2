import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  renderShippingNotificationEmail,
  renderShippingReviewHtmlBlock,
  renderShippingReviewTextBlock,
  SHIPPING_REVIEW_INVITE,
  SHIPPING_REVIEW_LINKS,
} from "./shippingNotificationEmail.harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_PATH = path.join(ROOT, "src/lib/shippingNotificationEmail.ts");

test("shipping review links point at Google and Trustpilot", () => {
  assert.equal(SHIPPING_REVIEW_LINKS.google.href, "https://g.page/r/CVMm_3hOFgRTEAI/review");
  assert.equal(SHIPPING_REVIEW_LINKS.google.label, "Review us on Google");
  assert.equal(SHIPPING_REVIEW_LINKS.trustpilot.href, "https://www.trustpilot.com/review/starmapco.com");
  assert.equal(SHIPPING_REVIEW_LINKS.trustpilot.label, "Review us on Trustpilot");
});

test("shipping review text block is understated and includes both links", () => {
  const block = renderShippingReviewTextBlock();
  assert.match(block, new RegExp(SHIPPING_REVIEW_INVITE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(block, /Review us on Google:\s*https:\/\/g\.page\/r\/CVMm_3hOFgRTEAI\/review/);
  assert.match(block, /Review us on Trustpilot:\s*https:\/\/www\.trustpilot\.com\/review\/starmapco\.com/);
});

test("shipping review html block labels both destinations", () => {
  const block = renderShippingReviewHtmlBlock();
  assert.match(block, /href="https:\/\/g\.page\/r\/CVMm_3hOFgRTEAI\/review"/);
  assert.match(block, />Review us on Google</);
  assert.match(block, /href="https:\/\/www\.trustpilot\.com\/review\/starmapco\.com"/);
  assert.match(block, />Review us on Trustpilot</);
});

test("renderShippingNotificationEmail keeps subject and appends review CTA after shipping content", () => {
  const rendered = renderShippingNotificationEmail({
    trackingNumber: "9400111899223344556677",
  });
  assert.equal(rendered.subject, "Your StarMapCo order is on its way — tracking inside");
  assert.match(rendered.text, /Tracking number: 9400111899223344556677/);
  assert.match(rendered.text, /Review us on Google/);
  assert.match(rendered.text, /Review us on Trustpilot/);
  assert.match(rendered.html, /Review us on Google/);
  assert.match(rendered.html, /Review us on Trustpilot/);

  const trackingIdx = rendered.text.indexOf("Tracking number:");
  const googleIdx = rendered.text.indexOf("Review us on Google");
  const signOffIdx = rendered.text.indexOf("— The StarMapCo team");
  assert.ok(trackingIdx >= 0 && googleIdx > trackingIdx && signOffIdx > googleIdx);
});

test("shippingNotificationEmail.ts source includes review block helpers and both URLs", () => {
  const source = fs.readFileSync(SOURCE_PATH, "utf8");
  assert.match(source, /renderShippingReviewHtmlBlock/);
  assert.match(source, /renderShippingReviewTextBlock/);
  assert.match(source, /https:\/\/g\.page\/r\/CVMm_3hOFgRTEAI\/review/);
  assert.match(source, /https:\/\/www\.trustpilot\.com\/review\/starmapco\.com/);
  assert.match(source, /Review us on Google/);
  assert.match(source, /Review us on Trustpilot/);
  assert.doesNotMatch(source, /subject\s*=\s*`[^`]*review/i);
});
