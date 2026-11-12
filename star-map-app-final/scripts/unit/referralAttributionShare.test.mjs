/**
 * referralAttribution.ts + referralShare.ts — normalize / share URL contracts.
 *
 * Regression targets:
 * - attribution values lowercased, collapsed, stripped of unsafe chars, length-capped
 * - empty attribution returns null; search-param aliases prefer ref_src over utm_source
 * - share URL stamps surface/platform UTMs; invalid base URL is returned unchanged
 * - friend-offer label falls back when env is empty
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  normalizeReferralAttribution,
  getReferralAttributionFromSearchParams,
} = await import("../../src/lib/referralAttribution.ts");
const {
  getReferralFriendOfferLabel,
  getReferralShareMessage,
  buildReferralShareUrl,
} = await import("../../src/lib/referralShare.ts");

test("normalizeReferralAttribution: cleans values and returns null when all empty", () => {
  assert.equal(normalizeReferralAttribution({}), null);
  assert.equal(normalizeReferralAttribution({ source: "   " }), null);

  const cleaned = normalizeReferralAttribution({
    source: "  Wedding Ads!!  ",
    medium: "Social Media",
    campaign: "Fall/2026",
    content: "x".repeat(80),
  });
  // `/` is stripped by the allowlist (`[^a-z0-9._-]`), spaces collapse to `-`.
  assert.deepEqual(cleaned, {
    source: "wedding-ads",
    medium: "social-media",
    campaign: "fall2026",
    content: "x".repeat(64),
  });
});

test("getReferralAttributionFromSearchParams: ref_src wins over utm_source", () => {
  const params = new URLSearchParams(
    "ref_src=download_x&utm_source=ignored&utm_medium=cpc&utm_campaign=fall&utm_content=card",
  );
  assert.deepEqual(getReferralAttributionFromSearchParams(params), {
    source: "download_x",
    medium: "cpc",
    campaign: "fall",
    content: "card",
  });

  const utmOnly = new URLSearchParams("utm_source=newsletter");
  assert.deepEqual(getReferralAttributionFromSearchParams(utmOnly), {
    source: "newsletter",
    medium: undefined,
    campaign: undefined,
    content: undefined,
  });
});

test("buildReferralShareUrl stamps platform/surface UTMs; invalid URL passthrough", () => {
  const url = buildReferralShareUrl({
    referralUrl: "https://starmapco.com/r/abc",
    platform: "x",
    surface: "download",
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("ref_src"), "download_x");
  assert.equal(parsed.searchParams.get("utm_source"), "x");
  assert.equal(parsed.searchParams.get("utm_medium"), "referral_social");
  assert.equal(parsed.searchParams.get("utm_campaign"), "free_hd_referral");
  assert.equal(parsed.searchParams.get("utm_content"), "download_x");

  const copy = buildReferralShareUrl({
    referralUrl: "https://starmapco.com/r/abc",
    platform: "copy",
    surface: "success",
  });
  assert.equal(new URL(copy).searchParams.get("utm_source"), "social");
  assert.equal(new URL(copy).searchParams.get("ref_src"), "success_copy");

  assert.equal(
    buildReferralShareUrl({
      referralUrl: "not a url",
      platform: "facebook",
      surface: "download",
    }),
    "not a url",
  );
});

test("referral friend offer label + share message use env override or default", () => {
  const saved = process.env.NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL;
  try {
    delete process.env.NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL;
    assert.match(getReferralFriendOfferLabel(), /discount/i);
    assert.match(getReferralShareMessage(), /StarMapCo/);
    assert.match(getReferralShareMessage(), /discount/i);

    process.env.NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL = "  20% off HD  ";
    assert.equal(getReferralFriendOfferLabel(), "20% off HD");
    assert.match(getReferralShareMessage(), /20% off HD/);
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL;
    else process.env.NEXT_PUBLIC_REFERRAL_FRIEND_OFFER_LABEL = saved;
  }
});
