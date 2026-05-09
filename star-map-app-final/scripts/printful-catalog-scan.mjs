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
      "User-Agent": "starmapco-printful-catalog-scan",
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

function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

const INTEREST = [
  { key: "tee", matchAny: [" t-shirt", " tee", "unisex tee", " crew neck t-shirt", " cotton t-shirt"] },
  { key: "hoodie", matchAny: [" hoodie", " zip hoodie", " sweatshirt", " crewneck"] },
  { key: "keychain", matchAny: ["keychain", " key chain"] },
  { key: "sticker", matchAny: ["sticker", " stickers"] },
  { key: "tote", matchAny: [" tote", " tote bag", " drawstring bag", " duffle bag", " gym bag", " shopping bag"] },
  { key: "hat", matchAny: [" hat", " cap", " beanie", " bucket hat", " dad hat"] },
];

function classify(product) {
  const name = normalize(product?.name);
  const type = normalize(product?.type_name || product?.type);
  const combined = `${name} ${type}`;
  if (combined.includes("leggings")) return null;
  for (const entry of INTEREST) {
    if (entry.matchAny.some((needle) => combined.includes(needle))) return entry.key;
  }
  return null;
}

async function main() {
  // Printful legacy Catalog API (v1) endpoint used elsewhere in repo: /products
  // Keep pagination simple: fetch first ~1500 products and filter by interest keywords.
  const pageSize = 100;
  const hits = [];

  for (let offset = 0; offset < 1500; offset += pageSize) {
    const json = await fetchJson(`/products?offset=${offset}&limit=${pageSize}`);
    const list = Array.isArray(json?.result) ? json.result : [];
    if (!list.length) break;
    for (const product of list) {
      const group = classify(product);
      if (!group) continue;
      hits.push({
        group,
        id: product.id,
        name: product.name,
        type: product.type_name ?? product.type ?? null,
        brand: product.brand ?? null,
        model: product.model ?? null,
      });
    }
    if (list.length < pageSize) break;
  }

  // Stable output: group then sort by name.
  hits.sort((a, b) => (a.group === b.group ? String(a.name).localeCompare(String(b.name)) : a.group.localeCompare(b.group)));

  const byGroup = hits.reduce((acc, row) => {
    acc[row.group] ||= [];
    acc[row.group].push(row);
    return acc;
  }, {});

  console.log(JSON.stringify({ apiBase, totalHits: hits.length, byGroup }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

