/**
 * rateLimit.ts — pure helper seams (IP extraction, headers, monitoring bypass).
 *
 * Regression targets:
 * - getClientIp header precedence (Cloudflare → x-forwarded-for first hop →
 *   x-real-ip → stable anon fingerprint)
 * - getRateLimitHeaders never report negative remaining
 * - isInternalMonitoringRequest only matches the live-smoke UA prefix
 * - rateLimitResponse is a deterministic 429 with Retry-After
 *
 * checkRateLimit (KV-backed) is out of this file's pure-helper focus; the
 * KV path is inseparable from storage and is noted as such in the PR.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  getClientIp,
  getRateLimitHeaders,
  isInternalMonitoringRequest,
  rateLimitResponse,
} = await import("../../src/lib/rateLimit.ts");

function req(headers) {
  return new Request("https://example.test/api", { headers });
}

test("getClientIp: Cloudflare connecting IP wins over every proxy header", () => {
  assert.equal(
    getClientIp(
      req({
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "198.51.100.1, 203.0.113.9",
        "x-real-ip": "198.51.100.2",
      }),
    ),
    "203.0.113.9",
  );
});

test("getClientIp: x-forwarded-for uses the first hop; x-real-ip is the fallback", () => {
  assert.equal(
    getClientIp(req({ "x-forwarded-for": " 198.51.100.7 , 10.0.0.1" })),
    "198.51.100.7",
  );
  assert.equal(getClientIp(req({ "x-real-ip": "198.51.100.8" })), "198.51.100.8");
});

test("getClientIp: missing headers yield a stable anon-* fingerprint (not a shared bucket)", () => {
  const a = getClientIp(req({ "user-agent": "AgentA", "accept-language": "en" }));
  const b = getClientIp(req({ "user-agent": "AgentA", "accept-language": "en" }));
  const c = getClientIp(req({ "user-agent": "AgentB", "accept-language": "en" }));
  assert.match(a, /^anon-[0-9a-z]+$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("getRateLimitHeaders: remaining is floored at zero; reset is echoed", () => {
  assert.deepEqual(getRateLimitHeaders(3, 10, 42), {
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": "3",
    "X-RateLimit-Reset": "42",
  });
  assert.deepEqual(getRateLimitHeaders(-5, 10, 7), {
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": "7",
  });
});

test("isInternalMonitoringRequest: only the StarMapCo-LiveSmoke/ UA prefix bypasses", () => {
  assert.equal(
    isInternalMonitoringRequest(req({ "user-agent": "StarMapCo-LiveSmoke/1.0" })),
    true,
  );
  assert.equal(
    isInternalMonitoringRequest(req({ "user-agent": "StarMapCo-LiveSmoke/" })),
    true,
  );
  assert.equal(isInternalMonitoringRequest(req({ "user-agent": "Mozilla/5.0" })), false);
  assert.equal(isInternalMonitoringRequest(req({ "user-agent": "LiveSmoke/1.0" })), false);
  assert.equal(isInternalMonitoringRequest(req({})), false);
});

test("rateLimitResponse: 429 JSON body with Retry-After matching resetIn", async () => {
  const response = rateLimitResponse(17);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "17");
  assert.equal(response.headers.get("Content-Type"), "application/json");
  const body = await response.json();
  assert.equal(body.code, "rate_limited");
  assert.match(body.error, /too many requests/i);
});
