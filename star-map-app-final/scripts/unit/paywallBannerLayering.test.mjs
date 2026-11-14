import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("../../src/app/globals.css");
const modal = read("../../src/components/PaywallModal.tsx");
const consent = read("../../src/components/AnalyticsConsentManager.tsx");
const hash = (source) => createHash("sha256").update(source).digest("hex");
const guard = /\/\* The mounted paywall owns this guard,[\s\S]*?\*\/\n@media \(width > 640px\) \{\n  html:has\(\[data-paywall-modal="open"\]\) \.cookie-banner \{\n    visibility: hidden;\n    pointer-events: none;\n  \}\n\}\n\n/;

test("IA-1b: mounted paywall exposes an unconditional lifetime marker", () => {
  assert.match(modal, /return \(\s*<div\s+data-paywall-modal="open"\s+className="fixed inset-0 z-50/);
});

test("IA-1b: desktop banner guard hides and blocks interaction only while paywall exists", () => {
  assert.match(css, guard);
});

test("IA-1b: normal banner styles including mobile in-flow rendering stay unchanged", () => {
  // Pin the complete existing banner rules at 33827fd7, excluding only our guard.
  // This also rejects unconditional hiding or changes to the mobile override.
  const normal = css.replace(guard, "");
  const start = normal.indexOf("html:has(.cookie-banner)");
  const end = normal.indexOf("@media (min-width: 1024px)", start);
  assert.equal(hash(normal.slice(start, end)), "41089b031de7107634bf6144100fe61641c8cf32fb40fe03db4b0667f6718783");
});

test("IA-1b: unset-consent rendering, choices and provider gate stay unchanged", () => {
  // Pin the existing JSX, including the unset-only condition, both choice handlers
  // and the null branch; presentation suppression must never dismiss consent.
  const start = consent.indexOf("  return (\n    <>");
  assert.notEqual(start, -1);
  assert.equal(hash(consent.slice(start)), "c3df50159a9da3624ac1b905c16368aa486ac095eefb6d322ece086d88a3104d");
});
