#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const pages = ["public/index.html", "public/landing.html"];
const srcRegex = /<img[^>]*\ssrc="([^"]+)"/gi;

function extractImageSources(html) {
  const sources = [];
  let match = srcRegex.exec(html);
  while (match) {
    sources.push(match[1]);
    match = srcRegex.exec(html);
  }
  return [...new Set(sources)];
}

function isLocalAsset(src) {
  return src.startsWith("/") && !src.startsWith("//");
}

function main() {
  const root = process.cwd();
  const missing = [];

  for (const pagePath of pages) {
    const absolutePagePath = resolve(root, pagePath);
    if (!existsSync(absolutePagePath)) {
      continue;
    }
    const html = readFileSync(absolutePagePath, "utf8");
    const sources = extractImageSources(html);
    for (const src of sources) {
      if (!isLocalAsset(src)) continue;
      const assetPath = resolve(root, "public", src.replace(/^\/+/, ""));
      if (!existsSync(assetPath)) {
        missing.push(`${pagePath}: ${src}`);
      }
    }
  }

  if (missing.length) {
    console.error("Missing static assets referenced in homepage HTML:");
    for (const item of missing) {
      console.error(`- ${item}`);
    }
    process.exit(1);
  }

  console.log("Static asset check passed: all homepage <img> src assets exist.");
}

main();

