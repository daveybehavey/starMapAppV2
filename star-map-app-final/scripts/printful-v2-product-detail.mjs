#!/usr/bin/env node

import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const apiBase = (process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com").trim().replace(/\/+$/, "");
const token = (process.env.PRINTFUL_API_TOKEN || "").trim();

const idRaw = process.argv[2];
const id = Number.parseInt(String(idRaw || "").trim(), 10);

if (!token) {
  console.error("Missing PRINTFUL_API_TOKEN (check .env.local).");
  process.exit(1);
}
if (!Number.isFinite(id) || id <= 0) {
  console.error("Usage: node scripts/printful-v2-product-detail.mjs <catalog_product_id>");
  process.exit(1);
}

async function fetchJson(pathname) {
  const res = await fetch(`${apiBase}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "starmapco-printful-v2-product-detail",
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

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k] ?? null;
  return out;
}

async function main() {
  const product = await fetchJson(`/v2/catalog-products/${id}?selling_region_name=worldwide`);
  const variants = await fetchJson(`/v2/catalog-products/${id}/catalog-variants?offset=0&limit=100`);
  const data = Array.isArray(variants?.data) ? variants.data : [];

  const sample = data.slice(0, 12).map((v) => ({
    catalog_variant_id: v.id ?? null,
    color: v.color ?? null,
    size: v.size ?? null,
    in_stock: v.in_stock ?? null,
    image: v.image ?? null,
    availability: v.availability_status ?? null,
  }));

  console.log(
    JSON.stringify(
      {
        apiBase,
        product: pick(product?.data, [
          "id",
          "main_category_id",
          "type",
          "name",
          "brand",
          "model",
          "variant_count",
          "placements",
          "techniques",
          "product_options",
        ]),
        variants: {
          fetched: data.length,
          sample,
          paging: variants?.paging ?? null,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

