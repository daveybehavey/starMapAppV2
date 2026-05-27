import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { trySendHdArchiveReadyEmail } from "@/lib/accountAccessDelivery";
import { getDownloadArchiveR2Bucket } from "@/lib/downloadArchiveStorage";
import {
  ENTITLEMENT_KV,
  ENTITLEMENT_R2,
  evaluateDigitalAccess,
  type ClaimTokenRecord,
  type StripeSessionEntitlement,
} from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const LOCAL_FALLBACK_DIR = process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR?.trim() || path.join(process.cwd(), ".tmp", "download-archive");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");

async function requireEntitledSession(token: string) {
  const claim = await kv.get<ClaimTokenRecord>(ENTITLEMENT_KV.claim(token));
  if (!claim?.sessionId) return null;

  const record = await kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(claim.sessionId));
  if (!record || !evaluateDigitalAccess(record)) return null;

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

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const session = await requireEntitledSession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const key = ENTITLEMENT_R2.hdArchiveKey(session.sessionId);
  const bucket = await getDownloadArchiveR2Bucket();
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

  const key = ENTITLEMENT_R2.hdArchiveKey(session.sessionId);
  const bucket = await getDownloadArchiveR2Bucket();

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

  void trySendHdArchiveReadyEmail({
    siteOrigin: siteUrl,
    sessionId: session.sessionId,
  }).catch((err) => {
    console.warn("HD archive ready email failed", err);
  });

  return NextResponse.json({ ok: true, sessionId: session.sessionId, bytes: bytes.length });
}
