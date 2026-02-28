import { expect, test } from "@playwright/test";

const PREMIUM_COOKIE_NAME = "starmap_premium";

type ErrorBody = {
  error?: string;
};

function randomIp() {
  const part = () => Math.floor(Math.random() * 220) + 10;
  return `${part()}.${part()}.${part()}.${part()}`;
}

test.describe("API route regressions", () => {
  test("funnel endpoint accepts valid steps and rejects invalid steps", async ({ request }) => {
    const validResponse = await request.post("/api/analytics/funnel", {
      headers: { "x-forwarded-for": randomIp() },
      data: {
        step: "landing_view",
        source: "playwright_api_test",
      },
    });
    expect(validResponse.status()).toBe(200);
    expect((await validResponse.json()) as { ok?: boolean }).toEqual({ ok: true });

    const invalidResponse = await request.post("/api/analytics/funnel", {
      headers: { "x-forwarded-for": randomIp() },
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

  test("stripe portal endpoint blocks missing or unknown entitlements", async ({ request }) => {
    const noCookieResponse = await request.post("/api/stripe/portal", {
      headers: { "x-forwarded-for": randomIp() },
    });
    expect(noCookieResponse.status()).toBe(401);
    const noCookieBody = (await noCookieResponse.json()) as ErrorBody;
    expect(noCookieBody.error).toMatch(/missing entitlement/i);

    const unknownCookieResponse = await request.post("/api/stripe/portal", {
      headers: {
        "x-forwarded-for": randomIp(),
        cookie: `${PREMIUM_COOKIE_NAME}=missing_session_for_test`,
      },
    });
    expect(unknownCookieResponse.status()).toBe(403);
    const unknownCookieBody = (await unknownCookieResponse.json()) as ErrorBody;
    expect(unknownCookieBody.error).toMatch(/no active entitlement/i);
  });

  test("referral endpoints block missing or unknown entitlements", async ({ request }) => {
    const noCookieStatus = await request.get("/api/referrals/status", {
      headers: { "x-forwarded-for": randomIp() },
    });
    expect(noCookieStatus.status()).toBe(401);
    const noCookieStatusBody = (await noCookieStatus.json()) as ErrorBody;
    expect(noCookieStatusBody.error).toMatch(/missing entitlement/i);

    const noCookieLink = await request.post("/api/referrals/link", {
      headers: { "x-forwarded-for": randomIp() },
    });
    expect(noCookieLink.status()).toBe(401);
    const noCookieLinkBody = (await noCookieLink.json()) as ErrorBody;
    expect(noCookieLinkBody.error).toMatch(/missing entitlement/i);

    const unknownStatus = await request.get("/api/referrals/status", {
      headers: {
        "x-forwarded-for": randomIp(),
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
    const invalidPayloadResponse = await request.post("/api/print/assets", {
      headers: { "x-forwarded-for": randomIp() },
      data: {
        mapId: "not-a-map-id",
        dataUrl: "not-a-data-url",
      },
    });
    expect(invalidPayloadResponse.status()).toBe(400);

    // 1x1 transparent PNG data URL
    const tinyPngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9pP7qgAAAABJRU5ErkJggg==";

    const createResponse = await request.post("/api/print/assets", {
      headers: { "x-forwarded-for": randomIp() },
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

    const queryFetch = await request.get(`/api/print/assets?id=${created.assetId}`, {
      headers: { "x-forwarded-for": randomIp() },
    });
    expect(queryFetch.status()).toBe(200);
    expect(queryFetch.headers()["content-type"]).toContain("image/png");
    const bytes = await queryFetch.body();
    expect(bytes.byteLength).toBeGreaterThan(20);

    const compatibilityRedirect = await request.get(`/api/print/assets/${created.assetId}`, {
      headers: { "x-forwarded-for": randomIp() },
      maxRedirects: 0,
    });
    expect(compatibilityRedirect.status()).toBe(307);
  });

  test("print checkout is gated off when print flag is disabled", async ({ request }) => {
    const response = await request.post("/api/checkout", {
      headers: { "x-forwarded-for": randomIp() },
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

});
