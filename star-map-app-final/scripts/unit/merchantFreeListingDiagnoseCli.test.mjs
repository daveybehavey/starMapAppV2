import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("../merchant-free-listing-diagnose.mjs", import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function runCli(feedFile) {
  return spawnSync(process.execPath, [CLI_PATH, "--feed-file", feedFile, "--no-report"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
}

test("Merchant diagnostic fails closed when the local feed file is missing", () => {
  const missingFeed = join(tmpdir(), `starmapco-missing-merchant-feed-${process.pid}.xml`);
  const result = runCli(missingFeed);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL: Feed file not found/);
  assert.doesNotMatch(result.stdout, /PASS/);
});

test("Merchant diagnostic fails closed when the local feed has no offer IDs", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "starmapco-merchant-feed-"));
  const feedFile = join(tempDir, "merchant-feed.xml");
  writeFileSync(feedFile, "<?xml version=\"1.0\"?><rss><channel></channel></rss>", "utf8");

  try {
    const result = runCli(feedFile);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAIL: Feed file has no product offer IDs/);
    assert.doesNotMatch(result.stdout, /PASS/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
