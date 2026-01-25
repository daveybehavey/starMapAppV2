const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.setTimeout(120000);

test.use({
  launchOptions: {
    args: ['--disable-gpu', '--disable-dev-shm-usage'],
  },
});

test('capture layout screenshots', async ({ page }) => {
  const outDir = path.join(process.cwd(), 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("starmap-promo-popup-dismissed", new Date().toISOString());
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("analytics-consent", "true");
  });
  const gotoWithRetry = async (url, options) => {
    try {
      await page.goto(url, options);
    } catch (error) {
      if (String(error).includes('net::ERR_ABORTED')) {
        await page.waitForTimeout(500);
        await page.goto(url, options);
        return;
      }
      throw error;
    }
  };

  const shots = [
    { name: 'layout-desktop.png', width: 1440, height: 900 },
    { name: 'layout-tablet.png', width: 834, height: 1112 },
    { name: 'layout-mobile.png', width: 390, height: 844 },
  ];

  for (const shot of shots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    const force = shot.width < 1024 ? 'mobile' : 'desktop';
    await gotoWithRetry(`http://127.0.0.1:3004/?force=${force}`, { waitUntil: 'domcontentloaded' });
    const startButton = page.locator('#editor').getByRole('button', { name: /Start with a preset/i }).first();
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, shot.name), fullPage: false });
  }
});
