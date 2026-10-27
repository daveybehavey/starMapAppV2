/**
 * Font-claims truthfulness pin (#411 follow-through, 2026-10-27).
 *
 * PR #434 removed the font payment locks: all 15 editor fonts are free to
 * everyone. Public copy must never again claim "premium" fonts/typefaces
 * or imply some fonts sit behind a paywall. The homepage FAQ (visible
 * "Quick answers" + the FAQPage JSON-LD, both built from
 * buildHomeFaqItems in src/app/HomeStaticSections.tsx) states the truth:
 * "15 fonts, all included with every design."
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function listSrcFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSrcFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("no public copy claims premium fonts or typefaces", () => {
  const patterns = [/premium typefaces/i, /premium fonts/i, /\d+\s+premium\s+(fonts|typefaces)/i];
  for (const full of listSrcFiles(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, full);
    const source = fs.readFileSync(full, "utf8");
    for (const pattern of patterns) {
      assert.doesNotMatch(source, pattern, `${rel} claims premium fonts (${pattern}) — all fonts are free since #434`);
    }
  }
});

test("homepage FAQ states all 15 fonts are included (visible + JSON-LD share this source)", () => {
  const sections = read("src/app/HomeStaticSections.tsx");
  assert.match(sections, /15 fonts, all included with every design/);
  assert.doesNotMatch(sections, /premium typefaces/i);
  // The FAQPage schema in page.tsx is built from buildHomeFaqItems — the
  // same item set — so the structured data cannot drift from the page.
  const page = read("src/app/page.tsx");
  assert.match(page, /buildHomeFaqItems/);
});
