import { expect, test } from "@playwright/test";
import { __testUtils } from "../src/lib/renderSky";

test.describe("renderSky utility regressions", () => {
  test("parses hex and rgb colors consistently", () => {
    expect(__testUtils.parseHexColor("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    expect(__testUtils.parseHexColor("#A1b2c3")).toEqual({ r: 161, g: 178, b: 195 });
    expect(__testUtils.parseHexColor("#ab")).toBeNull();

    expect(__testUtils.parseRgbColor("rgb(12, 34, 56)")).toEqual({ r: 12, g: 34, b: 56 });
    expect(__testUtils.parseRgbColor("rgba(300, -5, 10.6, 0.4)")).toEqual({ r: 255, g: 0, b: 11 });
    expect(__testUtils.parseRgbColor("not-a-color")).toBeNull();
  });

  test("applies rgba conversion and color adjustment for rgb input", () => {
    expect(__testUtils.toRgba("rgb(12, 34, 56)", 0.25)).toBe("rgba(12,34,56,0.25)");
    expect(__testUtils.toRgba("rgba(12, 34, 56, 0.8)", 0.7)).toBe("rgba(12,34,56,0.7)");
    expect(__testUtils.toRgba("invalid", 0.5)).toBe("rgba(255,255,255,0.5)");

    expect(__testUtils.adjustColor("rgb(100, 150, 200)", 0.1)).toBe("rgb(126,176,226)");
    expect(__testUtils.adjustColor("rgb(100, 150, 200)", -0.2)).toBe("rgb(49,99,149)");
  });

  test("falls back safely for invalid timezone conversion inputs", () => {
    expect(__testUtils.toUTCDateFromLocal("bad-date", "10:00", "UTC")).toBeNull();
    expect(__testUtils.toUTCDateFromLocal("2024-06-01", "bad-time", "UTC")).toBeNull();

    const fallback = __testUtils.toUTCDateFromLocal("2024-06-01", "02:30", "Invalid/Timezone");
    expect(fallback).not.toBeNull();
    expect(fallback?.toISOString()).toBe("2024-06-01T02:30:00.000Z");
  });

  test("keeps wide text away from canvas edges on export", () => {
    const wide = __testUtils.resolveTextCenterNormalized(
      { x: 0, y: 0.5 },
      0,
      800,
      40,
      1200,
      1200,
    );
    expect(wide.x).toBeGreaterThan(0.3);
    expect(wide.x).toBeLessThan(0.5);

    const tall = __testUtils.resolveTextCenterNormalized(
      { x: 0.5, y: 1 },
      0,
      200,
      120,
      1200,
      1200,
    );
    expect(tall.y).toBeLessThanOrEqual(0.95);
    expect(tall.y).toBeGreaterThan(0.85);
  });
});
