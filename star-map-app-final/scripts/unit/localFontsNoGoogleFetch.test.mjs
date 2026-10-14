/**
 * Builds must not call next/font/google (network fetch at compile time).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("EditorFontShell and layout use next/font/local with committed OFL files", () => {
  const shell = fs.readFileSync(path.join(ROOT, "src/components/EditorFontShell.tsx"), "utf8");
  const layout = fs.readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
  assert.equal(/next\/font\/google/.test(shell), false);
  assert.equal(/next\/font\/google/.test(layout), false);
  assert.match(shell, /next\/font\/local/);
  assert.match(layout, /next\/font\/local/);
  assert.match(shell, /eb-garamond\/latin-400-normal\.woff2/);
  assert.match(shell, /--font-eb-garamond/);
  assert.match(layout, /playfair-display\/latin-400-normal\.woff2/);

  for (const rel of [
    "src/fonts/eb-garamond/latin-400-normal.woff2",
    "src/fonts/eb-garamond/latin-600-normal.woff2",
    "src/fonts/eb-garamond/latin-700-normal.woff2",
    "src/fonts/playfair-display/latin-400-normal.woff2",
    "src/fonts/OFL-README.md",
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
  }
});

test("no src file imports next/font/google", () => {
  const srcRoot = path.join(ROOT, "src");
  /** @param {string} dir */
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        assert.equal(
          /from\s+["']next\/font\/google["']/.test(text),
          false,
          `${path.relative(ROOT, full)} still imports next/font/google`
        );
      }
    }
  }
  walk(srcRoot);
});
