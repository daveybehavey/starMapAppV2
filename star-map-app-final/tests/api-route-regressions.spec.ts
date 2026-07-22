import {
  expect,
  test,
  type APIRequestContext,
  type TestInfo,
} from "@playwright/test";

const TEST_ORIGIN = "http://127.0.0.1:3004";
const MAP_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LocalApiPath = `/api/maps${string}` | `/api/checkout${string}`;

function isolatedTestIp(testInfo: TestInfo) {
  let hash = process.pid + testInfo.retry + testInfo.workerIndex;
  for (const character of testInfo.testId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `192.0.2.${(hash % 254) + 1}`;
}

function assertLocalApiPath(baseURL: string, path: string): asserts path is LocalApiPath {
  const baseOrigin = new URL(baseURL).origin;
  const target = new URL(path, baseURL);
  const isCoveredRoute = target.pathname === "/api/maps" || target.pathname === "/api/checkout";

  if (target.origin !== baseOrigin || !isCoveredRoute) {
    throw new Error(`External network access blocked for API regression test: ${target.href}`);
  }
}

async function fetchLocalApi(
  request: APIRequestContext,
  baseURL: string,
  path: string,
  testInfo: TestInfo,
  options: Parameters<APIRequestContext["fetch"]>[1] = {},
) {
  assertLocalApiPath(baseURL, path);
  const target = new URL(path, baseURL);

  return request.fetch(`${target.pathname}${target.search}`, {
    ...options,
    failOnStatusCode: false,
    headers: {
      "x-forwarded-for": isolatedTestIp(testInfo),
      ...options.headers,
    },
  });
}

const validMapRecipe = {
  version: 1,
  seed: "api-route-contract",
  datetimeISO: "2024-06-15T12:00:00.000Z",
  location: {
    name: "Paris, France",
    latitude: 48.8566,
    longitude: 2.3522,
    timezone: "Europe/Paris",
  },
  textBoxes: [
    {
      id: "title",
      label: "Title",
      text: "Our Paris Night",
      fontFamily: "playfair",
      size: 42,
      align: "center",
      position: { x: 0.5, y: 0.2 },
    },
  ],
  selectedStyle: "navyGold",
  aspectRatio: "square",
  shape: "circle",
  renderOptions: {
    constellationLines: true,
    showPlanets: false,
  },
};

test.describe("API route regressions", () => {
  test("map save rejects malformed JSON with the stable validation response", async ({
    request,
    baseURL,
  }, testInfo) => {
    const response = await fetchLocalApi(request, baseURL ?? TEST_ORIGIN, "/api/maps", testInfo, {
      method: "POST",
      headers: { "content-type": "application/json" },
      data: "{",
    });

    expect(response.status()).toBe(400);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
  });

  test("map save rejects out-of-range coordinates before persistence", async ({
    request,
    baseURL,
  }, testInfo) => {
    const response = await fetchLocalApi(request, baseURL ?? TEST_ORIGIN, "/api/maps", testInfo, {
      method: "POST",
      data: {
        ...validMapRecipe,
        location: {
          ...validMapRecipe.location,
          latitude: 91,
        },
      },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid coordinates" });
  });

  test("map save returns an id that retrieves the stored recipe response shape", async ({
    request,
    baseURL,
  }, testInfo) => {
    const saveResponse = await fetchLocalApi(request, baseURL ?? TEST_ORIGIN, "/api/maps", testInfo, {
      method: "POST",
      data: validMapRecipe,
    });

    expect(saveResponse.status()).toBe(200);
    expect(saveResponse.headers()["content-type"]).toContain("application/json");
    const saveBody = (await saveResponse.json()) as { id?: unknown };
    expect(Object.keys(saveBody)).toEqual(["id"]);
    expect(saveBody.id).toEqual(expect.any(String));
    expect(saveBody.id).toMatch(MAP_ID_PATTERN);

    const loadResponse = await fetchLocalApi(
      request,
      baseURL ?? TEST_ORIGIN,
      `/api/maps?id=${saveBody.id}`,
      testInfo,
    );

    expect(loadResponse.status()).toBe(200);
    expect(loadResponse.headers()["cache-control"]).toContain("public");
    expect(await loadResponse.json()).toEqual(validMapRecipe);
  });

  test("checkout rejects a missing map handoff with the stable error shape", async ({
    request,
    baseURL,
  }, testInfo) => {
    const response = await fetchLocalApi(
      request,
      baseURL ?? TEST_ORIGIN,
      "/api/checkout",
      testInfo,
      {
        method: "POST",
        data: { plan: "single", orderType: "digital" },
      },
    );

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({
      error: "Create your map preview before starting checkout.",
      code: "map_required",
    });
  });

  test("checkout rejects an unknown saved map with deterministic failure handling", async ({
    request,
    baseURL,
  }, testInfo) => {
    const response = await fetchLocalApi(
      request,
      baseURL ?? TEST_ORIGIN,
      "/api/checkout",
      testInfo,
      {
        method: "POST",
        data: {
          plan: "single",
          orderType: "digital",
          mapId: "00000000-0000-4000-8000-000000000147",
        },
      },
    );

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({
      error: "We couldn't find that map. Open the editor, generate your preview, then retry checkout.",
      code: "map_not_found",
    });
  });

  test("network guard blocks production and external API targets before dispatch", async () => {
    expect(() => assertLocalApiPath(TEST_ORIGIN, "https://starmapco.com/api/maps")).toThrow(
      "External network access blocked",
    );
    expect(() => assertLocalApiPath(TEST_ORIGIN, "https://api.stripe.com/v1/checkout/sessions")).toThrow(
      "External network access blocked",
    );
    expect(() => assertLocalApiPath(TEST_ORIGIN, "/api/printful")).toThrow(
      "External network access blocked",
    );
  });
});
