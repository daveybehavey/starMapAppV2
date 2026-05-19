/**
 * Generates Play Store listing assets + small favicons from a square source logo.
 *
 * Input:  assets/store-branding/source-icon.png  (replace with your master art)
 * Output: assets/store-branding/generated/
 *
 * Usage: node scripts/generate-brand-assets.mjs
 *        node scripts/generate-brand-assets.mjs --source=path/to.png
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const bg = { r: 6, g: 11, b: 20 }; // matches app.config splash #060b14

function argSource() {
  const hit = process.argv.find((a) => a.startsWith("--source="));
  return hit ? hit.slice("--source=".length) : path.join(root, "assets/store-branding/source-icon.png");
}

async function squareIcon(src, size, outPath) {
  await sharp(src)
    .resize(size, size, {
      fit: "contain",
      position: "centre",
      background: { ...bg, alpha: 1 },
    })
    .flatten({ background: bg })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/** Deterministic 0..1 */
function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Single cohesive Play Store feature graphic (1024×500).
 * Vector-only — reads as one designed piece, not a logo pasted on a slab.
 */
function buildStoreFeatureBannerSvg(w, h) {
  const rnd = mulberry32(0x51a7);
  const dust = [];
  for (let i = 0; i < 55; i++) {
    const x = (rnd() * w * 0.52).toFixed(1);
    const y = (rnd() * h * 0.85).toFixed(1);
    const r = (0.25 + rnd() * 1.1).toFixed(2);
    const o = (0.06 + rnd() * 0.22).toFixed(2);
    dust.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#f8f0dc" opacity="${o}"/>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#010308"/>
      <stop offset="40%" stop-color="#0a1628"/>
      <stop offset="100%" stop-color="#040a14"/>
    </linearGradient>
    <radialGradient id="moonGlow" cx="78%" cy="28%" r="42%">
      <stop offset="0%" stop-color="#3d4f78" stop-opacity="0.55"/>
      <stop offset="50%" stop-color="#1a2438" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#010308" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="floorGlow" cx="50%" cy="100%" r="65%">
      <stop offset="0%" stop-color="#1a2740" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#010308" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="goldWord" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f0e6b8"/>
      <stop offset="35%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#8a6d1f"/>
    </linearGradient>
    <linearGradient id="ruleGold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#5c4a12" stop-opacity="0"/>
      <stop offset="40%" stop-color="#c9a227" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#5c4a12" stop-opacity="0"/>
    </linearGradient>
    <filter id="titleShadow" x="-8%" y="-8%" width="116%" height="116%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.65"/>
    </filter>
    <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="orbitStroke" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#c9a227" stop-opacity="0"/>
      <stop offset="50%" stop-color="#e8d589" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#c9a227" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <rect width="${w}" height="${h}" fill="url(#moonGlow)"/>
  <rect width="${w}" height="${h}" fill="url(#floorGlow)"/>
  ${dust.join("\n  ")}

  <!-- Editorial frame (left column) -->
  <rect x="64" y="118" width="4" height="264" rx="2" fill="url(#ruleGold)" opacity="0.85"/>
  <rect x="64" y="118" width="420" height="2" fill="url(#ruleGold)" opacity="0.7"/>
  <rect x="64" y="380" width="420" height="2" fill="url(#ruleGold)" opacity="0.7"/>

  <text x="88" y="210" fill="url(#goldWord)" font-family="Georgia, Palatino Linotype, Times New Roman, serif" font-size="56" font-weight="700" letter-spacing="0.02em" filter="url(#titleShadow)">StarMapCo</text>
  <text x="88" y="258" fill="#b8c5da" font-family="Segoe UI, system-ui, Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="500">Night sky art for the moments that matter</text>
  <text x="88" y="298" fill="#7a8aa8" font-family="Segoe UI, system-ui, Roboto, Helvetica, Arial, sans-serif" font-size="15" letter-spacing="0.14em">WEDDINGS  ·  ANNIVERSARIES  ·  MEMORIALS  ·  GIFTS</text>
  <text x="88" y="338" fill="#5c6d8a" font-family="Segoe UI, system-ui, Roboto, Helvetica, Arial, sans-serif" font-size="14">Personal star maps from any date and place — ready to print or share.</text>

  <!-- Right: abstract celestial (not your raster logo) -->
  <g opacity="0.9">
    <circle cx="798" cy="228" r="118" fill="none" stroke="url(#orbitStroke)" stroke-width="1.25"/>
    <circle cx="798" cy="228" r="86" fill="none" stroke="#c9a227" stroke-opacity="0.12" stroke-width="1"/>
    <path d="M 688 168 L 742 142 L 812 156 L 868 118 L 928 148 L 892 208 L 818 232 L 748 218 L 688 168 Z" fill="none" stroke="#d4af37" stroke-opacity="0.28" stroke-width="1.15" stroke-linejoin="round"/>
    <path d="M 742 142 L 748 218 M 812 156 L 818 232 M 868 118 L 892 208 M 688 168 L 928 148" fill="none" stroke="#e8d589" stroke-opacity="0.22" stroke-width="0.9"/>
    <circle cx="688" cy="168" r="3.2" fill="#f0e6b8" opacity="0.85"/>
    <circle cx="742" cy="142" r="2.6" fill="#f0e6b8" opacity="0.75"/>
    <circle cx="812" cy="156" r="3" fill="#f0e6b8" opacity="0.8"/>
    <circle cx="868" cy="118" r="4" fill="#fff4cc" opacity="0.9"/>
    <circle cx="928" cy="148" r="2.5" fill="#e8d589" opacity="0.7"/>
    <circle cx="892" cy="208" r="2.4" fill="#d4af37" opacity="0.65"/>
    <circle cx="818" cy="232" r="2.7" fill="#c9a227" opacity="0.7"/>
    <circle cx="748" cy="218" r="2.3" fill="#b8942a" opacity="0.6"/>
    <!-- Crescent moon mark -->
    <path d="M 912 96 C 952 96 978 128 978 168 C 978 208 948 238 908 238 C 938 220 956 188 956 156 C 956 124 938 104 912 96 Z" fill="#d4c089" opacity="0.22" filter="url(#softBlur)"/>
    <path d="M 918 108 C 948 112 968 138 968 168 C 968 198 948 224 918 228 C 942 210 954 184 954 156 C 954 128 942 112 918 108 Z" fill="#f4ead8" opacity="0.18"/>
  </g>

  <text x="${w - 24}" y="${h - 20}" text-anchor="end" fill="#5c6d8a" font-family="Segoe UI, system-ui, sans-serif" font-size="11" letter-spacing="0.12em" opacity="0.55">starmapco.com</text>
</svg>`;
}

/**
 * Play feature graphic — vector store banner (no composited logo).
 */
async function featureGraphic(_src, outPath) {
  const w = 1024;
  const h = 500;
  const svg = buildStoreFeatureBannerSvg(w, h);
  await sharp(Buffer.from(svg, "utf8"))
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function favicon(src, size, outPath) {
  await sharp(src)
    .resize(size, size, {
      fit: "cover",
      position: "centre",
    })
    .png()
    .toFile(outPath);
}

async function main() {
  const src = argSource();
  await fs.access(src);
  const outDir = path.join(root, "assets/store-branding/generated");
  await fs.mkdir(outDir, { recursive: true });

  await squareIcon(src, 512, path.join(outDir, "play-store-icon-512.png"));
  await squareIcon(src, 1024, path.join(outDir, "play-store-icon-1024.png"));
  await featureGraphic(src, path.join(outDir, "play-feature-graphic-1024x500.png"));

  // Expo / Android: optional drop-in updates (review visually before shipping builds)
  await squareIcon(src, 1024, path.join(outDir, "expo-icon-1024.png"));
  await squareIcon(src, 1024, path.join(outDir, "expo-adaptive-foreground-1024.png"));

  await favicon(src, 48, path.join(outDir, "favicon-48.png"));
  await favicon(src, 32, path.join(outDir, "favicon-32.png"));
  await favicon(src, 16, path.join(outDir, "favicon-16.png"));

  // Single PNG many stacks accept as favicon
  await favicon(src, 32, path.join(outDir, "favicon.png"));

  console.log("Wrote assets to", outDir);
  console.log("  play-store-icon-512.png");
  console.log("  play-store-icon-1024.png");
  console.log("  play-feature-graphic-1024x500.png");
  console.log("  expo-icon-1024.png, expo-adaptive-foreground-1024.png");
  console.log("  favicon.png, favicon-16/32/48.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
