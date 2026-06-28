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
  const fallback = "/printproof/framed-catalog.jpg";
  const knownMockup = "/printproof/framed-mockup.jpg";
  const manifest = readManifest();

  // Prefer local mockup JPGs first (room photo). These are created by `assets:printproof:drafts`,
  // and may not be present in `manifest.json` after `assets:printproof` sync overwrites it.
  const candidateFromKnownMockup = existsSync(resolveLocalPublicPath(knownMockup)) ? knownMockup : null;

  // Next try manifest mockups (when present).
  const candidateFromManifestMockups = manifest?.mockups?.framed?.localPath ?? null;

  // Prefer non-transparent catalog images over preview PNGs (some previews can be transparent).
  const candidateFromCatalog = manifest?.catalog?.framed?.localPath ?? null;
  const candidateFromPreview = manifest?.framed?.localPath ?? null;

  const candidate = candidateFromKnownMockup || candidateFromManifestMockups || candidateFromCatalog || candidateFromPreview;
  if (!candidate || !isSafePublicPath(candidate)) return fallback;
  if (!existsSync(resolveLocalPublicPath(candidate))) return fallback;
  return candidate;
}

export function getUnframedProofImage() {
  const fallback = "/printproof/unframed-catalog.jpg";
  const knownMockup = "/printproof/unframed-mockup.jpg";
  const manifest = readManifest();

  const candidateFromKnownMockup = existsSync(resolveLocalPublicPath(knownMockup)) ? knownMockup : null;
  const candidateFromManifestMockups = manifest?.mockups?.unframed?.localPath ?? null;
  const candidateFromCatalog = manifest?.catalog?.unframed?.localPath ?? null;
  const candidateFromPreview = manifest?.unframed?.localPath ?? null;

  const candidate =
    candidateFromKnownMockup || candidateFromManifestMockups || candidateFromCatalog || candidateFromPreview;
  if (!candidate || !isSafePublicPath(candidate)) return fallback;
  if (!existsSync(resolveLocalPublicPath(candidate))) return fallback;
  return candidate;
}
