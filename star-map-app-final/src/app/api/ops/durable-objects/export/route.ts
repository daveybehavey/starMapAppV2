import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import {
  exportDurableObjectInstance,
  isDoExportClassName,
  resolveDoExportNamespace,
  type DoExportClassName,
} from "@/lib/durableObjectExport";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

/**
 * Read-only Durable Object state export for backup runners.
 * Fail closed without admin credentials. Never mutates DO storage.
 * Response may contain sensitive grant/order rows — callers must not log it.
 */
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const classNameRaw = req.nextUrl.searchParams.get("class")?.trim() || "";
  const instanceId = req.nextUrl.searchParams.get("instanceId")?.trim() || "";

  if (!isDoExportClassName(classNameRaw)) {
    return NextResponse.json({ ok: false, error: "unsupported_class" }, { status: 400 });
  }
  if (!instanceId) {
    return NextResponse.json({ ok: false, error: "instanceId_required" }, { status: 400 });
  }

  const className = classNameRaw as DoExportClassName;
  const namespace = resolveDoExportNamespace(className);
  if (!namespace) {
    return NextResponse.json({ ok: false, error: "authority_unavailable" }, { status: 503 });
  }

  try {
    const exported = await exportDurableObjectInstance(namespace, instanceId);
    return NextResponse.json({
      ok: true,
      class: className,
      instanceId,
      capturedAt: new Date().toISOString(),
      state: exported.state,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "export_failed" }, { status: 502 });
  }
}
