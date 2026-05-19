import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import fs from "node:fs/promises";
import path from "node:path";
import { kv } from "@/lib/kv";
import { hasRecoverableAccess, type AccountAccessSessionRecord } from "@/lib/accountAccessLinks";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";

const BUCKET_BINDING = "NEXT_INC_CACHE_R2_BUCKET";
const KEY_PREFIX = "download-archive/hd/";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const LOCAL_FALLBACK_DIR = process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR?.trim() || path.join(process.cwd(), ".tmp", "download-archive");

type ClaimRecord = {
  sessionId: string;
  mapId?: string;
  createdAt: number;
};

const claimKey = (token: string) => `claim:${token}`;
const sessionKey = (sessionId: string) => `stripe:session:${sessionId}`;

async function getR2Bucket(): Promise<R2Bucket | null> {
  const timeoutMs = 120;
  try {
    const ctx = await Promise.race([
      getCloudflareContext({ async: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    const env = (ctx as { env?: unknown } | null)?.env as Record<string, unknown> | undefined;
    const bucket = env?.[BUCKET_BINDING] as R2Bucket | undefined;
    return bucket ?? null;
  } catch {
    return null;
  }
}

function objectKeyForSession(sessionId: string) {
  return `${KEY_PREFIX}${sessionId}.png`;
}

async function requireEntitledSession(token: string) {
  const claim = await kv.get<ClaimRecord>(claimKey(token));
  if (!claim?.sessionId) return null;

  const record = await kv.get<AccountAccessSessionRecord>(sessionKey(claim.sessionId));
  if (!record || !hasRecoverableAccess(record)) return null;

  return { sessionId: claim.sessionId, record, mapId: claim.mapId ?? record.mapId ?? undefined };
}

async function readLocalObject(key: string) {
  const safeName = Buffer.from(key, "utf8").toString("base64url");
  const filePath = path.join(LOCAL_FALLBACK_DIR, safeName);
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function writeLocalObject(key: string, bytes: Uint8Array) {
  const safeName = Buffer.from(key, "utf8").toString("base64url");
  const filePath = path.join(LOCAL_FALLBACK_DIR, safeName);
  await fs.mkdir(LOCAL_FALLBACK_DIR, { recursive: true });
  await fs.writeFile(filePath, bytes);
}

async function enforceArchiveRateLimit(req: NextRequest, action: "get" | "post") {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`download:archive:${action}:${ip}`, action === "get" ? 40 : 10, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const limited = await enforceArchiveRateLimit(req, "get");
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const session = await requireEntitledSession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const key = objectKeyForSession(session.sessionId);
  const bucket = await getR2Bucket();
  let bodyBytes: Uint8Array | null = null;

  if (bucket) {
    const object = await bucket.get(key);
    if (!object) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const arrayBuffer = await object.arrayBuffer();
    bodyBytes = new Uint8Array(arrayBuffer);
  } else {
    bodyBytes = await readLocalObject(key);
    if (!bodyBytes) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
  }

  const filenameBase = session.mapId ? `starmapco-${session.mapId}` : `starmapco-${session.sessionId}`;
  const body = Buffer.from(bodyBytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=0, no-store",
      "content-disposition": `attachment; filename="${filenameBase}.png"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const limited = await enforceArchiveRateLimit(req, "post");
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const session = await requireEntitledSession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type")?.trim().toLowerCase() || "";
  if (!contentType.includes("image/png")) {
    return NextResponse.json({ ok: false, error: "content-type must be image/png" }, { status: 415 });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "invalid_size" }, { status: 413 });
  }

  const key = objectKeyForSession(session.sessionId);
  const bucket = await getR2Bucket();

  if (bucket) {
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType: "image/png",
      },
      customMetadata: {
        sessionId: session.sessionId,
        mapId: session.mapId ?? "",
      },
    });
  } else {
    await writeLocalObject(key, bytes);
  }

  return NextResponse.json({ ok: true, sessionId: session.sessionId, bytes: bytes.length });
}

