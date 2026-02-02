const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    // Force reload to pick up code changes
    await page.goto('http://localhost:3004/simple-test', { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click Make it yours
    await page.locator('text=Make it yours').click();
    await page.waitForTimeout(500);

    // Click Parchment
    await page.locator('button:has-text("Parchment")').click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '/tmp/quick-parchment.png', fullPage: true });
    console.log('Screenshot: /tmp/quick-parchment.png');

    await browser.close();
})();
