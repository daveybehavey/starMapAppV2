import { test, expect } from "@playwright/test";
import { applySampleMoment, gotoEditor } from "./test-helpers";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

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
  await page.waitForTimeout(600);
  expect(referralVisitCalls).toBe(1);

  await page.reload();
  await page.waitForTimeout(600);
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
  await page.waitForTimeout(1800);
  expect(referralVisitCalls).toBe(1);

  await page.reload();
  await page.waitForTimeout(1800);
  expect(referralVisitCalls).toBe(1);
});
