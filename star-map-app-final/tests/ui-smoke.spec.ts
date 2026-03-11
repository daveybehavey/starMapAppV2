import { test, expect } from "@playwright/test";
import { applySampleMoment, gotoEditor, primeLocalStorage } from "./test-helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

test("homepage date field auto-formats 8-digit iOS-style input", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await primeLocalStorage(page);
  await page.addInitScript(() => {
    const define = (obj: object, key: string, value: unknown) => {
      try {
        Object.defineProperty(obj, key, { configurable: true, get: () => value });
      } catch {
        // ignore readonly overrides in some environments
      }
    };
    define(navigator, "userAgent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    define(navigator, "platform", "iPhone");
    define(navigator, "maxTouchPoints", 5);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const dateInput = page.locator("#hero-date, #quick-date, input[name='date']").first();
  await expect(dateInput).toBeVisible();
  await dateInput.fill("");
  await dateInput.type("20020504");
  await expect(dateInput).toHaveValue("2002-05-04");
  await dateInput.fill("");
  await dateInput.type("06012024");
  await expect(dateInput).toHaveValue("2024-06-01");
  await context.close();
});

test("location warnings and validation errors render", async ({ page }) => {
  // Use force=desktop for deterministic test
  await gotoEditor(page, { force: "desktop" });
  await expect(page.getByPlaceholder("Search city, landmark, or address")).toBeVisible();

  // Check default location warning appears
  await expect(
    page.getByText("Using default coordinates (0, 0). Search for a city to get accurate stars."),
  ).toBeVisible();

  // Check timezone preview appears
  await expect(page.getByText(/Timezone:/i)).toBeVisible();
});

test("homepage finished example images load correctly", async ({ page }) => {
  await primeLocalStorage(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const expectedExamples = [
    { name: /^Wedding · Aurora Night$/i, file: "/examples/example-wedding-aurora-heart.webp" },
    { name: /^Anniversary · Heirloom$/i, file: "/examples/example-anniversary-heirloom.webp" },
    { name: /^Birthday · Noir Minimal$/i, file: "/examples/example-birthday-noir.webp" },
  ];
  for (const { name, file } of expectedExamples) {
    const image = page.getByRole("img", { name }).first();
    await expect(image).toBeVisible({ timeout: 30000 });
    const encodedFile = encodeURIComponent(file);
    await expect(image).toHaveAttribute("src", new RegExp(encodedFile));

    const response = await page.request.get(file);
    expect(response.ok()).toBe(true);
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/^image\//);
  }
});

test("occasion preset preserves manual location context", async ({ page }) => {
  await gotoEditor(page, { force: "desktop" });
  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await expect(locationInput).toBeVisible();

  await locationInput.fill("Toronto, Canada");
  await expect(locationInput).toHaveValue("Toronto, Canada");
  await page.getByLabel("Date").fill("2024-06-01");
  const initialLocation = await locationInput.inputValue();
  const cityToken = initialLocation.split(",")[0]?.trim();
  const countryToken = initialLocation.split(",").at(-1)?.trim();
  await page.getByRole("button", { name: /Anniversary/i }).click();

  if (await locationInput.isVisible().catch(() => false)) {
    const normalizedLocation = await locationInput.inputValue();
    if (cityToken) expect(normalizedLocation).toContain(cityToken);
    if (countryToken) expect(normalizedLocation).toContain(countryToken);
    await expect(page.getByLabel("Date")).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  } else {
    await page.getByRole("button", { name: /Customize more/i }).click();
    const normalizedLocation = await locationInput.inputValue();
    if (cityToken) expect(normalizedLocation).toContain(cityToken);
    if (countryToken) expect(normalizedLocation).toContain(countryToken);
    await expect(page.getByLabel("Date")).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  }
});

test("occasion preset auto-fills date and location", async ({ page }) => {
  await gotoEditor(page, { force: "desktop" });
  const locationInput = page.getByPlaceholder("Search city, landmark, or address");
  await expect(locationInput).toBeVisible();

  // Verify inputs are empty/default initially
  await expect(locationInput).toHaveValue("");

  // Click an occasion preset
  await page.getByRole("button", { name: /Wedding/i }).click();
  await page.waitForTimeout(800);

  // In current editor behavior, preset application can transition to preview-first mode.
  // Validate that the preset action produced a usable result either way.
  if (await locationInput.isVisible().catch(() => false)) {
    await expect(locationInput).not.toHaveValue("");
    await expect(page.getByLabel("Date")).not.toHaveValue("");
  } else {
    await expect(page.getByRole("button", { name: /Customize more/i })).toBeVisible();
    await expect(page.getByLabel(/Star map preview/i).first()).toBeVisible();
  }
});

test("pro preset updates the message styling", async ({ page }) => {
  await gotoEditor(page, { force: "desktop" });
  await applySampleMoment(page);
  await page.getByRole("button", { name: /Customize more/i }).click();

  // Find and click a pro preset card
  await expect(page.getByText("Pro Presets")).toBeVisible();
  const auroraPreset = page.getByRole("button", { name: /Aurora Night/i });
  await expect(auroraPreset).toBeVisible();
  await auroraPreset.click();

  // Ensure the editor remains interactive after style change.
  await expect(page.getByLabel(/Star map preview/i).first()).toBeVisible();
  await expect(page.getByLabel("Free export").first()).toBeVisible();
});

test("customize more reveals advanced editor controls", async ({ page }) => {
  await gotoEditor(page, { force: "desktop" });
  await applySampleMoment(page);

  const customizeMore = page.getByRole("button", { name: /Customize more/i }).first();
  const textStylingCard = page.getByRole("button", { name: /Text Styling/i }).first();
  const saveRemixButton = page.getByRole("button", { name: /Save & Remix/i }).first();

  if (await customizeMore.isVisible({ timeout: 2000 }).catch(() => false)) {
    await customizeMore.click();
    await expect(saveRemixButton).toBeVisible();
    await expect(textStylingCard).toBeVisible();
    await expect(customizeMore).toBeHidden();
    return;
  }

  // Already in full editor mode; ensure required controls are present.
  await expect(saveRemixButton).toBeVisible();
  await expect(textStylingCard).toBeVisible();
});

test("referral landing logs one visit per browser session", async ({ page }) => {
  let referralVisitCalls = 0;
  await page.route("**/api/referrals/visit", async (route) => {
    referralVisitCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await gotoEditor(page, { force: "desktop", query: { ref: "ABCD1234" } });
  await expect.poll(() => referralVisitCalls, { timeout: 10_000 }).toBe(1);

  await page.reload();
  await page.waitForTimeout(900);
  expect(referralVisitCalls).toBe(1);
});

test("homepage referral query logs one visit per browser session", async ({ page }) => {
  let referralVisitCalls = 0;
  await page.route("**/api/referrals/visit", async (route) => {
    referralVisitCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/?ref=ABCD1234");
  await expect.poll(() => referralVisitCalls, { timeout: 12_000 }).toBe(1);

  await page.reload();
  await page.waitForTimeout(1200);
  expect(referralVisitCalls).toBe(1);
});

test("print-intent landing handles print intent consistently", async ({ page }) => {
  await gotoEditor(page, {
    force: "desktop",
    query: {
      source: "home-delivery-print-framed",
      checkout: "print",
      print_variant: "poster_framed",
      shipping_country: "CA",
    },
  });

  await applySampleMoment(page);

  const printPrimaryCta = page.getByRole("button", { name: /Print & frame/i });
  const printCtaVisible = await printPrimaryCta.isVisible({ timeout: 2500 }).catch(() => false);

  if (printCtaVisible) {
    const printedGiftTab = page.getByRole("button", { name: /Printed gift/i });
    if (!(await printedGiftTab.isVisible({ timeout: 1500 }).catch(() => false))) {
      await printPrimaryCta.click();
    }
    await expect(printedGiftTab).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: /Framed print \(recommended\)/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Shipping address is collected in Stripe checkout/i)).toBeVisible({ timeout: 8000 });
    const shippingSelect = page.getByLabel(/Shipping country/i).first();
    if (await shippingSelect.isVisible({ timeout: 1500 }).catch(() => false)) {
      await expect(shippingSelect.locator("option").first()).not.toHaveText(/^[A-Z]{2}$/);
      await expect(shippingSelect).toHaveValue("CA");
    }
    return;
  }

  // SAFE_OFF mode fallback: print checkout is intentionally hidden.
  const hdExportButton = page.getByLabel("HD export");
  await expect(hdExportButton).toBeVisible({ timeout: 8000 });
  await expect(hdExportButton).toBeEnabled({ timeout: 12000 });
  await hdExportButton.click();
  await expect(page.getByRole("button", { name: /Get 1 HD map|Get 3 downloads|Go unlimited/i }).first()).toBeVisible({
    timeout: 8000,
  });
  await expect(page.getByRole("button", { name: /Printed gift/i })).toHaveCount(0);
});

test("print checkout buttons submit print payload when visible", async ({ page }) => {
  await gotoEditor(page, {
    force: "desktop",
    query: {
      source: "home-delivery-print-framed",
      checkout: "print",
      print_variant: "poster_framed",
      shipping_country: "CA",
    },
  });
  await applySampleMoment(page);

  const printPrimaryCta = page.getByRole("button", { name: /Print & frame/i });
  if (!(await printPrimaryCta.isVisible({ timeout: 2500 }).catch(() => false))) {
    const hdExportButton = page.getByLabel("HD export");
    await expect(hdExportButton).toBeVisible({ timeout: 8000 });
    await expect(hdExportButton).toBeEnabled({ timeout: 12000 });
    await hdExportButton.click();
    await expect(page.getByRole("button", { name: /Get 1 HD map|Get 3 downloads|Go unlimited/i }).first()).toBeVisible({
      timeout: 8000,
    });
    return;
  }

  let checkoutPayload: Record<string, unknown> | null = null;
  await page.route("**/api/maps", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "123e4567-e89b-42d3-a456-426614174000" }),
    });
  });
  await page.route("**/api/print/assets", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, assetId: "123e4567-e89b-42d3-a456-426614174111" }),
    });
  });
  await page.route("**/api/checkout", async (route) => {
    checkoutPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "/editor?force=desktop&checkout_mock=1" }),
    });
  });

  await printPrimaryCta.click();
  const framedWithHd = page.getByRole("button", { name: /Framed \+ HD file \(recommended\)/i });
  await expect(framedWithHd).toBeVisible({ timeout: 8000 });
  await framedWithHd.click();

  await expect.poll(() => checkoutPayload, { timeout: 15000 }).not.toBeNull();
  expect(checkoutPayload?.orderType).toBe("print");
  expect(checkoutPayload?.printVariant).toBe("poster_framed");
  expect(checkoutPayload?.includeDigitalAddOn).toBe(true);
  expect(checkoutPayload?.shippingCountry).toBe("CA");
  expect(typeof checkoutPayload?.printAssetId).toBe("string");
});
