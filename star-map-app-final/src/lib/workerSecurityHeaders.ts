const BASELINE_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

/** F-HDR-1: decorate without consuming the body or flattening Set-Cookie. */
export function withWorkerSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  // First stage only; longer HSTS lifetimes require independent rollout validation.
  secured.headers.set("Strict-Transport-Security", "max-age=300");
  // Policies enforce cumulatively: retain any application nonce policy intact.
  secured.headers.append("Content-Security-Policy", BASELINE_CSP);
  return secured;
}
