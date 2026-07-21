import { expect, test } from "@playwright/test";
import {
  dismissOverlays,
  mockGeocode,
  primeLocalStorage,
  waitForEditor,
  waitForMapCanvasReady,
  waitForPreview,
} from "./test-helpers";

test("customer creates and customizes a visible preview from the homepage", async ({ page }) => {
  test.setTimeout(90_000);

  await primeLocalStorage(page);
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (
      !["http:", "https:"].includes(requestUrl.protocol) ||
      requestUrl.origin === "http://127.0.0.1:3004"
    ) {
      await route.continue();
      return;
    }

    await route.fulfill({ status: 204 });
  });
  await mockGeocode(page);

  let checkoutRequestCount = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/checkout") {
      checkoutRequestCount += 1;
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissOverlays(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The night you became everything.");

  const heroForm = page.locator("form[action='/editor']").first();
  const heroDate = heroForm.locator("input[name='date']");
  const heroLocation = heroForm.locator("input[name='location']");
  await heroDate.fill("2024-06-01");
  await heroLocation.fill("Paris, France");
  await expect(heroDate).toHaveValue("2024-06-01");
  await expect(heroLocation).toHaveValue("Paris, France");

  await heroForm.getByRole("button", { name: /Preview your map/i }).click();
  await page.waitForURL("**/editor**", { timeout: 30_000 });
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/editor" &&
      url.searchParams.get("mode") === "quick" &&
      url.searchParams.get("date") === "2024-06-01" &&
      url.searchParams.get("location") === "Paris, France"
    );
  });
  await waitForEditor(page);
  await dismissOverlays(page);

  await page.getByRole("button", { name: /Customize more/i }).click();
  const geocodeResponsePromise = page.waitForResponse((response) => {
    const responseUrl = new URL(response.url());
    return responseUrl.pathname === "/api/geocode" && responseUrl.searchParams.get("q") === "Paris";
  });
  const locationSearch = page
    .getByRole("combobox", { name: /Location search/i })
    .or(page.getByRole("combobox", { name: /Search city, landmark, or address/i }))
    .first();
  await locationSearch.fill("Paris");
  const geocodeResponse = await geocodeResponsePromise;
  expect(geocodeResponse.ok()).toBe(true);
  expect(await geocodeResponse.json()).toEqual([
    {
      id: 1,
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    },
  ]);
  const parisOption = page.getByRole("option", { name: /Paris, France/ });
  await expect(parisOption).toBeVisible();
  await parisOption.click();
  await expect(locationSearch).toHaveValue("Paris, France");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = (
          window as unknown as {
            __ZUSTAND_STORE__?: {
              getState: () => {
                location: {
                  name: string;
                  latitude: number;
                  longitude: number;
                  timezone: string;
                };
              };
            };
          }
        ).__ZUSTAND_STORE__;
        if (!store) throw new Error("Missing __ZUSTAND_STORE__");
        return store.getState().location;
      }),
    )
    .toEqual({
      name: "Paris, France",
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: "Europe/Paris",
    });

  await waitForPreview(page);
  const preview = await waitForMapCanvasReady(page);
  const canvas = preview.locator("canvas").last();
  const readCanvasSignature = () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext("2d");
      if (!context || element.width === 0 || element.height === 0) {
        return "not-rendered";
      }

      const pixels = context.getImageData(0, 0, element.width, element.height).data;
      const stride = Math.max(1, Math.floor(pixels.length / 4096));
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += stride) {
        hash ^= pixels[index] ?? 0;
        hash = Math.imul(hash, 16777619);
      }
      return `${element.width}x${element.height}:${hash >>> 0}`;
    });
  const initialCanvasSignature = await readCanvasSignature();
  expect(initialCanvasSignature).not.toBe("not-rendered");

  await page.getByRole("heading", { name: "Style", exact: true }).locator("..").click();
  const vintageStyle = page.getByRole("button", { name: /^Vintage Engraving/ });
  await expect(vintageStyle).toBeVisible();
  await vintageStyle.click();

  await expect(page.locator("#preview").getByText("Vintage Engraving", { exact: true })).toBeVisible();
  await expect.poll(readCanvasSignature, { timeout: 20_000 }).not.toBe(initialCanvasSignature);
  expect(checkoutRequestCount).toBe(0);
});
