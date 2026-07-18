import { expect, test, type Page } from "@playwright/test";
import { dismissOverlays, waitForEditor } from "./test-helpers";

type DraftTestState = {
  dateTime: string;
  location: { name: string; latitude: number; longitude: number; timezone: string };
  textBoxes: Array<{
    id: string;
    label: string;
    text: string;
    fontFamily: string;
    color: string;
    size: number;
    align: string;
    textShadow: boolean;
    textGlow: boolean;
    position?: { x: number; y: number };
  }>;
  selectedStyle: string;
  aspectRatio: string;
  shape: string;
  renderOptions: Record<string, unknown>;
  setDateTime: (value: string) => void;
  setLocation: (value: DraftTestState["location"]) => void;
  setTextBoxes: (value: DraftTestState["textBoxes"]) => void;
  setStyle: (value: string) => void;
  setAspectRatio: (value: string) => void;
  setShape: (value: string) => void;
  setRenderOptions: (value: Record<string, unknown>) => void;
};

type DraftTestStore = { getState: () => DraftTestState };

const persistedState = {
  dateTime: "2024-06-15T20:30:00.000Z",
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
      text: "Our persisted night",
      fontFamily: "cinzel",
      color: "#d7b56c",
      size: 52,
      align: "center",
      textShadow: false,
      textGlow: false,
      position: { x: 0.45, y: 0.15 },
    },
    {
      id: "subtitle",
      label: "Subtitle",
      text: "Paris, June 2024",
      fontFamily: "raleway",
      color: "#c8a662",
      size: 30,
      align: "right",
      textShadow: false,
      textGlow: false,
      position: { x: 0.55, y: 0.22 },
    },
  ],
  selectedStyle: "midnightMinimal",
  aspectRatio: "4:5",
  shape: "diamond",
  renderOptions: {
    mapLookTier: "custom",
    showGrid: true,
    showMoon: false,
    frameEnabled: false,
    constellationColor: "#abcdef",
    constellationLineScale: 1.4,
  },
} as const;

async function seedDraftOnLoad(page: Page, raw: string) {
  await page.addInitScript((draft) => {
    localStorage.clear();
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
    localStorage.setItem("star-map-draft", draft);
  }, raw);
}

