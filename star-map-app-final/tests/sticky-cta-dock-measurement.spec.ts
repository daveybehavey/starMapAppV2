import { test, devices, type Page, type TestInfo } from "@playwright/test";
import { dismissOverlays, primeLocalStorage } from "./test-helpers";

/**
 * B4 MEASUREMENT ONLY — StickyCtaBar dock offset vs the sticky SiteTopNav header.
 *
 * UX audit item B4 (2026-10-18) claims, from source geometry, that when the
 * StickyCtaBar (`sticky top-3 z-20`) docks on scroll it slides UNDER the
 * SiteTopNav header (`sticky top-0 z-50`, ~57px tall): a 12px dock offset
 * under a ~57px header would hide the bar's top ~45px behind the header.
 * That claim was never confirmed on a rendered page.
 *
 * This spec measures the rendered geometry on phone viewports and REPORTS
 * it — both elements' getBoundingClientRect() per scroll state, plus the
 * computed overlap. It contains NO geometry assertions and must never fail
 * the nightly suite over the numbers it finds; element absence is recorded
 * as nulls, not an error. Results land in the run as console lines prefixed
 * `[B4]` and as the attached `b4-measurements.json` + per-state screenshots
 * (nightly uploads playwright-report/ and test-results/ as artifacts).
 */

type RectReport = {
  top: number;
  bottom: number;
  height: number;
  width: number;
  left: number;
} | null;

type StateMeasurement = {
  device: string;
  page: string;
  state: string;
  scrollY: number;
  viewport: { width: number; height: number } | null;
  header: RectReport;
  ctaBar: RectReport;
  /** px of the docked bar hidden behind the header: header.bottom - bar.top when both overlap the same x-range; negative means a visible gap. */
  overlapPx: number | null;
  ctaComputedTop: string | null;
  ctaZIndex: string | null;
  headerZIndex: string | null;
};

const TARGET_PATH = "/shop";
const DEVICE_NAMES = ["iPhone 12", "Pixel 7", "Galaxy S9+"] as const;

async function measureState(
  page: Page,
  deviceName: string,
  state: string,
): Promise<StateMeasurement> {
  return page.evaluate(
    ({ deviceName: dn, state: st, path }) => {
      const round = (n: number) => Math.round(n * 100) / 100;
      const toRect = (el: Element | null): RectReport => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: round(r.top),
          bottom: round(r.bottom),
          height: round(r.height),
          width: round(r.width),
          left: round(r.left),
        };
      };

      const header = document.querySelector("header");
      // The bar is the sticky element that is not the header: StickyCtaBar's
      // outer div carries Tailwind `sticky top-3` (computed top 12px).
      const stickyEls = Array.from(document.querySelectorAll("body *")).filter(
        (el) => window.getComputedStyle(el).position === "sticky",
      );
      const cta =
        stickyEls.find(
          (el) => el !== header && window.getComputedStyle(el).top === "12px",
        ) ?? null;

      const headerRect = toRect(header);
      const ctaRect = toRect(cta);
      let overlapPx: number | null = null;
      if (headerRect && ctaRect) {
        const xOverlap =
          Math.min(headerRect.left + headerRect.width, ctaRect.left + ctaRect.width) -
          Math.max(headerRect.left, ctaRect.left);
        overlapPx = xOverlap > 0 ? round(headerRect.bottom - ctaRect.top) : null;
      }

      return {
        device: dn,
        page: path,
        state: st,
        scrollY: round(window.scrollY),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        header: headerRect,
        ctaBar: ctaRect,
        overlapPx,
        ctaComputedTop: cta ? window.getComputedStyle(cta).top : null,
        ctaZIndex: cta ? window.getComputedStyle(cta).zIndex : null,
        headerZIndex: header ? window.getComputedStyle(header).zIndex : null,
      };
    },
    { deviceName, state, path: TARGET_PATH },
  );
}

async function scrollToDock(page: Page) {
  // Scroll so the bar's natural position reaches the top of the viewport,
  // which is where its sticky dock (top: 12px) engages.
  await page.evaluate(() => {
    const stickyEls = Array.from(document.querySelectorAll("body *")).filter(
      (el) => window.getComputedStyle(el).position === "sticky",
    );
    const cta = stickyEls.find(
      (el) =>
        el.tagName !== "HEADER" && window.getComputedStyle(el).top === "12px",
    );
    if (cta) {
      const docTop = cta.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, docTop));
    }
  });
  await page.waitForTimeout(400);
}

for (const deviceName of DEVICE_NAMES) {
  const device = devices[deviceName];
  if (!device) continue;

  // Browser-selecting options force a new worker, so they cannot be set
  // inside a describe group; the config's default project already runs the
  // Chromium build CI installs. Strip them and keep the device's viewport /
  // UA / touch profile (the repo's mobile specs run phone descriptors on
  // Chromium the same way — mobile-create.spec.ts).
  const { defaultBrowserType, ...deviceOptions } = device;
  void defaultBrowserType;

  test.describe(`B4 sticky CTA dock measurement — ${deviceName}`, () => {
    test.use({ ...deviceOptions });
    test.setTimeout(120_000);

    test(`measures StickyCtaBar vs header geometry on ${TARGET_PATH}`, async ({
      page,
    }, testInfo: TestInfo) => {
      const measurements: StateMeasurement[] = [];
      const record = async (state: string) => {
        const m = await measureState(page, deviceName, state);
        measurements.push(m);
        console.log(`[B4] ${JSON.stringify(m)}`);
        const shot = await page.screenshot();
        await testInfo.attach(`b4-${deviceName.replace(/\s+/g, "-")}-${state}.png`, {
          body: shot,
          contentType: "image/png",
        });
      };

      await primeLocalStorage(page);
      await page.goto(TARGET_PATH, { waitUntil: "domcontentloaded" });
      await dismissOverlays(page);
      // Give sticky elements a chance to mount; absence is recorded, not fatal.
      await page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll("body *")).some(
              (el) => window.getComputedStyle(el).position === "sticky",
            ),
          undefined,
          { timeout: 15_000 },
        )
        .catch(() => undefined);
      await page.waitForTimeout(500);

      await record("at-top");

      await scrollToDock(page);
      await record("docked");

      await page.evaluate(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.floor(max * 0.75));
      });
      await page.waitForTimeout(400);
      await record("deep-scroll");

      await testInfo.attach("b4-measurements.json", {
        body: JSON.stringify({ device: deviceName, measurements }, null, 2),
        contentType: "application/json",
      });
    });
  });
}
