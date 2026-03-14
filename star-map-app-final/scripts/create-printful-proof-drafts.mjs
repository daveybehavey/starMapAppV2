#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const token = (process.env.PRINTFUL_API_TOKEN || "").trim();
const storeId = (process.env.PRINTFUL_STORE_ID || "").trim();
const apiBase = (process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com").trim();
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").trim().replace(/\/+$/, "");

const framedVariantId = Number.parseInt((process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED || "").trim(), 10);
const unframedVariantId = Number.parseInt((process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED || "").trim(), 10);

const sourceArtPath = "/examples/example-anniversary-heirloom.png";
const sourceArtUrl = `${siteUrl}${sourceArtPath}`;

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

if (!token || !storeId) {
  console.error("Missing PRINTFUL_API_TOKEN or PRINTFUL_STORE_ID.");
  process.exit(1);
}

if (!Number.isFinite(framedVariantId) || !Number.isFinite(unframedVariantId)) {
  console.error("Missing PRINTFUL_VARIANT_ID_POSTER_FRAMED or PRINTFUL_VARIANT_ID_POSTER_UNFRAMED.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(pathname, init = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "starmapco-proof-drafts",
      ...(storeId ? { "X-PF-Store-Id": storeId } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  let parsed = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const reason =
      parsed &&
      typeof parsed === "object" &&
      parsed.error &&
      typeof parsed.error.reason === "string" &&
      parsed.error.reason.trim()
        ? parsed.error.reason.trim()
        : body.slice(0, 240) || `Printful request failed (${response.status})`;
    throw new Error(reason);
  }

  return parsed;
}

function pickPreviewUrl(item) {
  const files = Array.isArray(item?.files) ? item.files : [];
  const preferred = files.find((file) => file?.type === "preview" && file?.preview_url);
  if (preferred?.preview_url) return preferred.preview_url;
  const fallback = files.find((file) => file?.preview_url);
  return fallback?.preview_url || null;
}

function extractPreviewUrl(order, variantId) {
  if (!Array.isArray(order?.items)) return null;
  for (const item of order.items) {
    if (Number(item?.variant_id) !== variantId) continue;
    const previewUrl = pickPreviewUrl(item);
    if (previewUrl) return previewUrl;
  }
  return null;
}

async function downloadToFile(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "starmapco-proof-drafts",
    },
  });
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}) for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

async function createMockup({ productId, variantId, label, position }) {
  const payload = {
    variant_ids: [variantId],
    format: "jpg",
    width: 1200,
    files: [
      {
        placement: "default",
        image_url: sourceArtUrl,
        position,
      },
    ],
  };

  const task = await requestJson(`/mockup-generator/create-task/${productId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const taskKey = task?.result?.task_key;
  if (!taskKey) {
    throw new Error(`${label}: missing mockup task key`);
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await requestJson(`/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`);
    const result = status?.result;
    if (result?.status === "completed") {
      const mockupUrl = Array.isArray(result.mockups) ? result.mockups[0]?.mockup_url : null;
      if (!mockupUrl) {
        throw new Error(`${label}: mockup completed without a mockup url`);
      }
      return {
        taskKey,
        mockupUrl,
      };
    }
    if (result?.status === "failed") {
      throw new Error(`${label}: mockup generation failed`);
    }
    await sleep(5000);
  }

  throw new Error(`${label}: mockup generation timed out`);
}

async function createOrUpdateDraft({ externalId, productId, variantId, label, position }) {
  const query = new URLSearchParams({
    store_id: storeId,
    update_existing: "1",
  });

  const payload = {
    external_id: externalId,
    shipping: "STANDARD",
    recipient,
    items: [
      {
        variant_id: variantId,
        quantity: 1,
        files: [{ url: sourceArtUrl }],
      },
    ],
  };

  const created = await requestJson(`/orders?${query.toString()}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const orderId = created?.result?.id;
  if (!orderId) {
    throw new Error(`${label}: missing order id from Printful response`);
  }

  let previewUrl = null;
  let detail = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const fetched = await requestJson(`/orders/${encodeURIComponent(String(orderId))}?store_id=${encodeURIComponent(storeId)}`);
    detail = fetched?.result || null;
    previewUrl = extractPreviewUrl(detail, variantId);
    if (previewUrl) break;
    await sleep(5000);
  }

  const mockup = await createMockup({ productId, variantId, label, position });

  return {
    label,
    orderId: String(orderId),
    previewUrl,
    status: detail?.status || null,
    sourceArtUrl,
    mockupUrl: mockup.mockupUrl,
    mockupTaskKey: mockup.taskKey,
  };
}

async function main() {
  const outputDir = resolve(process.cwd(), "public", "printproof");
  mkdirSync(outputDir, { recursive: true });

  const results = [];
  results.push(
    await createOrUpdateDraft({
      externalId: "proof_framed_latest",
      productId: 2,
      variantId: framedVariantId,
      label: "framed",
      position: { area_width: 4200, area_height: 4200, width: 4200, height: 4200, top: 0, left: 0 },
    }),
  );
  results.push(
    await createOrUpdateDraft({
      externalId: "proof_unframed_latest",
      productId: 1,
      variantId: unframedVariantId,
      label: "unframed",
      position: { area_width: 5400, area_height: 5400, width: 5400, height: 5400, top: 0, left: 0 },
    }),
  );

  for (const result of results) {
    if (!result.mockupUrl) continue;
    const localFilename = `${result.label}-mockup.jpg`;
    await downloadToFile(result.mockupUrl, resolve(outputDir, localFilename));
    result.localMockupPath = `/printproof/${localFilename}`;
  }

  const manifestPath = resolve(outputDir, "manifest.json");
  const existingManifest =
    existsSync(manifestPath) && readFileSync(manifestPath, "utf8").trim()
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : {};
  const nextManifest = {
    ...existingManifest,
    generatedAt: new Date().toISOString(),
    mockups: {
      framed:
        results.find((result) => result.label === "framed" && result.localMockupPath)
          ? {
              orderId: results.find((result) => result.label === "framed")?.orderId,
              localPath: results.find((result) => result.label === "framed")?.localMockupPath,
              sourceUrl: results.find((result) => result.label === "framed")?.mockupUrl,
            }
          : existingManifest?.mockups?.framed ?? null,
      unframed:
        results.find((result) => result.label === "unframed" && result.localMockupPath)
          ? {
              orderId: results.find((result) => result.label === "unframed")?.orderId,
              localPath: results.find((result) => result.label === "unframed")?.localMockupPath,
              sourceUrl: results.find((result) => result.label === "unframed")?.mockupUrl,
            }
          : existingManifest?.mockups?.unframed ?? null,
    },
  };
  writeFileSync(manifestPath, JSON.stringify(nextManifest, null, 2));

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), sourceArtUrl, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
