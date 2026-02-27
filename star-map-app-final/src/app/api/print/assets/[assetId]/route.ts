import { NextRequest, NextResponse } from "next/server";
import { PRINT_ASSET_ID_REGEX } from "@/lib/printAssets";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId: rawAssetId } = await params;
  const assetId = rawAssetId?.trim();
  if (!assetId || !PRINT_ASSET_ID_REGEX.test(assetId)) {
    return NextResponse.json({ error: "Invalid print asset id" }, { status: 400 });
  }
  const target = new URL("/api/print/assets", req.url);
  target.searchParams.set("id", assetId);
  return NextResponse.redirect(target, { status: 307 });
}
