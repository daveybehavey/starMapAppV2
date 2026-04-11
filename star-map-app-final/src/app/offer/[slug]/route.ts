import { NextResponse } from "next/server";

const DESTINATIONS: Record<string, string> = {
  reddit:
    "/editor?mode=quick&code=REDDIT50&utm_source=reddit&utm_medium=organic_promo&utm_campaign=apr2026_digital_offer&utm_content=reddit_offer_01",
  tiktok:
    "/editor?mode=quick&code=TIKTOK50&utm_source=tiktok&utm_medium=organic_promo&utm_campaign=apr2026_digital_offer&utm_content=tiktok_offer_01",
};

export function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(context);
}

export function HEAD(_: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(context);
}

async function handle(context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const key = slug.trim().toLowerCase();
  const destination = DESTINATIONS[key];

  if (!destination) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const response = NextResponse.redirect(new URL(destination, process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com"), {
    status: 307,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
