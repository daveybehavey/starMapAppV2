#!/usr/bin/env node

import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const apiBase = (process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com").trim().replace(/\/+$/, "");
const token = (process.env.PRINTFUL_API_TOKEN || "").trim();

if (!token) {
  console.error("Missing PRINTFUL_API_TOKEN (check .env.local).");
  process.exit(1);
}

async function fetchJson(pathname) {
  const res = await fetch(`${apiBase}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "starmapco-printful-v2-category-scan",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      json && typeof json === "object" && json.error && typeof json.error.message === "string"
        ? json.error.message
        : text.slice(0, 240);
    throw new Error(`${pathname} -> ${res.status} ${msg}`);
  }
  return json;
}

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

const KEYWORDS = [
  "t-shirt",
  "shirt",
  "hoodie",
  "sweatshirt",
  "keychain",
  "key chain",
  "sticker",
  "stickers",
  "tote",
  "bag",
  "hat",
  "cap",
  "mug",
  "poster",
  "canvas",
];

async function main() {
  const cats = await fetchJson("/v2/catalog-categories");
  const data = Array.isArray(cats?.data) ? cats.data : [];

  const hits = [];
  for (const c of data) {
    const id = c?.id;
    const title = norm(c?.title || c?.name);
    const parentTitle = norm(c?.parent_title || c?.parent_name);
    const combined = `${title} ${parentTitle}`.trim();
    if (!id || !combined) continue;
    if (KEYWORDS.some((k) => combined.includes(k))) {
      hits.push({
        id,
        title: c?.title ?? c?.name ?? null,
        parent_title: c?.parent_title ?? c?.parent_name ?? null,
      });
    }
  }

  hits.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  console.log(JSON.stringify({ apiBase, totalCategories: data.length, keywordCategoryHits: hits }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

