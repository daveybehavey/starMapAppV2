import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CANONICAL_HOST = "starmapco.com";
const REDIRECT_HOSTS = new Set([
  "www.starmapco.com",
  "starmapco.ca",
  "www.starmapco.ca",
]);

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";

  if (host === CANONICAL_HOST || host.includes("localhost") || host.startsWith("127.0.0.1")) {
    return NextResponse.next();
  }

  if (REDIRECT_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = "https";
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
