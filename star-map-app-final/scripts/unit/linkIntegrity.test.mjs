import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(new URL("../link-integrity-check.mjs", import.meta.url));
const FIXTURES_ROOT = fileURLToPath(new URL("fixtures/link-integrity", import.meta.url));

function runFixture(name) {
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: path.join(FIXTURES_ROOT, name),
    encoding: "utf8",
  });
}

test("audits current Next.js route sources without obsolete static homepage files", () => {
  const result = runFixture("valid");

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Link integrity check passed\. Audited 2 source files against 2 Next\.js routes and 1 public file\./,
  );
});

test("reports a deliberately broken internal link from a fixture", () => {
  const result = runFixture("broken");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Found 1 potential broken internal links:/);
  assert.match(result.stderr, /- src\/app\/page\.tsx:2 -> \/missing-route/);
});

test("reports an actionable error when the Next.js routes source is missing", () => {
  const result = runFixture("missing-routes");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required link-audit directory is missing: src\/app \(Next\.js routes\)/);
});

test("does not treat an obsolete static homepage as Next.js route coverage", () => {
  const result = runFixture("obsolete-static-home");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No Next\.js page routes found under src\/app/);
});
