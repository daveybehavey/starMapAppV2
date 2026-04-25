import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { querySearchConsole } from "@/lib/searchConsole";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function parseIsoDate(raw: string | null, fallback: string) {
  const value = (raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return value;
}

function parseRowLimit(raw: string | null, fallback: number) {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(25_000, parsed);
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const siteUrl =
    (req.nextUrl.searchParams.get("site")?.trim() ||
      process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() ||
      process.env.GSC_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      "") ?? "";

  if (!siteUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing site URL. Set GOOGLE_SEARCH_CONSOLE_SITE_URL, GSC_SITE_URL, or pass ?site= (property URL, e.g. sc-domain:example.com or https://example.com/)",
      },
      { status: 400 },
    );
  }

  const endDate = parseIsoDate(req.nextUrl.searchParams.get("end"), new Date().toISOString().slice(0, 10));
  const startDate = parseIsoDate(req.nextUrl.searchParams.get("start"), endDate);
  const rowLimit = parseRowLimit(req.nextUrl.searchParams.get("limit"), 250);

  const dimensionsParam = (req.nextUrl.searchParams.get("dimensions") || "query,page")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const data = await querySearchConsole({
      siteUrl,
      request: {
        startDate,
        endDate,
        dimensions: dimensionsParam.length ? dimensionsParam : undefined,
        rowLimit,
        searchType: "web",
      },
    });
    return NextResponse.json({ ok: true, siteUrl, startDate, endDate, rowLimit, dimensions: dimensionsParam, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "search_console_query_failed" },
      { status: 500 },
    );
  }
}

