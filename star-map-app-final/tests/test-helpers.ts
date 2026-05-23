import { expect, type Page } from "@playwright/test";
import type { MapLookTier } from "../src/lib/mapLookTiers";
import { buildMapLookSnapshotState } from "../src/lib/mapLookTiers";
import type { StyleId } from "../src/lib/store";

const overlaySelectors = [
  'button[aria-label="Close"]',
  'button:has-text("Close")',
  'button:has-text("Accept")',
  'button:has-text("Maybe later")',
];

export const primeLocalStorage = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
  });
};

export const dismissOverlays = async (page: Page) => {
  await page.waitForTimeout(250);
  for (const selector of overlaySelectors) {
    const buttons = page.locator(selector);
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      try {
        await buttons.nth(i).click({ timeout: 1000 });
      } catch {
        // Ignore if button is not clickable
      }
    }
  }
};

export const mockGeocode = async (page: Page) => {
  await page.route("**/api/geocode**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get("q")?.toLowerCase() ?? "";
    if (query.includes("paris")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            name: "Paris, France",
            latitude: 48.8566,
            longitude: 2.3522,
            timezone: "Europe/Paris",
          },
        ]),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
};

export const waitForEditor = async (page: Page, isDesktop?: boolean) => {
  const editor = page.locator("#editor");
  await editor.waitFor({ state: "attached", timeout: 60000 });
  await expect(editor).toBeVisible({ timeout: 60000 });
  if (typeof isDesktop === "boolean") {
    await expect(editor).toHaveAttribute("data-is-desktop", String(isDesktop));
  }
  await expect(editor).not.toContainText(/Loading editor/i);
};

export const gotoEditor = async (
  page: Page,
  options: {
    path?: string;
    force?: "desktop" | "mobile";
    query?: Record<string, string | undefined>;
  } = {},
) => {
  const { path = "/editor", force = "desktop", query } = options;
  await primeLocalStorage(page);
  const search = new URLSearchParams({ force });
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (!value) continue;
      search.set(key, value);
    }
  }
  await page.goto(`${path}?${search.toString()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitForEditor(page, force === "desktop");
  await dismissOverlays(page);
};

export const waitForPreview = async (page: Page) => {
  const labeledPreview = page.getByLabel(/Star map preview/i).first();
  if (await labeledPreview.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(labeledPreview).toBeVisible({ timeout: 20000 });
  } else {
    // Some intermediate editor states don't expose the preview aria-label consistently.
    await expect(page.getByRole("heading", { name: /Preview/i }).first()).toBeVisible({ timeout: 20000 });
  }
  await expect(page.getByLabel("Free export").first()).toBeVisible({ timeout: 20000 });
};

export const applySampleMoment = async (page: Page) => {
  await dismissOverlays(page);

  // Newer homepage/editor states can already have a rendered preview ready.
  const freeExportButton = page.getByLabel("Free export").first();
  if (await freeExportButton.isVisible({ timeout: 2500 }).catch(() => false)) {
    await waitForPreview(page);
    return;
  }

  const sampleButton = page
    .getByRole("button", { name: /Try a sample moment|Try sample moment|Use sample moment/i })
    .first();
  if (await sampleButton.isVisible({ timeout: 6000 }).catch(() => false)) {
    await sampleButton.scrollIntoViewIfNeeded();
    try {
      await sampleButton.click({ timeout: 5000, noWaitAfter: true });
    } catch {
      // Fallback for animated/transitioning layouts in CI where Playwright actionability can be too strict.
      await sampleButton.click({ force: true, noWaitAfter: true });
    }
    await waitForPreview(page);
    return;
  }

  // Fallback when sample CTA is removed/hidden but preview can still be generated.
  const generateButton = page.getByRole("button", { name: /Generate preview|Preview your map/i }).first();
  if (await generateButton.isVisible({ timeout: 4000 }).catch(() => false)) {
    await generateButton.click({ timeout: 5000 }).catch(() => undefined);
  }
  await waitForPreview(page);
};

export async function applyMapLookSnapshotState(
  page: Page,
  tier: Exclude<MapLookTier, "custom">,
  styleId: StyleId,
) {
  const snapshot = buildMapLookSnapshotState(tier, styleId);
  await page.evaluate((state) => {
    const store = (window as unknown as {
      __ZUSTAND_STORE__?: {
        getState: () => {
          setDateTime: (value: string) => void;
          setLocation: (value: typeof state.location) => void;
          setStyle: (value: typeof state.selectedStyle) => void;
          setRenderOptions: (value: typeof state.renderOptions) => void;
          setTextBoxes: (value: typeof state.textBoxes) => void;
          setRevealed: (value: boolean) => void;
          setPreviewFidelity: (value: "standard" | "high") => void;
          setAspectRatio: (value: typeof state.aspectRatio) => void;
          setShape: (value: typeof state.shape) => void;
        };
      };
    }).__ZUSTAND_STORE__;
    if (!store) throw new Error("Missing __ZUSTAND_STORE__");
    const api = store.getState();
    api.setDateTime(state.dateTime);
    api.setLocation(state.location);
    api.setStyle(state.selectedStyle);
    api.setRenderOptions(state.renderOptions);
    api.setTextBoxes(state.textBoxes);
    api.setRevealed(state.revealed);
    api.setPreviewFidelity(state.previewFidelity);
    api.setAspectRatio(state.aspectRatio);
    api.setShape(state.shape);
  }, snapshot);
  await page.waitForTimeout(1200);
};

export const waitForMapCanvasReady = async (page: Page) => {
  const preview = page.getByLabel(/Star map preview/i).first();
  await expect(preview).toBeVisible({ timeout: 30000 });
  const canvas = preview.locator("canvas").last();
  await expect(canvas).toHaveClass(/opacity-100/, { timeout: 30000 });
  await page.waitForTimeout(400);
  return preview;
};
