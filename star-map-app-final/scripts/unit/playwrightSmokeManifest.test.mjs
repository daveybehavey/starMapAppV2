import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(new URL("../validate-playwright-smoke-manifest.mjs", import.meta.url));
const FIXTURES_ROOT = fileURLToPath(new URL("fixtures/playwright-smoke-manifest", import.meta.url));

function runFixture(name) {
  return spawnSync(process.execPath, [SCRIPT_PATH, "--root", name], {
    cwd: FIXTURES_ROOT,
    encoding: "utf8",
  });
}

test("passes when every named critical smoke command discovers tests", () => {
  const result = runFixture("valid");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /qa:smoke:ui: 1 test in 1 file \(tests\/valid\.spec\.mjs\)/);
  assert.match(
    result.stdout,
    /Playwright smoke manifest validation PASSED: 4 selected tests across 4 commands\./
  );
});

test("fails with the exact command and spec when a selected smoke spec is empty", () => {
  const result = runFixture("empty-spec");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /qa:smoke:ui/);
  assert.match(result.stderr, /tests\/empty\.spec\.mjs/);
  assert.match(result.stderr, /empty/);
  assert.match(result.stderr, /npm run qa:smoke:ui -- --list/);
});

test("fails with the exact command and spec when Playwright discovers zero tests", () => {
  const result = runFixture("zero-discovery");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /qa:smoke:ui/);
  assert.match(result.stderr, /tests\/no-tests\.spec\.mjs/);
  assert.match(result.stderr, /discovered 0 tests/);
  assert.match(result.stderr, /npm run qa:smoke:ui -- --list/);
});
