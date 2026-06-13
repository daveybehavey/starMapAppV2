import { NextRequest, NextResponse } from "next/server";
import { isValidMapId } from "@/lib/mapId";
import { normalizeRecipeFingerprint } from "@/lib/printAssets";
import { loadReusablePrintAssetId } from "@/lib/printAssetReuse";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`print:assets:resolve:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const mapId = req.nextUrl.searchParams.get("map_id")?.trim() || "";
  if (!isValidMapId(mapId)) {
    return NextResponse.json({ error: "Invalid map id", code: "invalid_map_id" }, { status: 400 });
  }

  const recipeFingerprint = normalizeRecipeFingerprint(req.nextUrl.searchParams.get("fingerprint"));
  const assetId = await loadReusablePrintAssetId(mapId, recipeFingerprint);
  if (!assetId) {
    return NextResponse.json({ error: "No reusable print asset", code: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, assetId, mapId });
}
