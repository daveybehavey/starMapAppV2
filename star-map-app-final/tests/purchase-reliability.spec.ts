import { expect, test, type Page } from "@playwright/test";
import { waitForEditor, primeLocalStorage } from "./test-helpers";

const handoff = "https://checkout.stripe.com/pay/cs_test_synthetic#preserved-fragment";
const mapId = "123e4567-e89b-42d3-a456-426614174000";

async function openEditor(page: Page, editor: string) {
  await primeLocalStorage(page);
  // Every non-local request is blocked; Stripe navigation is fulfilled below, never sent.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:3004(?:\/|$)|localhost:3004(?:\/|$))/, route => route.abort());
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Mock Stripe handoff</h1>" }));
  await page.route("**/api/premium**", route => route.fulfill({ json: { paid: false } }));
  await page.route("**/api/geocode**", route => route.fulfill({ json: [{ id: 1, name: "London, UK", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London" }] }));
  if (editor === "primary") {
    await page.goto("/editor?force=desktop", { waitUntil: "domcontentloaded" });
    await waitForEditor(page, true);
    const preview = page.getByLabel("Free export").first();
    await expect(async () => {
      if (!(await preview.isVisible())) await page.getByRole("button", { name: "Try a sample moment", exact: true }).click();
      await expect(preview).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole("button", { name: /HD export/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  } else {
    await page.goto("/simple-test", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Start customizing your star map|Make it yours/i }).click();
    await page.locator("input[type=date]").fill("2024-06-15");
    await page.locator('input[placeholder*="Night Sky"]').fill("Synthetic checkout test");
    await page.locator('input[placeholder*="city"]').fill("London");
    await page.getByRole("option", { name: /London, UK/i }).click();
  }
}

for (const editor of ["primary", "simple"]) {
  for (const failure of ["network", "timeout", "exhausted", "input"]) {
    test(`${editor}: ${failure} keeps checkout bounded and idempotent`, async ({ page }) => {
      test.setTimeout(120_000);
      const requests: Record<string, unknown>[] = [];
      let saves = 0;
      await page.route("**/api/maps", route => { saves++; return route.fulfill({ json: { id: mapId } }); });
      await page.route("**/api/checkout", async route => {
        requests.push(route.request().postDataJSON());
        if (failure === "input") return route.fulfill({ status: 400, json: { code: "map_required" } });
        if (failure === "exhausted" || (failure === "network" && requests.length === 1)) return route.abort("failed");
        return route.fulfill({ json: { url: handoff } });
      });
      await openEditor(page, editor);
      if (failure === "timeout") {
        // Real request helper + AbortController, with only the deadline accelerated.
        await page.evaluate(() => {
          const fetchOriginal = window.fetch.bind(window);
          const timeoutOriginal = window.setTimeout.bind(window);
          let pending = true;
          let firstDeadline = true;
          window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => timeoutOriginal(handler, ms === 30_000 && firstDeadline ? (firstDeadline = false, 20) : ms, ...args)) as typeof window.setTimeout;
          window.fetch = (url, init) => {
            if (url === "/api/checkout" && pending) {
              pending = false;
              return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError"))));
            }
            return fetchOriginal(url, init);
          };
        });
      }
      const button = editor === "primary"
        ? page.getByRole("button", { name: "Buy this map in HD", exact: true })
        : page.getByRole("button", { name: /Unlock HD/i });
      await button.click();
      if (failure === "network" || failure === "timeout") {
        await expect(page).toHaveURL(handoff);
        await expect(page.getByRole("heading", { name: "Mock Stripe handoff" })).toBeVisible();
        expect(requests).toHaveLength(failure === "timeout" ? 1 : 2);
      } else {
        await expect(button).toBeEnabled();
        await expect.poll(() => requests.length).toBe(failure === "input" ? 1 : 2);
        await page.waitForTimeout(600);
        expect(requests).toHaveLength(failure === "input" ? 1 : 2);
        expect(page.url()).not.toContain("checkout.stripe.com");
      }
      expect(saves).toBe(1);
      for (const request of requests) {
        expect(request.mapId).toBe(mapId);
        expect(request.plan).toBe("single");
        expect(request.checkoutHandoff).toMatch(/^b[a-f0-9]{16}$/i);
      }
      if (requests.length === 2) {
        const stable = (request: Record<string, unknown>) => Object.fromEntries(Object.entries(request).filter(([key]) => key !== "checkoutHandoff"));
        expect(stable(requests[0])).toEqual(stable(requests[1]));
      }
    });
  }
}

for (const editor of ["primary", "simple"]) {
  for (const consent of ["missing", "declined", "invalid", "dnt", "granted"]) {
    test(`${editor}: ${consent} consent stays frozen across checkout retry`, async ({ page }) => {
      test.setTimeout(120_000);
      const requests: Record<string, unknown>[] = [];
      await page.route("**/api/maps", route => route.fulfill({ json: { id: mapId } }));
      await page.route("**/api/checkout", async route => {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) {
          // A later grant/withdrawal cannot rewrite this in-flight logical request.
          await page.evaluate(() => localStorage.setItem("analytics-consent", localStorage.getItem("analytics-consent") === "true" ? "false" : "true"));
          return route.abort("failed");
        }
        return route.fulfill({ json: { url: handoff } });
      });
      await openEditor(page, editor);
      await page.evaluate(state => {
        if (state === "missing") localStorage.removeItem("analytics-consent");
        else localStorage.setItem("analytics-consent", state === "declined" ? "false" : state === "invalid" ? "yes" : "true");
        Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: state === "dnt" ? "1" : "0" });
      }, consent);
      await (editor === "primary" ? page.getByRole("button", { name: "Buy this map in HD", exact: true }) : page.getByRole("button", { name: /Unlock HD/i })).click();
      await expect(page).toHaveURL(handoff);
      expect(requests).toHaveLength(2);
      for (const request of requests) expect(request.analyticsConsent).toBe(consent === "granted" ? "granted-v1" : "not-granted");
      const stable = (request: Record<string, unknown>) => Object.fromEntries(Object.entries(request).filter(([key]) => key !== "checkoutHandoff"));
      expect(stable(requests[0])).toEqual(stable(requests[1]));
    });
  }
}

for (const editor of ["primary", "simple"]) {
  for (const url of ["https://pay.stripe.com/c/pay/cs_test_abc", "https://checkout.stripe.com/not-a-checkout"]) {
    test(`${editor}: rejects unrecognized checkout destination ${url}`, async ({ page }) => {
      test.setTimeout(120_000);
      let requests = 0;
      await page.route("**/api/maps", route => route.fulfill({ json: { id: mapId } }));
      await page.route("**/api/checkout", route => { requests++; return route.fulfill({ json: { url } }); });
      await openEditor(page, editor);
      const before = page.url();
      const button = editor === "primary" ? page.getByRole("button", { name: "Buy this map in HD", exact: true }) : page.getByRole("button", { name: /Unlock HD/i });
      await button.click();
      await expect.poll(() => requests).toBe(1);
      await expect(button).toBeEnabled();
      expect(page.url()).toBe(before);
    });
  }
}
for (const consent of ["missing", "declined", "invalid", "dnt", "granted"]) {
  test(`success digital add-on sends ${consent} consent`, async ({ page }) => {
    await primeLocalStorage(page);
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:3004(?:\/|$)|localhost:3004(?:\/|$))/, route => route.abort());
    await page.route("https://checkout.stripe.com/**", route => route.fulfill({ contentType: "text/html", body: "<h1>Mock Stripe handoff</h1>" }));
    await page.route("**/api/stripe/verify**", route => route.fulfill({ json: { paid: true, mapId, plan: null, creditsRemaining: 0, orderType: "print", printVariant: "poster_framed", includesDigitalAddOn: false } }));
    let payload: Record<string, unknown> | undefined;
    await page.route("**/api/checkout", route => { payload = route.request().postDataJSON(); return route.fulfill({ json: { url: handoff } }); });
    await page.goto(`/success?session_id=cs_test_synthetic&map_id=${mapId}`);
    const button = page.getByRole("button", { name: /Add HD download/ });
    await expect(button).toBeVisible();
    await page.evaluate(state => {
      if (state === "missing") localStorage.removeItem("analytics-consent");
      else localStorage.setItem("analytics-consent", state === "declined" ? "false" : state === "invalid" ? "yes" : "true");
      Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: state === "dnt" ? "1" : "0" });
    }, consent);
    await button.click();
    await expect(page).toHaveURL(handoff);
    expect(payload?.analyticsConsent).toBe(consent === "granted" ? "granted-v1" : "not-granted");
    expect(payload?.mapId).toBe(mapId);
  });
}
