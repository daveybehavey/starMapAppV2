import { expect, test } from "@playwright/test";
import { applySampleMoment, gotoEditor } from "./test-helpers";

test.describe("Worker fallback", () => {
  test("preview renders when Web Worker is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      // Force the no-worker code path so preview must render via main-thread compute.
      (window as Window & { Worker?: typeof Worker }).Worker = undefined;
    });

    await gotoEditor(page, { force: "desktop" });
    await applySampleMoment(page);

    const preview = page.getByLabel(/Star map preview/i).first();
    await expect(preview).toBeVisible({ timeout: 20000 });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Rendering stars...")).toHaveCount(0);
  });

  test("preview renders when Web Worker errors at runtime", async ({ page }) => {
    await page.addInitScript(() => {
      class FailingWorker {
        onmessage: ((this: Worker, ev: MessageEvent<unknown>) => unknown) | null = null;
        onerror: ((this: AbstractWorker, ev: Event) => unknown) | null = null;

        constructor() {}

        postMessage() {
          setTimeout(() => {
            this.onerror?.(new Event("error"));
          }, 0);
        }

        terminate() {}
      }

      window.Worker = FailingWorker as unknown as typeof Worker;
    });

    await gotoEditor(page, { force: "desktop" });
    await applySampleMoment(page);

    const preview = page.getByLabel(/Star map preview/i).first();
    await expect(preview).toBeVisible({ timeout: 20000 });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Rendering stars...")).toHaveCount(0);
  });
});
