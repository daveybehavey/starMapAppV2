import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import {
  exportDoBackupState,
  isDoBackupSlice3Class,
} from "@/lib/doBackupExport";

export const runtime = "nodejs";

/**
 * Authenticated, fail-closed, read-only Durable Object state export for
 * backup slice 3. Mirrors the existing /api/ops/* admin-token pattern.
 * Response bodies carry bearer material / PII for authorized backup
 * runners only — never log or echo state contents.
 */
function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

type ExportPayload = {
  className?: unknown;
  instanceId?: unknown;
  instanceName?: unknown;
};

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: ExportPayload | null = null;
  try {
    payload = (await req.json()) as ExportPayload;
  } catch {
    payload = null;
  }

  if (!isDoBackupSlice3Class(payload?.className)) {
    return NextResponse.json({ ok: false, error: "invalid_class" }, { status: 400 });
  }

  const instanceId = typeof payload?.instanceId === "string" ? payload.instanceId.trim() : "";
  const instanceName =
    typeof payload?.instanceName === "string" ? payload.instanceName.trim() : "";
  if (!instanceId && !instanceName) {
    return NextResponse.json(
      { ok: false, error: "instanceId_or_instanceName_required" },
      { status: 400 },
    );
  }

  const exported = await exportDoBackupState({
    className: payload.className,
    instanceId: instanceId || null,
    instanceName: instanceName || null,
  });

  if (!exported) {
    // Binding missing / RPC failure — fail closed without creating a
    // synthetic row or falling back to local memory.
    return NextResponse.json({ ok: false, error: "export_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    className: payload.className,
    instanceId: exported.instanceId,
    instanceName: exported.instanceName,
    state: exported.state,
    capturedAt: new Date().toISOString(),
  });
}
