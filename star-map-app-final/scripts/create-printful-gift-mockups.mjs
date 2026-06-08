#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv(process.cwd());

const apiBase = (process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com").trim().replace(/\/+$/, "");
const token = (process.env.PRINTFUL_API_TOKEN || "").trim();
const storeId = (process.env.PRINTFUL_STORE_ID || "").trim();
if (!token || !storeId) {
  console.error("Missing PRINTFUL_API_TOKEN or PRINTFUL_STORE_ID in env.");
  process.exit(1);
}

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").trim().replace(/\/+$/, "");
const sourceArtUrl = `${siteUrl}/examples/example-anniversary-heirloom.png`;

const outputRoot = resolve(process.cwd(), "public", "printproof", "gift-raw");
mkdirSync(outputRoot, { recursive: true });

const recipient = {
  name: process.env.PRINTFUL_PROOF_RECIPIENT_NAME || "StarMapCo Proof",
  email: process.env.PRINTFUL_PROOF_RECIPIENT_EMAIL || "support@starmapco.com",
  phone: process.env.PRINTFUL_PROOF_RECIPIENT_PHONE || "5555555555",
  address1: process.env.PRINTFUL_PROOF_RECIPIENT_ADDRESS1 || "1600 Amphitheatre Pkwy",
  city: process.env.PRINTFUL_PROOF_RECIPIENT_CITY || "Mountain View",
  state_code: process.env.PRINTFUL_PROOF_RECIPIENT_STATE_CODE || "CA",
  country_code: process.env.PRINTFUL_PROOF_RECIPIENT_COUNTRY_CODE || "US",
  zip: process.env.PRINTFUL_PROOF_RECIPIENT_ZIP || "94043",
};

async function requestJson(pathname, init = {}) {
  const res = await fetch(`${apiBase}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "starmapco-gift-mockups",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Printful ${pathname} failed (${res.status}): ${body.slice(0, 320)}`);
  }
  return body ? JSON.parse(body) : null;
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url, { headers: { "User-Agent": "starmapco-gift-mockups-downloader" } });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filePath, buf);
}

function normalizeStitchColor(v) {
  const c = String(v || "").toLowerCase();
  if (c.includes("black")) return "black";
  if (c.includes("white")) return "white";
  return "white";
}

function extractPreviewUrlFromOrderDetail(detail) {
  const items = Array.isArray(detail?.result?.items) ? detail.result.items : [];
  for (const item of items) {
    const files = Array.isArray(item?.files) ? item.files : [];
    const preferred = files.find((f) => f?.type === "preview" && f?.preview_url)?.preview_url || null;
    if (preferred) return preferred;
    const fallback = files.find((f) => f?.preview_url)?.preview_url || null;
    if (fallback) return fallback;
  }
  return null;
}

function pickFirstAvailableVariantV1(productDetail) {
  const variants = Array.isArray(productDetail?.result?.variants) ? productDetail.result.variants : [];
  const v = variants.find((x) => Number.isFinite(Number(x?.id))) || variants[0];
  if (!v?.id) throw new Error("No v1 variants returned.");
  return v;
}

function pickFirstVariantV2(v2VariantsResp) {
  const variants = Array.isArray(v2VariantsResp?.data) ? v2VariantsResp.data : [];
  const v = variants[0];
  if (!v?.id) throw new Error("No v2 catalog variants returned.");
  return v;
}

async function createOrderPreview({ externalId, variantId, variantColor, retryOnStitchColor = true }) {
  const q = new URLSearchParams({ store_id: storeId, update_existing: "1" });

  const basePayload = {
    external_id: externalId,
    shipping: "STANDARD",
    recipient,
    items: [{ variant_id: variantId, quantity: 1, files: [{ url: sourceArtUrl }] }],
  };

  const tryPayload = (payload) =>
    requestJson(`/orders?${q.toString()}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

  let payload = basePayload;
  try {
    const created = await tryPayload(payload);
    const orderId = created?.result?.id;
    if (!orderId) throw new Error("Missing order id from create order response.");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const detail = await requestJson(`/orders/${encodeURIComponent(String(orderId))}?store_id=${encodeURIComponent(storeId)}`);
      const previewUrl = extractPreviewUrlFromOrderDetail(detail);
      if (previewUrl) return { orderId: String(orderId), previewUrl };
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Preview URL not found after retries.");
  } catch (err) {
    if (!retryOnStitchColor) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("stitch_color")) throw err;

    payload = {
      ...basePayload,
      items: [
        {
          variant_id: variantId,
          quantity: 1,
          files: [{ url: sourceArtUrl }],
          options: { stitch_color: normalizeStitchColor(variantColor) },
        },
      ],
    };

    const created = await tryPayload(payload);
    const orderId = created?.result?.id;
    if (!orderId) throw new Error("Missing order id from create order response (retry).");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const detail = await requestJson(`/orders/${encodeURIComponent(String(orderId))}?store_id=${encodeURIComponent(storeId)}`);
      const previewUrl = extractPreviewUrlFromOrderDetail(detail);
      if (previewUrl) return { orderId: String(orderId), previewUrl };
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Preview URL not found after retries (stitch_color retry).");
  }
}

async function main() {
  const tasks = [
    // v1 product ids from scripts/printful-catalog-scan.mjs output
    { category: "tshirt", productIdV1: 679, outputFile: "tshirt-mockup.png", sourceType: "v1" },
    { category: "hoodie", productIdV1: 388, outputFile: "hoodie-mockup.png", sourceType: "v1" },
    // v2 catalog product id confirmed via probe script
    { category: "sticker", productIdV2: 656, outputFile: "sticker-mockup.png", sourceType: "v2" },
  ];

  const report = [];

  for (const t of tasks) {
    const categoryDir = resolve(outputRoot, t.category);
    mkdirSync(categoryDir, { recursive: true });

    if (t.sourceType === "v1") {
      const productDetail = await requestJson(`/products/${encodeURIComponent(String(t.productIdV1))}`);
      const v = pickFirstAvailableVariantV1(productDetail);
      const variantId = Number(v.id);
      const variantColor = v?.color || v?.stitch_color || v?.variant_color || "";

      console.log(`Generating ${t.category} from v1 product ${t.productIdV1} variant ${variantId}`);
      const { orderId, previewUrl } = await createOrderPreview({
        externalId: `gift_${t.category}_${t.productIdV1}_${variantId}`,
        variantId,
        variantColor,
      });
      const filePath = resolve(categoryDir, t.outputFile);
      await downloadToFile(previewUrl, filePath);
      report.push({ category: t.category, productIdV1: t.productIdV1, variantId, orderId, previewUrl, filePath });
    } else {
      const v2Variants = await requestJson(`/v2/catalog-products/${encodeURIComponent(String(t.productIdV2))}/catalog-variants?offset=0&limit=20`);
      const v = pickFirstVariantV2(v2Variants);
      const variantId = Number(v.id);
      const variantColor = v?.color || "";

      console.log(`Generating ${t.category} from v2 product ${t.productIdV2} variant ${variantId}`);
      const { orderId, previewUrl } = await createOrderPreview({
        externalId: `gift_${t.category}_${t.productIdV2}_${variantId}`,
        variantId,
        variantColor,
      });
      const filePath = resolve(categoryDir, t.outputFile);
      await downloadToFile(previewUrl, filePath);
      report.push({ category: t.category, productIdV2: t.productIdV2, variantId, orderId, previewUrl, filePath });
    }
  }

  const reportPath = resolve(outputRoot, "generation-report.json");
  writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), sourceArtUrl, report }, null, 2));
  console.log("Gift mockup generation complete:", reportPath);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

