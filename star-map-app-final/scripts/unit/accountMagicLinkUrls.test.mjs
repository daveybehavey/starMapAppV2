/**
 * accountMagicLinkIssue.ts — URL builders for magic / claim links.
 *
 * Regression targets:
 * - trailing slashes on siteOrigin are stripped once
 * - tokens are URL-encoded into the query string
 * - my-downloads vs download claim paths stay distinct
 *
 * issueAccountMagicLinkToken needs KV + ConsistencyCoordinator — left as
 * untestable-in-this-phase (live/network inseparable without heavy stubs).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { buildMyDownloadsMagicUrl, buildDownloadClaimUrl } = await import(
  "../../src/lib/accountMagicLinkIssue.ts"
);

test("buildMyDownloadsMagicUrl strips trailing slashes and encodes token", () => {
  assert.equal(
    buildMyDownloadsMagicUrl("https://starmapco.com/", "abc+/=def"),
    "https://starmapco.com/my-downloads?token=abc%2B%2F%3Ddef",
  );
  assert.equal(
    buildMyDownloadsMagicUrl("https://starmapco.com///", "plain"),
    "https://starmapco.com/my-downloads?token=plain",
  );
});

test("buildDownloadClaimUrl targets /download with encoded claim token", () => {
  assert.equal(
    buildDownloadClaimUrl("https://starmapco.com", "tok&en"),
    "https://starmapco.com/download?token=tok%26en",
  );
  assert.notEqual(
    buildDownloadClaimUrl("https://starmapco.com", "x"),
    buildMyDownloadsMagicUrl("https://starmapco.com", "x"),
  );
});
