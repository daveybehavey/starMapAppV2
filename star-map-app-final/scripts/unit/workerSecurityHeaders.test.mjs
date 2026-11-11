import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { withWorkerSecurityHeaders } from "../../src/lib/workerSecurityHeaders.ts";

const baseline = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
test("F-HDR-1 emits only the six owned headers with exact static values", () => {
  const response = withWorkerSecurityHeaders(new Response(null));
  assert.deepEqual(Object.fromEntries(response.headers), {
    "content-security-policy": baseline,
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=300",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  assert.doesNotMatch([...response.headers.values()].join("\n"), /'unsafe-inline'|'unsafe-eval'/);
});

test("F-HDR-1 preserves redirect, cache, MIME, and separate cookies including Expires", () => {
  const headers = new Headers({ Location: "/editor", "Cache-Control": "private, no-store", "Content-Type": "text/html" });
  const cookies = ["a=1; Path=/; HttpOnly", "b=2; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Secure"];
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));
  const original = new Response(null, { status: 307, statusText: "Temporary Redirect", headers });
  const response = withWorkerSecurityHeaders(original);
  assert.equal(response.status, 307);
  assert.equal(response.statusText, "Temporary Redirect");
  for (const name of ["Location", "Cache-Control", "Content-Type"]) assert.equal(response.headers.get(name), original.headers.get(name));
  assert.deepEqual(response.headers.getSetCookie(), cookies);
  assert.equal(original.headers.get("X-Frame-Options"), null);
});

test("F-HDR-1 retains a streaming body without reading or buffering it", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("first")); } });
  const original = new Response(stream, { status: 202 });
  const response = withWorkerSecurityHeaders(original);
  assert.equal(response.body, original.body);
  assert.equal(original.bodyUsed, false);
  assert.equal(stream.locked, false);
  assert.equal(response.status, 202);
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "first");
  await reader.cancel();
});

test("F-HDR-1 decorates immutable responses and preserves application CSP policies", () => {
  assert.equal(withWorkerSecurityHeaders(Response.redirect("https://example.test/", 302)).status, 302);
  const policy = "script-src 'nonce-fixture'; default-src 'self'";
  const original = new Response(null, { headers: { "Content-Security-Policy": policy, "Content-Security-Policy-Report-Only": "default-src 'self'" } });
  const response = withWorkerSecurityHeaders(original);
  assert.equal(response.headers.get("Content-Security-Policy"), `${policy}, ${baseline}`);
  assert.equal(response.headers.get("Content-Security-Policy-Report-Only"), "default-src 'self'");
});

test("F-HDR-1 wraps the generated fetch inside Sentry and forwards all invocation arguments", () => {
  const source = readFileSync(new URL("../../cloudflare-worker.ts", import.meta.url), "utf8");
  assert.match(source, /async fetch\(request, env, ctx\)\s*\{\s*return withWorkerSecurityHeaders\(await handler\.fetch\(request, env, ctx\)\);\s*\}/);
  assert.match(source, /export default Sentry\.withSentry\(sentryOptions, workerHandler\)/);
});
