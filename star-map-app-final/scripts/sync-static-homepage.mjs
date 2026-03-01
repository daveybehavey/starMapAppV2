#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "public", "index.html");
const landingPath = path.join(root, "public", "landing.html");
const checkOnly = process.argv.includes("--check");

async function main() {
  const indexHtml = await readFile(indexPath, "utf8");
  const landingHtml = await readFile(landingPath, "utf8");

  if (indexHtml === landingHtml) {
    console.log("Homepage static files are already in sync.");
    return;
  }

  if (checkOnly) {
    console.error("Homepage static files are out of sync: public/index.html != public/landing.html");
    process.exit(1);
  }

  await writeFile(landingPath, indexHtml, "utf8");
  console.log("Synced public/landing.html from public/index.html");
}

main().catch((error) => {
  console.error("Static homepage sync failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
