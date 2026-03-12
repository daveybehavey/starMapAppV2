#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const token = (process.env.PRINTFUL_API_TOKEN || "").trim();
const storeId = (process.env.PRINTFUL_STORE_ID || "").trim();
const framedVariant = Number.parseInt((process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED || "").trim(), 10);
const unframedVariant = Number.parseInt((process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED || "").trim(), 10);
const apiBase = (process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com").trim();

if (!token || !storeId) {
  console.error("Missing PRINTFUL_API_TOKEN or PRINTFUL_STORE_ID.");
  process.exit(1);
}

function validVariant(variant) {
  return Number.isFinite(variant) ? variant : null;
}

async function requestJson(pathname) {
  const response = await fetch(`${apiBase}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "starmapco-proof-sync",
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Printful request failed (${response.status}): ${body.slice(0, 220)}`);
  }
  return JSON.parse(body);
}

function pickPreviewFromItem(item) {
  const files = Array.isArray(item?.files) ? item.files : [];
  const preferred = files.find((file) => file?.type === "preview" && file?.preview_url);
  if (preferred?.preview_url) return preferred.preview_url;
  const fallback = files.find((file) => file?.preview_url);
  if (fallback?.preview_url) return fallback.preview_url;
  return null;
}

function extractPreviewUrl(order, expectedVariantId, mode) {
  if (!Array.isArray(order?.items)) return null;
  if (expectedVariantId) {
    for (const item of order.items) {
      if (Number(item?.variant_id) !== expectedVariantId) continue;
      const exact = pickPreviewFromItem(item);
      if (exact) return exact;
    }
  }

  for (const item of order.items) {
    const label = String(item?.name || item?.product?.name || "").toLowerCase();
    if (mode === "framed") {
      if (!label.includes("framed")) continue;
    } else {
      if (!label.includes("poster") || label.includes("framed")) continue;
    }
    const inferred = pickPreviewFromItem(item);
    if (inferred) return inferred;
  }

  if (mode === "framed") {
    for (const item of order.items) {
      const any = pickPreviewFromItem(item);
      if (any) return any;
    }
  }

  return null;
}

async function downloadToFile(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "starmapco-proof-sync",
    },
  });
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}) for ${url}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.some((type) => contentType.startsWith(type))) {
    throw new Error(`Unexpected content type for proof image: ${contentType || "unknown"}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

async function fetchVariantCatalogImage(variantId) {
  if (!variantId) return null;
  const data = await requestJson(`/products/variant/${encodeURIComponent(String(variantId))}`);
  const variant = data?.result?.variant;
  const imageUrl = typeof variant?.image === "string" ? variant.image : "";
  if (!imageUrl) return null;
  return {
    variantId: Number(variant?.id) || variantId,
    label: String(variant?.name || "").trim() || null,
    imageUrl,
  };
}

async function main() {
  const outputDir = resolve(process.cwd(), "public", "printproof");
  mkdirSync(outputDir, { recursive: true });

  const ordersResponse = await requestJson(`/orders?store_id=${encodeURIComponent(storeId)}&limit=25`);
  const orders = Array.isArray(ordersResponse?.result) ? ordersResponse.result : [];
  if (!orders.length) {
    throw new Error("No Printful orders found.");
  }

  let framed = null;
  let unframed = null;

  for (const orderSummary of orders) {
    if (framed && unframed) break;
    const orderId = orderSummary?.id;
    if (!orderId) continue;
    const detailResponse = await requestJson(
      `/orders/${encodeURIComponent(String(orderId))}?store_id=${encodeURIComponent(storeId)}`,
    );
    const detail = detailResponse?.result;
    if (!detail) continue;
    if (!framed) {
      const previewUrl = extractPreviewUrl(detail, validVariant(framedVariant), "framed");
      if (previewUrl) {
        framed = {
          orderId: String(orderId),
          previewUrl,
          created: detail?.created || orderSummary?.created || null,
        };
      }
    }
    if (!unframed) {
      const previewUrl = extractPreviewUrl(detail, validVariant(unframedVariant), "unframed");
      if (previewUrl) {
        unframed = {
          orderId: String(orderId),
          previewUrl,
          created: detail?.created || orderSummary?.created || null,
        };
      }
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    framed: null,
    unframed: null,
    catalog: {
      framed: null,
      unframed: null,
    },
  };

  if (framed?.previewUrl) {
    const filePath = resolve(outputDir, "framed-latest.png");
    await downloadToFile(framed.previewUrl, filePath);
    manifest.framed = {
      orderId: framed.orderId,
      created: framed.created,
      sourceUrl: framed.previewUrl,
      localPath: "/printproof/framed-latest.png",
    };
    console.log(`Saved framed proof image from order ${framed.orderId}`);
  } else {
    console.log("No framed preview image found in recent orders.");
  }

  if (unframed?.previewUrl) {
    const filePath = resolve(outputDir, "unframed-latest.png");
    await downloadToFile(unframed.previewUrl, filePath);
    manifest.unframed = {
      orderId: unframed.orderId,
      created: unframed.created,
      sourceUrl: unframed.previewUrl,
      localPath: "/printproof/unframed-latest.png",
    };
    console.log(`Saved unframed proof image from order ${unframed.orderId}`);
  } else {
    console.log("No unframed preview image found in recent orders.");
  }

  const framedCatalog = await fetchVariantCatalogImage(validVariant(framedVariant));
  if (framedCatalog?.imageUrl) {
    await downloadToFile(framedCatalog.imageUrl, resolve(outputDir, "framed-catalog.jpg"));
    manifest.catalog.framed = {
      variantId: framedCatalog.variantId,
      label: framedCatalog.label,
      sourceUrl: framedCatalog.imageUrl,
      localPath: "/printproof/framed-catalog.jpg",
    };
    console.log(`Saved framed catalog image from variant ${framedCatalog.variantId}`);
  }

  const unframedCatalog = await fetchVariantCatalogImage(validVariant(unframedVariant));
  if (unframedCatalog?.imageUrl) {
    await downloadToFile(unframedCatalog.imageUrl, resolve(outputDir, "unframed-catalog.jpg"));
    manifest.catalog.unframed = {
      variantId: unframedCatalog.variantId,
      label: unframedCatalog.label,
      sourceUrl: unframedCatalog.imageUrl,
      localPath: "/printproof/unframed-catalog.jpg",
    };
    console.log(`Saved unframed catalog image from variant ${unframedCatalog.variantId}`);
  }

  writeFileSync(resolve(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("Updated public/printproof/manifest.json");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
