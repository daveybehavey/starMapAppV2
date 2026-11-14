import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import type { EntitlementAuthorityState } from "@/lib/entitlementAuthorityState";

export const runtime = "nodejs";

type AuthorityNamespace = {
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): {
    exportState(): Promise<EntitlementAuthorityState | null>;
  };
};

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function resolveNamespace(env: unknown): AuthorityNamespace | null {
  if (!env || typeof env !== "object") return null;
  const binding = (env as { ENTITLEMENT_AUTHORITY?: AuthorityNamespace }).ENTITLEMENT_AUTHORITY;
  return binding ?? null;
}

/**
 * Read-only ops export for EntitlementAuthorityDO.
 * Mirrors existing /api/ops/* admin-token auth and fails closed when the
 * token is absent/wrong or the DO binding is unavailable. GET only.
 */
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() || "";
  const instanceId = req.nextUrl.searchParams.get("instanceId")?.trim() || "";
  if (!sessionId && !instanceId) {
    return NextResponse.json(
      { ok: false, error: "sessionId or instanceId required" },
      { status: 400 },
    );
  }

  let env: unknown;
  try {
    env = getCloudflareContext().env;
  } catch {
    return NextResponse.json(
      { ok: false, error: "cloudflare_context_unavailable" },
      { status: 503 },
    );
  }

  const ns = resolveNamespace(env);
  if (!ns) {
    return NextResponse.json(
      { ok: false, error: "entitlement_authority_unavailable" },
      { status: 503 },
    );
  }

  try {
    const id = instanceId ? ns.idFromString(instanceId) : ns.idFromName(sessionId);
    const stub = ns.get(id);
    const state = await stub.exportState();
    return NextResponse.json({
      ok: true,
      instanceId: String(id),
      sessionId: sessionId || state?.sessionId || null,
      capturedAt: new Date().toISOString(),
      state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "entitlement_authority_export_failed",
      },
      { status: 500 },
    );
  }
}
