import { NextResponse } from "next/server";
import { kv } from "@/lib/kv";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json({ paid: false, error: "Missing session_id" }, { status: 400 });
  }

  const record = await kv.get<{ paid?: boolean }>(`stripe:session:${sessionId}`);
  return NextResponse.json({ paid: Boolean(record?.paid) });
}
