import { expect, test } from "@playwright/test";
import { stableMapRecipeFingerprint } from "../src/lib/mapRecipeFingerprint";

test.describe("map recipe fingerprint", () => {
  test("matches identical recipes", () => {
    const recipe = {
      version: 1,
      seed: "seed-a",
      datetimeISO: "2024-06-15T00:00:00.000Z",
      location: { name: "Paris", latitude: 48.8, longitude: 2.3, timezone: "Europe/Paris" },
      textBoxes: [{ text: "Hello" }],
      selectedStyle: "navyGold" as const,
      aspectRatio: "square" as const,
      shape: "rectangle" as const,
      renderOptions: { constellationLines: "thin" as const },
    };

    expect(stableMapRecipeFingerprint(recipe)).toBe(stableMapRecipeFingerprint({ ...recipe }));
  });

  test("changes when headline changes", () => {
    const base = {
      version: 1,
      seed: "seed-a",
      datetimeISO: "2024-06-15T00:00:00.000Z",
      location: { name: "Paris", latitude: 48.8, longitude: 2.3, timezone: "Europe/Paris" },
      textBoxes: [{ text: "Hello" }],
      selectedStyle: "navyGold" as const,
      aspectRatio: "square" as const,
      shape: "rectangle" as const,
      renderOptions: {},
    };

    const changed = {
      ...base,
      textBoxes: [{ text: "Goodbye" }],
    };

    expect(stableMapRecipeFingerprint(base)).not.toBe(stableMapRecipeFingerprint(changed));
  });
});