async function openCleanEditor(page: Page, force: "desktop" | "mobile") {
  await page.goto(`/editor?force=${force}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditor(page, force === "desktop");
  await dismissOverlays(page);
}

async function getDraftStore(page: Page): Promise<DraftTestStore> {
  const available = await page.evaluate(() =>
    Boolean((window as unknown as { __ZUSTAND_STORE__?: unknown }).__ZUSTAND_STORE__)
  );
  expect(available).toBe(true);
  return {} as DraftTestStore;
}

async function applyPersistedState(page: Page) {
  await getDraftStore(page);
  await page.evaluate((next) => {
    const store = (window as unknown as { __ZUSTAND_STORE__: DraftTestStore }).__ZUSTAND_STORE__;
    const state = store.getState();
    state.setDateTime(next.dateTime);
    state.setLocation(next.location);
    state.setTextBoxes(next.textBoxes);
    state.setStyle(next.selectedStyle);
    state.setAspectRatio(next.aspectRatio);
    state.setShape(next.shape);
    state.setRenderOptions(next.renderOptions);
  }, persistedState);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("star-map-draft");
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as {
            schemaVersion?: number;
            savedAt?: string;
            textBoxes?: Array<{ text?: string }>;
          };
          return {
            schemaVersion: parsed.schemaVersion,
            hasSavedAt: Boolean(parsed.savedAt),
            title: parsed.textBoxes?.[0]?.text,
          };
        } catch {
          return null;
        }
      })
    )
    .toEqual({ schemaVersion: 1, hasSavedAt: true, title: persistedState.textBoxes[0].text });
}

async function expectPersistedState(page: Page, isDesktop: boolean) {
  await waitForEditor(page, isDesktop);
  await getDraftStore(page);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = (
          window as unknown as { __ZUSTAND_STORE__: DraftTestStore }
        ).__ZUSTAND_STORE__.getState();
        return {
          dateTime: state.dateTime,
          location: state.location,
          textBoxes: state.textBoxes,
          selectedStyle: state.selectedStyle,
          aspectRatio: state.aspectRatio,
          shape: state.shape,
          renderOptions: {
            mapLookTier: state.renderOptions.mapLookTier,
            showGrid: state.renderOptions.showGrid,
            showMoon: state.renderOptions.showMoon,
            frameEnabled: state.renderOptions.frameEnabled,
            constellationColor: state.renderOptions.constellationColor,
            constellationLineScale: state.renderOptions.constellationLineScale,
          },
        };
      })
    )
    .toEqual(persistedState);
}

for (const force of ["desktop", "mobile"] as const) {
  test(`${force} editor restores all major draft fields after refresh`, async ({ page }) => {
    test.setTimeout(90_000);
    if (force === "mobile") {
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await openCleanEditor(page, force);
    await applyPersistedState(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectPersistedState(page, force === "desktop");
  });
}

test("valid legacy draft restores and is migrated to the versioned envelope", async ({ page }) => {
  const legacy = {
    version: 1,
    seed: "legacy-test",
    datetimeISO: persistedState.dateTime,
    location: persistedState.location,
    textBoxes: persistedState.textBoxes,
    selectedStyle: persistedState.selectedStyle,
    aspectRatio: persistedState.aspectRatio,
    renderOptions: { ...persistedState.renderOptions, shapeMask: "diamond" },
  };
  await seedDraftOnLoad(page, JSON.stringify(legacy));

  await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded" });
  await waitForEditor(page, true);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("star-map-draft");
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
          schemaVersion?: number;
          savedAt?: string;
          shape?: string;
          textBoxes?: Array<{ text?: string }>;
        };
        return {
          schemaVersion: parsed.schemaVersion,
          hasSavedAt: Boolean(parsed.savedAt),
          shape: parsed.shape,
          title: parsed.textBoxes?.[0]?.text,
        };
      })
    )
    .toEqual({
      schemaVersion: 1,
      hasSavedAt: true,
      shape: "diamond",
      title: persistedState.textBoxes[0].text,
    });
  await expectPersistedState(page, true);
});

test("corrupt local storage leaves a usable editor with default state", async ({ page }) => {
  const corruptRaw = '{"datetimeISO":';
  await seedDraftOnLoad(page, corruptRaw);

  await page.goto("/editor?force=mobile", { waitUntil: "domcontentloaded" });
  await waitForEditor(page, false);
  await getDraftStore(page);

  const state = await page.evaluate(() => {
    const current = (window as unknown as { __ZUSTAND_STORE__: DraftTestStore }).__ZUSTAND_STORE__.getState();
    return {
      locationName: current.location.name,
      title: current.textBoxes.find((box) => box.id === "title")?.text,
      shape: current.shape,
    };
  });
  expect(state).toEqual({ locationName: "", title: "Our Night Sky", shape: "rectangle" });
  await expect(page.locator("#editor")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem("star-map-draft"))).toBe(corruptRaw);
});

test("an impossible datetime rejects the entire draft without partial restoration", async ({ page }) => {
  const invalidDraft = JSON.stringify({
    version: 1,
    seed: "invalid-date-test",
    datetimeISO: "2024-02-31T20:30:00.000Z",
    location: persistedState.location,
    textBoxes: persistedState.textBoxes,
    selectedStyle: persistedState.selectedStyle,
    aspectRatio: persistedState.aspectRatio,
    shape: persistedState.shape,
    renderOptions: persistedState.renderOptions,
    selectedOccasion: "anniversary",
    schemaVersion: 1,
    savedAt: "2026-07-17T18:00:00.000Z",
  });
  await seedDraftOnLoad(page, invalidDraft);

  await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded" });
  await waitForEditor(page, true);
  await getDraftStore(page);

  const state = await page.evaluate(() => {
    const current = (window as unknown as { __ZUSTAND_STORE__: DraftTestStore }).__ZUSTAND_STORE__.getState();
    return {
      restoredInvalidDate: current.dateTime === "2024-02-31T20:30:00.000Z",
      locationName: current.location.name,
      title: current.textBoxes.find((box) => box.id === "title")?.text,
      selectedStyle: current.selectedStyle,
      aspectRatio: current.aspectRatio,
      shape: current.shape,
    };
  });
  expect(state).toEqual({
    restoredInvalidDate: false,
    locationName: "",
    title: "Our Night Sky",
    selectedStyle: "navyGold",
    aspectRatio: "square",
    shape: "rectangle",
  });
  await expect(page.locator("#editor")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem("star-map-draft"))).toBe(invalidDraft);
});

for (const invalidCase of [
  { name: "empty-string corruption", raw: "" },
  {
    name: "unsupported schema version",
    raw: JSON.stringify({
      ...persistedState,
      version: 1,
      seed: "future-version-test",
      datetimeISO: persistedState.dateTime,
      schemaVersion: 999,
      savedAt: "2026-07-17T18:00:00.000Z",
    }),
  },
]) {
  test(`${invalidCase.name} is preserved without an automatic default overwrite`, async ({ page }) => {
    await seedDraftOnLoad(page, invalidCase.raw);
    await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded" });
    await waitForEditor(page, true);
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => localStorage.getItem("star-map-draft"))).toBe(invalidCase.raw);
  });
}

test("an intentional editor change replaces a preserved invalid draft", async ({ page }) => {
  const corruptRaw = '{"datetimeISO":';
  await seedDraftOnLoad(page, corruptRaw);
  await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded" });
  await waitForEditor(page, true);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem("star-map-draft"))).toBe(corruptRaw);

  const dateInput = page.locator("#star-date");
  await expect(dateInput).toBeVisible();
  const nextDate = (await dateInput.inputValue()) === "2024-01-02" ? "2024-01-03" : "2024-01-02";
  await dateInput.fill(nextDate);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("star-map-draft");
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as { schemaVersion?: number; datetimeISO?: string };
          return {
            schemaVersion: parsed.schemaVersion,
            date: parsed.datetimeISO?.slice(0, 10),
          };
        } catch {
          return null;
        }
      })
    )
    .toEqual({ schemaVersion: 1, date: nextDate });
});
