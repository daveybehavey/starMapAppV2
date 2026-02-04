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

});
