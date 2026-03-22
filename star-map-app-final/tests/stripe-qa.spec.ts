import { test, chromium } from '@playwright/test';

/**
 * Manual QA Tests for Stripe Integration
 * Run with: npx playwright test tests/stripe-qa.spec.ts --headed
 */

const SITE_URL = 'https://starmapco.com';
const PROMO_CODE = 'GBTRYGVB';
const RUN_STRIPE_QA = process.env.PLAYWRIGHT_STRIPE_QA === 'true';
const PAYWALL_HEADING_PATTERN = /Buy this map in HD or print|Buy this map in HD|Download your print-ready star map|Unlock HD exports in seconds/i;
const PAYWALL_SINGLE_CTA_PATTERN = /Continue with single|Get 1 HD map|Get 1 HD file|Buy this map in HD/i;

test.describe('Stripe QA Tests', () => {
  test.skip(!RUN_STRIPE_QA, 'Manual QA only. Set PLAYWRIGHT_STRIPE_QA=true to run.');
  test.setTimeout(300000); // 5 minutes per test

  test('Complete checkout with 100% off code and verify single session', async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    // Track checkout API calls
    const checkoutCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/checkout')) {
        checkoutCalls.push(`${request.method()} ${request.url()}`);
        console.log(`📦 Checkout API called: ${request.method()} ${request.url()}`);
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('TEST 1: Complete checkout with 100% off code');
    console.log('='.repeat(60));

    // Navigate to homepage
    console.log('→ Navigating to homepage...');
    await page.goto(SITE_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/qa-01-homepage.png' });

    // Dismiss any cookie banners
    try {
      const acceptBtn = page.locator('text=Accept').first();
      if (await acceptBtn.isVisible({ timeout: 2000 })) {
        await acceptBtn.click();
      }
    } catch {}

    // Click "Start free preview" to scroll to editor
    console.log('→ Clicking "Start free preview"...');
    const startBtn = page.locator('text=Start free preview').first();
    if (await startBtn.isVisible({ timeout: 5000 })) {
      await startBtn.click();
      await page.waitForTimeout(1500);
    }

    await page.screenshot({ path: '/tmp/qa-02-scrolled.png' });

    // Wait for editor to be fully loaded
    console.log('→ Waiting for editor to load...');
    await page.waitForTimeout(3000);

    // Click "Try a sample moment" to auto-fill date/location and reveal preview
    console.log('→ Looking for "Try a sample moment" button...');

    const sampleBtn = page.locator('text=Try a sample moment').first();
    if (await sampleBtn.isVisible({ timeout: 5000 })) {
      console.log('→ Clicking "Try a sample moment"...');
      await sampleBtn.click();
      await page.waitForTimeout(4000); // Wait for preview to render
    } else {
      // Fallback - try "Try a sample" or scroll to find it
      console.log('→ Looking for alternative sample buttons...');
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(1000);

      const altBtn = page.locator('text=Try a sample').first();
      if (await altBtn.isVisible({ timeout: 3000 })) {
        await altBtn.click();
        await page.waitForTimeout(4000);
      }
    }

    await page.screenshot({ path: '/tmp/qa-04-preview.png' });

    // Scroll down to see export buttons
    console.log('→ Scrolling to see export buttons...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(1000);

    await page.screenshot({ path: '/tmp/qa-04b-scrolled.png' });

    // Click HD export button to trigger paywall
    console.log('→ Looking for HD export button...');

    // The button has aria-label="HD export" or contains "HD" with lock emoji
    let hdBtn = page.locator('[aria-label="HD export"]').first();
    if (!await hdBtn.isVisible({ timeout: 3000 })) {
      hdBtn = page.locator('button:has-text("HD")').first();
    }

    if (await hdBtn.isVisible({ timeout: 5000 })) {
      console.log('→ Clicking HD export button...');
      await hdBtn.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('⚠️ Could not find HD button, trying scroll...');
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);

      hdBtn = page.locator('[aria-label="HD export"]').first();
      if (await hdBtn.isVisible({ timeout: 3000 })) {
        await hdBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: '/tmp/qa-05-paywall.png' });

    // Check if paywall modal appeared
    const paywallTitle = page.getByRole('heading', { name: PAYWALL_HEADING_PATTERN }).first();
    if (await paywallTitle.isVisible({ timeout: 5000 })) {
      console.log('✅ Paywall modal opened');

      // Click "Continue with single" to start checkout
      console.log('→ Clicking "Continue with single"...');
      const singleBtn = page.getByRole('button', { name: PAYWALL_SINGLE_CTA_PATTERN }).first();
      if (await singleBtn.isVisible({ timeout: 3000 })) {
        await singleBtn.click();
        console.log('→ Waiting for Stripe redirect...');
        await page.waitForTimeout(5000);
      }
    } else {
      console.log('⚠️ Paywall did not open - checking page state...');
    }

    await page.screenshot({ path: '/tmp/qa-06-after-click.png' });

    const currentUrl = page.url();
    console.log(`→ Current URL: ${currentUrl}`);

    if (currentUrl.includes('checkout.stripe.com')) {
      console.log('✅ Redirected to Stripe Checkout');
      await page.screenshot({ path: '/tmp/qa-07-stripe.png' });

      // Enter promo code
      console.log(`→ Entering promo code: ${PROMO_CODE}`);
      try {
        // Wait for Stripe to fully load
        await page.waitForTimeout(2000);

        // Click "Add promotion code" link
        const promoLink = page.locator('text=Add promotion code').first();
        if (await promoLink.isVisible({ timeout: 5000 })) {
          await promoLink.click();
          await page.waitForTimeout(1000);
        }

        // Enter the code in the input
        const promoInput = page.locator('input[name="promotionCode"]').first();
        if (await promoInput.isVisible({ timeout: 3000 })) {
          await promoInput.fill(PROMO_CODE);
          await page.waitForTimeout(500);
        } else {
          // Try alternative selector
          const altInput = page.locator('[data-testid="promotionCode-input"]').first();
          if (await altInput.isVisible({ timeout: 2000 })) {
            await altInput.fill(PROMO_CODE);
          }
        }

        // Click Apply button
        const applyBtn = page.locator('button:has-text("Apply")').first();
        if (await applyBtn.isVisible({ timeout: 2000 })) {
          await applyBtn.click();
          await page.waitForTimeout(3000);
        }

        await page.screenshot({ path: '/tmp/qa-08-promo.png' });
        console.log('✅ Promo code entered');
      } catch (e) {
        console.log(`⚠️ Promo code issue: ${e}`);
        await page.screenshot({ path: '/tmp/qa-08-promo-error.png' });
      }

      // Fill email if required
      console.log('→ Looking for email field...');
      try {
        const emailInput = page.locator('input[type="email"], input[name="email"]').first();
        if (await emailInput.isVisible({ timeout: 3000 })) {
          await emailInput.fill('qa-test@starmapco.com');
          await page.waitForTimeout(500);
        }
      } catch {}

      await page.screenshot({ path: '/tmp/qa-09-form.png' });

      // Since it's 100% off, card may not be required
      // Look for submit button
      console.log('→ Looking for submit/complete button...');
      try {
        for (const selector of [
          'button[data-testid="hosted-payment-submit-button"]',
          'button:has-text("Pay")',
          'button:has-text("Complete")',
          'button:has-text("Subscribe")',
          '[data-testid="submit-button"]'
        ]) {
          const btn = page.locator(selector).first();
          if (await btn.isVisible({ timeout: 2000 })) {
            console.log(`→ Found submit button: ${selector}`);
            await btn.click();
            console.log('→ Clicked submit, waiting for redirect...');
            await page.waitForTimeout(10000);
            break;
          }
        }
      } catch (e) {
        console.log(`⚠️ Submit button issue: ${e}`);
      }

      await page.screenshot({ path: '/tmp/qa-10-post-submit.png' });
    } else {
      console.log('⚠️ Not on Stripe checkout page');
    }

    console.log(`→ Final URL: ${page.url()}`);

    // Verify single checkout call
    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: Verify single Stripe session creation');
    console.log('='.repeat(60));
    console.log(`→ Total /api/checkout calls: ${checkoutCalls.length}`);
    checkoutCalls.forEach((call, i) => console.log(`   Call ${i + 1}: ${call}`));

    if (checkoutCalls.length === 1) {
      console.log('✅ PASS: Only ONE Stripe session was created');
    } else if (checkoutCalls.length === 0) {
      console.log('⚠️ No checkout calls detected');
    } else {
      console.log(`❌ FAIL: ${checkoutCalls.length} checkout calls (expected 1)`);
    }

    await page.screenshot({ path: '/tmp/qa-11-final.png' });

    // Keep browser open for manual inspection
    console.log('\n→ Browser open for 120s for manual inspection (Ctrl+C to close)...');
    await page.waitForTimeout(120000);

    await browser.close();
  });

  test('Cross-device access link and expired link test', async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });

    // Device 1 - original purchaser
    const context1 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page1 = await context1.newPage();

    // Device 2 - different device simulation
    const context2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });

    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: Cross-device access link');
    console.log('='.repeat(60));

    // Navigate to download page (assuming we have a session from previous test)
    console.log('→ Navigating to download page...');
    await page1.goto(`${SITE_URL}/download`, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(2000);
    await page1.screenshot({ path: '/tmp/qa-20-download.png' });

    // Check if we have access
    const pageContent = await page1.content();
    if (pageContent.includes('Download HD file') || pageContent.includes('Access on another device')) {
      console.log('✅ Has premium access');
    } else {
      console.log('⚠️ May not have premium access - check screenshot');
    }

    // Look for access link generation
    let accessLink = '';
    console.log('→ Looking for "Copy access link" button...');

    // Scroll down to see the access link section
    await page1.evaluate(() => window.scrollBy(0, 500));
    await page1.waitForTimeout(1000);
    await page1.screenshot({ path: '/tmp/qa-21a-before-click.png' });

    const copyLinkBtn = page1.locator('text=Copy access link').first();
    if (await copyLinkBtn.isVisible({ timeout: 5000 })) {
      console.log('→ Clicking "Copy access link"...');

      // Intercept the link from network response
      const linkPromise = page1.waitForResponse(
        (response) => response.url().includes('/api/entitlements/link'),
        { timeout: 10000 }
      ).catch(() => null);

      await copyLinkBtn.click();
      await page1.waitForTimeout(1000);

      // Try to get the link from the API response
      const linkResponse = await linkPromise;
      if (linkResponse) {
        try {
          const data = await linkResponse.json();
          if (data.url) {
            accessLink = data.url;
            console.log(`✅ Access link from API: ${accessLink}`);
          }
        } catch {
          console.log('⚠️ Could not parse link response');
        }
      }

      // Wait for "Link copied" confirmation
      await page1.waitForTimeout(2000);
      const linkCopied = page1.locator('text=Link copied').first();
      if (await linkCopied.isVisible({ timeout: 3000 })) {
        console.log('✅ Link copied confirmation shown');
      }
    } else {
      // Check if button shows "Generating..."
      const generatingText = page1.locator('text=Generating').first();
      if (await generatingText.isVisible({ timeout: 2000 })) {
        console.log('→ Link is generating, waiting...');
        await page1.waitForTimeout(5000);
      }
    }

    await page1.screenshot({ path: '/tmp/qa-21-link-ui.png' });

    if (accessLink) {
      // Open on different device
      console.log('\n→ Opening link on different device (context)...');
      const page2 = await context2.newPage();
      await page2.goto(accessLink, { waitUntil: 'networkidle' });
      await page2.waitForTimeout(3000);
      await page2.screenshot({ path: '/tmp/qa-22-device2.png' });

      const content2 = await page2.content();
      if (content2.includes('Download HD') && !content2.toLowerCase().includes('expired')) {
        console.log('✅ PASS: Downloads appear unlocked on second device');
      } else if (content2.toLowerCase().includes('expired') || content2.toLowerCase().includes('replaced')) {
        console.log('⚠️ Link shows as expired (may be from previous test)');
      } else {
        console.log('⚠️ Check screenshot for verification');
      }
      console.log(`→ Device 2 URL: ${page2.url()}`);
      await page2.close();

      // TEST 4: Expired/replaced link
      console.log('\n' + '='.repeat(60));
      console.log('TEST 4: Expired/replaced link message');
      console.log('='.repeat(60));

      const oldLink = accessLink;

      // Generate new link on original device
      console.log('→ Generating NEW link on original device...');
      const newLinkBtn = page1.locator('text=New link').first();
      if (await newLinkBtn.isVisible({ timeout: 3000 })) {
        await newLinkBtn.click();
        await page1.waitForTimeout(3000);
        console.log('→ New link generated');
        await page1.screenshot({ path: '/tmp/qa-23-new-link.png' });

        // Try OLD link on device 2
        console.log(`→ Testing OLD link: ${oldLink}`);
        const page3 = await context2.newPage();
        await page3.goto(oldLink, { waitUntil: 'networkidle' });
        await page3.waitForTimeout(3000);
        await page3.screenshot({ path: '/tmp/qa-24-expired.png' });

        const expiredContent = (await page3.content()).toLowerCase();
        if (expiredContent.includes('expired') || expiredContent.includes('replaced') || expiredContent.includes('invalid')) {
          console.log('✅ PASS: Expired/replaced message shown for old link');
        } else {
          console.log('⚠️ Check screenshot - expected expired message');
          console.log(`→ Page URL: ${page3.url()}`);
        }
        await page3.close();
      } else {
        console.log('⚠️ Could not find "New link" button');
      }
    } else {
      console.log('⚠️ No access link captured - cannot test cross-device');
    }

    console.log('\n→ Browser open for 60s for inspection...');
    await page1.waitForTimeout(60000);

    await context1.close();
    await context2.close();
    await browser.close();
  });
});
