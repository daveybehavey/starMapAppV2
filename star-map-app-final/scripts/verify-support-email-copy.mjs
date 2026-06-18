#!/usr/bin/env node
/** Tier 4.4 — ensure public copy uses support@starmapco.com, not personal Gmail. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");
const banned = ["davidiheslop@gmail.com", "david@starmapco.com"];
const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx?|mdx?)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const pattern of banned) {
      if (text.includes(pattern)) {
        hits.push(`${path.relative(root, full)} → ${pattern}`);
      }
    }
  }
}

walk(srcRoot);

if (hits.length) {
  console.error("Support email copy check failed — personal addresses in public src:");
  for (const hit of hits) console.error(`- ${hit}`);
  console.error("");
  console.error("Follow docs/support-email-send-as-setup.md for Gmail send-as + Stripe support email.");
  process.exit(1);
}

console.log("Support email copy OK — no banned personal addresses in src/");
