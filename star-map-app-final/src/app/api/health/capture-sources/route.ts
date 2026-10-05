import { NextResponse } from "next/server";

/** Stable catalog of email-capture / promo attribution entry points (page paths only). */
const CAPTURE_SOURCES: Array<{ id: string; path: string }> = [
  { id: "homepage_promo_signup", path: "/" },
  { id: "homepage_promo_jump_cta", path: "/#delivery-options" },
  { id: "editor_promo_invite", path: "/editor" },
];

export function GET() {
  return NextResponse.json(
    { sources: CAPTURE_SOURCES },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=900",
      },
    },
  );
}
