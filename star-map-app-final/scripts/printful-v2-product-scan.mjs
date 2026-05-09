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
      "User-Agent": "starmapco-printful-v2-product-scan",
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

const GROUPS = [
  { key: "tee", needles: ["t-shirt", "tee", "shirt"] },
  { key: "hoodie", needles: ["hoodie", "sweatshirt", "crewneck"] },
  { key: "keychain", needles: ["keychain", "key chain"] },
  { key: "sticker", needles: ["sticker"] },
  { key: "tote", needles: ["tote", "bag"] },
  { key: "hat", needles: ["hat", "cap", "beanie", "bucket"] },
  { key: "mug", needles: ["mug"] },
  { key: "poster", needles: ["poster"] },
  { key: "canvas", needles: ["canvas"] },
  { key: "phonecase", needles: ["iphone case", "phone case", "case"] },
];

function classify(product) {
  const combined = `${norm(product?.type)} ${norm(product?.name)} ${norm(product?.brand)} ${norm(product?.model)}`;
  for (const g of GROUPS) {
    if (g.needles.some((n) => combined.includes(n))) return g.key;
  }
  return null;
}

async function main() {
  const limit = 100;
  const results = [];
  let total = null;

  for (let offset = 0; offset < 4000; offset += limit) {
    const page = await fetchJson(`/v2/catalog-products?offset=${offset}&limit=${limit}&selling_region_name=worldwide`);
    const data = Array.isArray(page?.data) ? page.data : [];
    if (typeof page?.paging?.total === "number") total = page.paging.total;
    if (!data.length) break;

    for (const p of data) {
      const group = classify(p);
      if (!group) continue;
      results.push({
        group,
        id: p.id,
        main_category_id: p.main_category_id ?? null,
        type: p.type ?? null,
        name: p.name ?? null,
        brand: p.brand ?? null,
        model: p.model ?? null,
        variant_count: p.variant_count ?? null,
        placements: Array.isArray(p.placements) ? p.placements.map((pl) => `${pl.placement}:${pl.technique}`) : [],
        techniques: Array.isArray(p.techniques) ? p.techniques.map((t) => t.key) : [],
        colors: Array.isArray(p.colors) ? p.colors.slice(0, 6).map((c) => c.name) : [],
        sizes: Array.isArray(p.sizes) ? p.sizes : [],
      });
    }

    if (total !== null && offset + limit >= total) break;
  }

  results.sort((a, b) =>
    a.group === b.group ? String(a.name).localeCompare(String(b.name)) : a.group.localeCompare(b.group),
  );

  const byGroup = results.reduce((acc, row) => {
    acc[row.group] ||= [];
    acc[row.group].push(row);
    return acc;
  }, {});

  console.log(JSON.stringify({ apiBase, totalCatalogProducts: total, totalHits: results.length, byGroup }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

