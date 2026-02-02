const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('http://localhost:3004/simple-test', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click Make it yours
    await page.locator('text=Make it yours').click();
    await page.waitForTimeout(500);

    console.log('Before clicking Parchment:');
    logs.forEach(l => console.log('  ', l));
    logs.length = 0;

    // Click Parchment
    await page.locator('button:has-text("Parchment")').click();
    await page.waitForTimeout(2000);

    console.log('\nAfter clicking Parchment:');
    logs.forEach(l => console.log('  ', l));

    await browser.close();
})();
