import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type PrintProofManifestEntry = {
  orderId?: string;
  localPath?: string;
};

type PrintProofManifest = {
  mockups?: {
    framed?: PrintProofManifestEntry | null;
    unframed?: PrintProofManifestEntry | null;
  } | null;
  framed?: PrintProofManifestEntry | null;
  unframed?: PrintProofManifestEntry | null;
  catalog?: {
    framed?: PrintProofManifestEntry | null;
    unframed?: PrintProofManifestEntry | null;
  } | null;
};

function isSafePublicPath(pathValue: string) {
  return /^\/[a-zA-Z0-9/_\-.]+$/.test(pathValue);
}

function readManifest(): PrintProofManifest | null {
  try {
    const manifestPath = resolve(process.cwd(), "public", "printproof", "manifest.json");
    if (!existsSync(manifestPath)) return null;
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as PrintProofManifest;
    return parsed;
  } catch {
    return null;
  }
}

function resolveLocalPublicPath(pathValue: string) {
  const relative = pathValue.replace(/^\/+/, "");
  return resolve(process.cwd(), "public", relative);
}

export function getFramedProofImage() {
  const fallback = "/printproof/home/delivery-framed-heart.webp";
  const manifest = readManifest();
  const candidate =
    // Prefer the order preview image first (often transparent PNG), then fall back.
    manifest?.framed?.localPath || manifest?.mockups?.framed?.localPath || manifest?.catalog?.framed?.localPath;
  if (!candidate || !isSafePublicPath(candidate)) return fallback;
  if (!existsSync(resolveLocalPublicPath(candidate))) return fallback;
  return candidate;
}

export function getUnframedProofImage() {
  const fallback = "/printproof/home/delivery-unframed-classic.webp";
  const manifest = readManifest();
  const candidate =
    // Prefer the order preview image first (often transparent PNG), then fall back.
    manifest?.unframed?.localPath || manifest?.mockups?.unframed?.localPath || manifest?.catalog?.unframed?.localPath;
  if (!candidate || !isSafePublicPath(candidate)) return fallback;
  if (!existsSync(resolveLocalPublicPath(candidate))) return fallback;
  return candidate;
}
