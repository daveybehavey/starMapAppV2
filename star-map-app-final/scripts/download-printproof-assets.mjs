#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "public", "printproof", "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`Missing manifest.json at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const allowedContentTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function safePublicPath(pathValue) {
  return typeof pathValue === "string" ? /^\/[a-zA-Z0-9/_\-.]+$/.test(pathValue) : false;
}

function toLocalPath(publicPath) {
  const relative = publicPath.replace(/^\/+/, "");
  return resolve(process.cwd(), "public", relative);
}

async function download(url, outputPath) {
  const response = await fetch(url, { headers: { "User-Agent": "starmapco-printproof-downloader" } });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (![...allowedContentTypes].some((type) => contentType.startsWith(type))) {
    throw new Error(`Unexpected content type: ${contentType || "unknown"} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, buffer);
}

const entries = [
  ["mockups.framed", manifest?.mockups?.framed],
  ["mockups.unframed", manifest?.mockups?.unframed],
  ["framed", manifest?.framed],
  ["unframed", manifest?.unframed],
  ["catalog.framed", manifest?.catalog?.framed],
  ["catalog.unframed", manifest?.catalog?.unframed],
]
  .filter(([, entry]) => entry?.sourceUrl && entry?.localPath)
  .map(([key, entry]) => ({ key, entry }));

if (!entries.length) {
  console.log("No downloadable printproof entries found in manifest.");
  process.exit(0);
}

let downloadedCount = 0;
for (const { key, entry } of entries) {
  const { sourceUrl, localPath } = entry;
  if (!safePublicPath(localPath)) {
    console.warn(`[${key}] Skipping unsafe localPath: ${localPath}`);
    continue;
  }
  const outputPath = toLocalPath(localPath);

  try {
    await download(sourceUrl, outputPath);
    downloadedCount += 1;
    console.log(`[${key}] Downloaded ${localPath} (${sourceUrl})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${key}] Failed: ${message}`);
    process.exitCode = 1;
  }
}

console.log(`Printproof download complete. Downloaded ${downloadedCount}/${entries.length}.`);

