/**
 * Contract: Organization JSON-LD in root layout pins owner-confirmed org facts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Organization JSON-LD includes foundingDate 2025-12", () => {
  const layout = fs.readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
  assert.match(layout, /"@type":\s*"Organization"/);
  assert.match(layout, /foundingDate:\s*"2025-12"/);
  assert.match(layout, /sameAs:/);
});
