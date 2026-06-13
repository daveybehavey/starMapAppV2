import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { validatePrintAssetBytes } from "@/lib/printAssetValidation";
import {
  parsePrintAssetTtlSeconds,
  PRINT_ASSET_ID_REGEX,
  printAssetKey,
  normalizeRecipeFingerprint,
  type StoredPrintAsset,
} from "@/lib/printAssets";
import { indexPrintAssetForMap } from "@/lib/printAssetReuse";

export const runtime = "nodejs";

const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const MAP_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CreatePrintAssetBody = {
  mapId?: unknown;
  dataUrl?: unknown;
  source?: unknown;
  recipeFingerprint?: unknown;
};

function decodeDataUrl(raw: string) {
  const match = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(raw.trim());
  if (!match) return null;
  const mimeType = match[1] as "image/png" | "image/jpeg";
  const base64Data = match[2];
  const paddingLength = base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((base64Data.length * 3) / 4) - paddingLength;
  if (!Number.isFinite(byteLength) || byteLength <= 0 || byteLength > MAX_ASSET_BYTES) return null;
  return { mimeType, base64Data, byteLength };
}

function decodeStoredBase64(base64Data: string) {
  const decoded = Buffer.from(base64Data, "base64");
  const arrayBuffer = new ArrayBuffer(decoded.byteLength);
  const bytes = new Uint8Array(arrayBuffer);
  bytes.set(decoded);
  return bytes;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`print:assets:create:${ip}`, 5, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let body: CreatePrintAssetBody;
  try {
    body = (await req.json()) as CreatePrintAssetBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) {
    return NextResponse.json(
      { error: "Invalid print asset. Expected base64 PNG/JPEG data under 16MB." },
      { status: 400 },
    );
  }

  let assetBytes: Uint8Array;
  try {
    assetBytes = decodeStoredBase64(decoded.base64Data);
  } catch {
    return NextResponse.json({ error: "Invalid print asset encoding.", code: "invalid_print_asset" }, { status: 400 });
  }

  const validation = validatePrintAssetBytes(assetBytes);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message, code: validation.code }, { status: 400 });
  }

  const mapId = typeof body.mapId === "string" ? body.mapId.trim() : "";
  const normalizedMapId = mapId && MAP_ID_REGEX.test(mapId) ? mapId : undefined;
  const source = body.source === "download" ? "download" : body.source === "editor" ? "editor" : undefined;
  const recipeFingerprint = normalizeRecipeFingerprint(body.recipeFingerprint);
  const assetId = crypto.randomUUID();
  const ttlSeconds = parsePrintAssetTtlSeconds();
  const payload: StoredPrintAsset = {
    mapId: normalizedMapId,
    mimeType: decoded.mimeType,
    base64Data: decoded.base64Data,
    createdAt: Date.now(),
    source,
  };
  await kv.set(printAssetKey(assetId), payload, { ex: ttlSeconds });
  if (normalizedMapId) {
    await indexPrintAssetForMap({
      mapId: normalizedMapId,
      assetId,
      recipeFingerprint,
      ttlSeconds,
    });
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/+$/, "");
  return NextResponse.json({
    ok: true,
    assetId,
    assetUrl: `${origin}/api/print/assets?id=${assetId}`,
    ttlSeconds,
  });
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`print:assets:read:${ip}`, 120, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const assetId = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!assetId || !PRINT_ASSET_ID_REGEX.test(assetId)) {
    return NextResponse.json({ error: "Invalid print asset id" }, { status: 400 });
  }

  const record = await kv.get<StoredPrintAsset>(printAssetKey(assetId));
  if (!record?.base64Data || !record.mimeType) {
    return NextResponse.json({ error: "Print asset not found" }, { status: 404 });
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeStoredBase64(record.base64Data);
  } catch {
    return NextResponse.json({ error: "Corrupt print asset" }, { status: 422 });
  }

  const blob = new Blob([bytes], { type: record.mimeType });
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": record.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
