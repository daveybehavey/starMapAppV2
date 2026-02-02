const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    console.log("1. Opening SimplifiedEditor test page...");
    await page.goto('http://localhost:3004/simple-test', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '/tmp/test-01-initial.png', fullPage: true });
    console.log("   Screenshot saved: /tmp/test-01-initial.png");

    // Check for Make it yours button
    const makeYoursBtn = page.locator('text=Make it yours');
    const count = await makeYoursBtn.count();
    console.log(`   'Make it yours' button found: ${count > 0}`);

    console.log("\n2. Clicking 'Make it yours' button...");
    if (count > 0) {
        await makeYoursBtn.click();
        await page.waitForTimeout(500);
    }
    await page.screenshot({ path: '/tmp/test-02-after-make-yours.png', fullPage: true });
    console.log("   Screenshot saved: /tmp/test-02-after-make-yours.png");

    // Check form state
    const dateInput = page.locator('input[type="date"]');
    const isDisabled = await dateInput.isDisabled();
    console.log(`   Date input disabled: ${isDisabled}`);

    console.log("\n3. Testing style buttons...");

    // Click Vintage
    const vintageBtn = page.locator('button:has-text("Vintage")');
    if (await vintageBtn.count() > 0) {
        await vintageBtn.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: '/tmp/test-03-vintage-style.png', fullPage: true });
        console.log("   Clicked Vintage - Screenshot saved");
    }

    // Click Parchment
    const parchmentBtn = page.locator('button:has-text("Parchment")');
    if (await parchmentBtn.count() > 0) {
        await parchmentBtn.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: '/tmp/test-04-parchment-style.png', fullPage: true });
        console.log("   Clicked Parchment - Screenshot saved");
    }

    console.log("\n4. Testing shape buttons...");

    // Click Circle
    const circleBtn = page.locator('button:has-text("Circle")');
    if (await circleBtn.count() > 0) {
        await circleBtn.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: '/tmp/test-05-circle-shape.png', fullPage: true });
        console.log("   Clicked Circle - Screenshot saved");
    }

    // Click Heart
    const heartBtn = page.locator('button:has-text("Heart")');
    if (await heartBtn.count() > 0) {
        await heartBtn.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: '/tmp/test-06-heart-shape.png', fullPage: true });
        console.log("   Clicked Heart - Screenshot saved");
    }

    console.log("\n5. Testing title input...");
    const titleInput = page.locator('input[placeholder="Our Night Sky"]');
    if (await titleInput.count() > 0) {
        await titleInput.fill("Test Wedding Night");
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '/tmp/test-07-title-changed.png', fullPage: true });
        console.log("   Changed title - Screenshot saved");
    }

    console.log("\n6. Testing location input...");
    const locationInput = page.locator('input[placeholder="Search for a city..."]');
    if (await locationInput.count() > 0) {
        await locationInput.fill("Paris");
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '/tmp/test-08-location-search.png', fullPage: true });
        console.log("   Searched Paris - Screenshot saved");

        // Try to click first result
        const firstResult = page.locator('[role="option"]').first();
        if (await firstResult.count() > 0) {
            await firstResult.click();
            await page.waitForTimeout(3000);
            await page.screenshot({ path: '/tmp/test-09-location-selected.png', fullPage: true });
            console.log("   Selected Paris - Screenshot saved");
        }
    }

    console.log("\n7. Final state...");
    await page.screenshot({ path: '/tmp/test-10-final.png', fullPage: true });
    console.log("   Final screenshot saved");

    await browser.close();
    console.log("\n✓ Test complete!");
})();
