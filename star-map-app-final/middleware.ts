import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const STATIC_CACHE_CONTROL =
  "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

function rewriteStatic(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const response = NextResponse.rewrite(url);
  response.headers.set("Cache-Control", STATIC_CACHE_CONTROL);
  return response;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/") {
    return rewriteStatic(request, "/landing.html");
  }
  if (pathname === "/star-map-generator") {
    return rewriteStatic(request, "/star-map-generator.html");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/star-map-generator"],
};
