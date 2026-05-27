import assert from "node:assert/strict";
import test from "node:test";

function buildHdArchiveDownloadUrl(siteOrigin, claimToken) {
  const base = siteOrigin.replace(/\/+$/, "");
  return `${base}/api/download/archive?token=${encodeURIComponent(claimToken)}`;
}

test("buildHdArchiveDownloadUrl encodes claim token", () => {
  const url = buildHdArchiveDownloadUrl("https://starmapco.com", "token/with+chars");
  assert.equal(url, "https://starmapco.com/api/download/archive?token=token%2Fwith%2Bchars");
});
