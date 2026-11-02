import { expect, test } from "@playwright/test";
import { applySampleMoment, gotoEditor, waitForMapCanvasReady } from "./test-helpers";

test("Bortle slider changes sky darkness and returns exactly to the default", async ({ page }, testInfo) => {
  await gotoEditor(page, { path: "/editor", force: "desktop" });
  await applySampleMoment(page);
  const preview = await waitForMapCanvasReady(page);
  const customize = page.getByRole("button", { name: /Customize more/i }).first();
  if (await customize.isVisible()) await customize.click();
  const advanced = page.getByRole("button", { name: /^Advanced(?:\s|$)/ }).first();
  if ((await advanced.getAttribute("aria-expanded")) !== "true") await advanced.click();
  const slider = page.getByRole("slider", { name: /Sky darkness \(Bortle class\)/ }).first();
  await expect(slider).toHaveValue("4.5");
  const canvas = preview.locator("canvas").first();
  const pixels = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
    let sum = 0;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 16777619);
      if (i % 4 !== 3) sum += data[i];
    }
    return { hash: hash >>> 0, brightness: sum / (data.length * 0.75) };
  });
  // The renderer is deterministic; wait until each update has settled.
  const settle = async () => {
    let previous = -1;
    let matches = 0;
    await expect.poll(async () => {
      const { hash } = await pixels();
      matches = hash === previous ? matches + 1 : 0;
      previous = hash;
      return matches;
    }, { intervals: [250], timeout: 15000 }).toBeGreaterThanOrEqual(3);
    return pixels();
  };
  const baseline = await settle();
  await testInfo.attach("bortle-4.5", { body: await canvas.screenshot(), contentType: "image/png" });
  for (const value of [1, 9, 4.5]) {
    await slider.focus();
    await slider.press("Home");
    for (let step = 0; step < (value - 1) * 2; step++) await slider.press("ArrowRight");
    await expect(slider).toHaveValue(String(value));
    if (value !== 4.5) await expect.poll(async () => (await pixels()).hash).not.toBe(baseline.hash);
    else await expect.poll(async () => (await pixels()).hash).toBe(baseline.hash);
    const current = await settle();
    if (value === 1) expect(current.brightness).toBeLessThan(baseline.brightness - 1);
    if (value === 9) expect(current.brightness).toBeGreaterThan(baseline.brightness + 10);
    await testInfo.attach(`bortle-${value}`, { body: await canvas.screenshot(), contentType: "image/png" });
  }
});
