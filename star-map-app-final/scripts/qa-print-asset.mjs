#!/usr/bin/env node
/**
 * Load and upload print assets for QA checkout scripts.
 * Default asset is square 800×800 proof PNG — adequate for Printful file validation
 * (unlike the 1×1 tiny JPEG placeholder, which always fails at Printful).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const TINY_JPEG_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEhIVFhUVFRUVFRUVFRUWFhUXFhUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lICUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAAAER/9oADAMBAAIQAxAAAAGqP//EABQQAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQEAAT8hf//Z";

const ASSET_FILES = {
  proof: "public/printproof/framed-latest.png",
  catalog: "public/printproof/framed-catalog.jpg",
};

function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * @param {"proof" | "catalog" | "tiny" | string} assetKind
 * @param {string | undefined} assetFile
 */
export function loadQaPrintAssetDataUrl(assetKind = "proof", assetFile) {
  if (assetKind === "tiny") {
    return TINY_JPEG_DATA_URL;
  }

  const relativePath = assetFile?.trim() || ASSET_FILES[assetKind] || assetKind;
  const absolutePath = resolve(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `QA print asset not found at ${relativePath}. Run assets:printproof download or pass --asset tiny for metadata-only tests.`,
    );
  }

  const buffer = readFileSync(absolutePath);
  const mimeType = absolutePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return bufferToDataUrl(buffer, mimeType);
}

export async function uploadQaPrintAsset({ site, mapId, dataUrl, source = "editor" }) {
  const res = await fetch(`${site.replace(/\/+$/, "")}/api/print/assets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mapId, dataUrl, source }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export function parseQaAssetArg(argv) {
  const assetFlag = argv.find((_, i) => argv[i - 1] === "--asset");
  if (assetFlag) return assetFlag.trim();
  const fileFlag = argv.find((_, i) => argv[i - 1] === "--asset-file");
  if (fileFlag) return fileFlag.trim();
  return "proof";
}
