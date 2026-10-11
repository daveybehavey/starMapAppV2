import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("actual payment routes preserve delivery under consent denial and analytics failure", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-vm-modules", fileURLToPath(new URL("./consentDelivery.harness.mjs", import.meta.url))],
    { encoding: "utf8", timeout: 120_000 }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
