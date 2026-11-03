import { expect, test } from "@playwright/test";
import { gotoEditor, mockGeocode, applySampleMoment } from "./test-helpers";
import { proPresets } from "../src/lib/proPresets";
import { mkdirSync } from "node:fs";
const preset = proPresets.find((p) => p.style === "evergreenAtlas")!;
const proofDir = "../docs/proofs/514-evergreen-atlas";
test("Evergreen Atlas saves and reopens with automatic bindings and no authored layout version", async ({
  request,
}) => {
  const payload = {
    version: 1,
    seed: "default",
    datetimeISO: "2026-11-04T05:00:00Z",
    location: { name: "Victoria", latitude: 48.4284, longitude: -123.3656, timezone: "America/Vancouver" },
    selectedStyle: preset.style,
    shape: preset.shape,
    aspectRatio: preset.aspectRatio,
    renderOptions: preset.renderOptions,
    textBoxes: preset.textBoxes,
  };
  const saved = await request.post("/api/maps", { data: payload });
  expect(saved.status()).toBe(200);
  const { id } = await saved.json();
  const reopened = await request.get(`/api/maps?id=${id}`);
  expect(reopened.status()).toBe(200);
  expect(await reopened.json()).toEqual(payload);
});
for (const force of ["desktop", "mobile"] as const)
  test(`Evergreen Atlas free keyboard selector ${force}`, async ({ page }) => {
    test.setTimeout(120000);
    mkdirSync(proofDir, { recursive: true });
    await page.setViewportSize({ width: force === "desktop" ? 1440 : 390, height: 1000 });
    await mockGeocode(page);
    await gotoEditor(page, { force });
    const presets = page
      .getByRole("heading", { name: "Pro Presets", exact: true })
      .first()
      .locator("xpath=ancestor::section[1]");
    await presets.getByRole("button", { name: "Show", exact: true }).click();
    await presets
      .getByRole("button")
      .filter({ has: page.getByRole("img", { name: "Evergreen Atlas", exact: true }) })
      .click();
    const applied = await page.evaluate(() => {
      const state = (
        window as unknown as {
          __ZUSTAND_STORE__: {
            getState: () => {
              selectedStyle: string;
              textBoxes: { fontFamily: string; textStyleBinding: unknown; position: unknown }[];
            };
          };
        }
      ).__ZUSTAND_STORE__.getState();
      return {
        style: state.selectedStyle,
        rows: state.textBoxes.map(({ fontFamily, textStyleBinding, position }) => ({
          fontFamily,
          textStyleBinding,
          position,
        })),
      };
    });
    expect(applied.style).toBe("evergreenAtlas");
    expect(applied.rows).toEqual(
      preset.textBoxes.map(({ fontFamily, textStyleBinding, position }) => ({
        fontFamily,
        textStyleBinding,
        position,
      }))
    );
    await page.screenshot({ path: `${proofDir}/preset-${force}.png`, fullPage: true });
    await applySampleMoment(page);
    const customize = page.getByRole("button", { name: /Customize more/i });
    if (await customize.isVisible()) await customize.click();
    const style = page.getByRole("button", { name: /^Style.*Show$/i });
    if (await style.isVisible()) await style.click();
    const evergreen = page.getByRole("button", { name: /Evergreen Atlas/ }).first();
    await expect(evergreen).toBeVisible({ timeout: 30000 });
    await evergreen.focus();
    await expect(evergreen).toBeFocused();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { __ZUSTAND_STORE__: { getState: () => { selectedStyle: string } } }
            ).__ZUSTAND_STORE__.getState().selectedStyle
        )
      )
      .toBe("evergreenAtlas");
    await page.screenshot({ path: `${proofDir}/selector-${force}.png`, fullPage: true });
  });
