import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
test("server alone owns PostHog purchase; browser retains consented GA4", () => {
  const result = spawnSync(process.execPath, ["--experimental-vm-modules", fileURLToPath(new URL("./purchaseOwnership.harness.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
