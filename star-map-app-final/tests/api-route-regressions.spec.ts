import { expect, test, type APIRequestContext } from "@playwright/test";

const PREMIUM_COOKIE_NAME = "starmap_premium";

type ErrorBody = {
  error?: string;
};

function randomIp() {
  const part = () => Math.floor(Math.random() * 220) + 10;
  return `${part()}.${part()}.${part()}.${part()}`;
}

function parseAllowedPrintCountries() {
  const raw =
    process.env.PRINT_ALLOWED_COUNTRIES ||
    process.env.NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES ||
    "US";
  const parsed = raw
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[A-Z]{2}$/.test(token));
  return parsed.length ? parsed : ["US"];
}

async function requestUntilReady(
  request: APIRequestContext,
  path: string,
  init: Parameters<APIRequestContext["fetch"]>[1] = {},
) {
  const startedAt = Date.now();
  let lastResponse: Awaited<ReturnType<APIRequestContext["fetch"]>> | null = null;
  let lastError: unknown = null;
  while (Date.now() - startedAt < 90_000) {
    const mergedHeaders = {
      "x-forwarded-for": randomIp(),
      ...(init.headers ?? {}),
    };
    try {
      const res = await request.fetch(path, {
        ...init,
        headers: mergedHeaders,
        failOnStatusCode: false,
      });
      lastResponse = res;
      lastError = null;
      if (res.status() !== 404) return res;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Route did not become ready: ${String(init.method ?? "GET")} ${path} (last status ${lastResponse?.status() ?? "none"}, last error ${lastError instanceof Error ? lastError.message : String(lastError ?? "none")})`,
  );
}

test.describe("API route regressions", () => {
  test.describe.configure({ timeout: 240_000 });

  test("funnel endpoint accepts valid steps and rejects invalid steps", async ({ request }) => {
    const validResponse = await requestUntilReady(request, "/api/analytics/funnel", {
      method: "POST",
      data: {
        step: "landing_view",
        source: "playwright_api_test",
      },
    });
    expect(validResponse.status()).toBe(200);
    expect((await validResponse.json()) as { ok?: boolean }).toEqual({ ok: true });

    const expiredResponse = await requestUntilReady(request, "/api/analytics/funnel", {
      method: "POST",
      data: {
        step: "checkout_expired",
        source: "playwright_api_test",
      },
    });
    expect(expiredResponse.status()).toBe(200);
    expect((await expiredResponse.json()) as { ok?: boolean }).toEqual({ ok: true });

    const invalidResponse = await requestUntilReady(request, "/api/analytics/funnel", {
      method: "POST",
      data: {
        step: "unknown_step",
      },
    });
    expect(invalidResponse.status()).toBe(400);
    expect((await invalidResponse.json()) as { ok?: boolean; error?: string }).toEqual({
      ok: false,
      error: "Invalid step",
    });
  });

  test("checkout diagnostics endpoint validates and accepts client-side blocker events", async ({ request }) => {
    const missingReason = await requestUntilReady(request, "/api/analytics/checkout-diagnostics", {
      method: "POST",
      data: {},
    });
    expect(missingReason.status()).toBe(400);
    expect((await missingReason.json()) as { ok?: boolean; error?: string }).toEqual({
      ok: false,
      error: "Missing reason",
    });

    const acceptedKnownReason = await requestUntilReady(request, "/api/analytics/checkout-diagnostics", {
      method: "POST",
      data: {
        reason: "missing_shipping_country",
        source: "playwright_api_test",
        plan: "poster_framed",
      },
    });
    expect(acceptedKnownReason.status()).toBe(200);
    expect((await acceptedKnownReason.json()) as { ok?: boolean }).toEqual({ ok: true });

    const acceptedUnknownReason = await requestUntilReady(request, "/api/analytics/checkout-diagnostics", {
      method: "POST",
      data: {
        reason: "this should normalize to fallback",
      },
    });
    expect(acceptedUnknownReason.status()).toBe(200);
    expect((await acceptedUnknownReason.json()) as { ok?: boolean }).toEqual({ ok: true });
  });

  test("stripe portal endpoint blocks missing or unknown entitlements", async ({ request }) => {
    const noCookieResponse = await requestUntilReady(request, "/api/stripe/portal", { method: "POST" });
    expect(noCookieResponse.status()).toBe(401);
    const noCookieBody = (await noCookieResponse.json()) as ErrorBody;
    expect(noCookieBody.error).toMatch(/missing entitlement/i);

    const unknownCookieResponse = await requestUntilReady(request, "/api/stripe/portal", {
      method: "POST",
      headers: {
        cookie: `${PREMIUM_COOKIE_NAME}=missing_session_for_test`,
      },
    });
    expect(unknownCookieResponse.status()).toBe(403);
    const unknownCookieBody = (await unknownCookieResponse.json()) as ErrorBody;
    expect(unknownCookieBody.error).toMatch(/no active entitlement/i);
  });

  test("referral endpoints block missing or unknown entitlements", async ({ request }) => {
    const noCookieStatus = await requestUntilReady(request, "/api/referrals/status");
    expect(noCookieStatus.status()).toBe(401);
    const noCookieStatusBody = (await noCookieStatus.json()) as ErrorBody;
    expect(noCookieStatusBody.error).toMatch(/missing entitlement/i);

    const noCookieLink = await requestUntilReady(request, "/api/referrals/link", { method: "POST" });
    expect(noCookieLink.status()).toBe(401);
    const noCookieLinkBody = (await noCookieLink.json()) as ErrorBody;
    expect(noCookieLinkBody.error).toMatch(/missing entitlement/i);

    const unknownStatus = await requestUntilReady(request, "/api/referrals/status", {
      headers: {
        cookie: `${PREMIUM_COOKIE_NAME}=missing_session_for_test`,
      },
    });
    expect(unknownStatus.status()).toBe(403);
    const unknownStatusBody = (await unknownStatus.json()) as ErrorBody;
    expect(unknownStatusBody.error).toMatch(/no active entitlement/i);
  });

  test("referral visit endpoint validates payload", async ({ request }) => {
    const invalidResponse = await request.post("/api/referrals/visit", {
      headers: { "x-forwarded-for": randomIp() },
      data: { code: "bad code!" },
    });
    expect(invalidResponse.status()).toBe(400);

    const missingRecordResponse = await request.post("/api/referrals/visit", {
      headers: { "x-forwarded-for": randomIp() },
      data: { code: "ABCD1234" },
    });
    expect(missingRecordResponse.status()).toBe(404);
  });

  test("referral attribution endpoint validates payload", async ({ request }) => {
    const invalidResponse = await request.post("/api/referrals/attribution", {
      headers: { "x-forwarded-for": randomIp() },
      data: { code: "bad code!" },
    });
    expect(invalidResponse.status()).toBe(400);

    const missingRecordResponse = await request.post("/api/referrals/attribution", {
      headers: { "x-forwarded-for": randomIp() },
      data: { code: "ABCD1234" },
    });
    expect(missingRecordResponse.status()).toBe(404);
  });

  test("print asset API validates payload and supports round-trip retrieval", async ({ request }) => {
    const invalidPayloadResponse = await requestUntilReady(request, "/api/print/assets", {
      method: "POST",
      data: {
        mapId: "not-a-map-id",
        dataUrl: "not-a-data-url",
      },
    });
    expect(invalidPayloadResponse.status()).toBe(400);

    // 1x1 transparent PNG data URL
    const tinyPngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9pP7qgAAAABJRU5ErkJggg==";

    const createResponse = await requestUntilReady(request, "/api/print/assets", {
      method: "POST",
      data: {
        dataUrl: tinyPngDataUrl,
        source: "editor",
      },
    });
    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()) as { ok?: boolean; assetId?: string; assetUrl?: string };
    expect(created.ok).toBe(true);
    expect(created.assetId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.assetUrl).toContain("/api/print/assets?id=");

    const queryFetch = await requestUntilReady(request, `/api/print/assets?id=${created.assetId}`);
    expect(queryFetch.status()).toBe(200);
    expect(queryFetch.headers()["content-type"]).toContain("image/png");
    const bytes = await queryFetch.body();
    expect(bytes.byteLength).toBeGreaterThan(20);

    const compatibilityRedirect = await requestUntilReady(request, `/api/print/assets/${created.assetId}`, {
      maxRedirects: 0,
    });
    expect(compatibilityRedirect.status()).toBe(307);
  });

  test("print checkout is gated off when print flag is disabled", async ({ request }) => {
    const response = await requestUntilReady(request, "/api/checkout", {
      method: "POST",
      data: {
        plan: "single",
        orderType: "print",
        printVariant: "poster_unframed",
        includeDigitalAddOn: false,
        printAssetId: "123e4567-e89b-42d3-a456-426614174000",
      },
    });
    expect(response.status()).toBe(503);
    const body = (await response.json()) as { code?: string; error?: string };
    expect(body.code).toBe("print_checkout_disabled");
    expect(body.error).toMatch(/print checkout/i);
  });

  test("print checkout rejects unsupported shipping countries when enabled", async ({ request }) => {
    const allowedCountries = new Set(parseAllowedPrintCountries());
    const candidateCountries = ["CA", "GB", "AU", "DE", "FR", "JP", "BR", "MX"];
    const unsupportedCountry = candidateCountries.find((country) => !allowedCountries.has(country)) ?? "ZZ";

    const response = await requestUntilReady(request, "/api/checkout", {
      method: "POST",
      data: {
        plan: "single",
        orderType: "print",
        printVariant: "poster_unframed",
        includeDigitalAddOn: false,
        printAssetId: "123e4567-e89b-42d3-a456-426614174000",
        shippingCountry: unsupportedCountry,
      },
    });

    const body = (await response.json()) as { code?: string; error?: string };
    if (response.status() === 503) {
      expect(body.code).toBe("print_checkout_disabled");
      return;
    }

    expect(response.status()).toBe(400);
    expect(body.code).toBe("print_shipping_country_invalid");
    expect(body.error).toMatch(/unsupported shipping country/i);
  });

  test("print admin endpoints require admin token", async ({ request }) => {
    const statusRes = await requestUntilReady(request, "/api/print/orders/status?session_id=test");
    expect(statusRes.status()).toBe(401);
    const statusBody = (await statusRes.json()) as { error?: string };
    expect(statusBody.error).toMatch(/unauthorized/i);

    const retryRes = await requestUntilReady(request, "/api/print/orders/retry", {
      method: "POST",
      data: { sessionId: "test" },
    });
    expect(retryRes.status()).toBe(401);
    const retryBody = (await retryRes.json()) as { error?: string };
    expect(retryBody.error).toMatch(/unauthorized/i);
  });

  test("funnel reconcile endpoint requires admin token", async ({ request }) => {
    const response = await requestUntilReady(request, "/api/analytics/funnel/reconcile", {
      method: "POST",
      data: { days: 14 },
    });
    expect(response.status()).toBe(401);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/unauthorized/i);
  });

  test("seasonal blog pages render without 5xx errors", async ({ request }) => {
    const seasonalSlugs = [
      "mothers-day-star-map-gift-ideas",
      "fathers-day-star-map-gift-ideas",
      "graduation-star-map-gift",
    ];

    for (const slug of seasonalSlugs) {
      const response = await request.get(`/blog/${slug}`, {
        headers: { "x-forwarded-for": randomIp() },
      });
      expect(response.status(), `Expected /blog/${slug} to render successfully`).toBe(200);
      const html = await response.text();
      expect(html).toContain("<h1");
    }
  });

});
