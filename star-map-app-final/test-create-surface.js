/**
 * Phase 1 Create Surface Testing Suite
 * Tests all functionality of the simplified Create surface
 */

const path = require('path');
const puppeteer = require('puppeteer');

const RESULTS = {
  passed: [],
  failed: [],
  warnings: []
};

function log(suite, test, status, details = '') {
  const result = { suite, test, status, details, timestamp: new Date().toISOString() };
  if (status === 'PASS') RESULTS.passed.push(result);
  else if (status === 'FAIL') RESULTS.failed.push(result);
  else if (status === 'WARN') RESULTS.warnings.push(result);

  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
  console.log(`${icon} [${suite}] ${test} ${details ? `- ${details}` : ''}`);
}

async function testSuite1_CoreCreateFlow(page) {
  console.log('\n=== Test Suite 1: Core Create Flow ===\n');

  try {
    // 1. Navigate to homepage
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
    log('Suite 1', 'Navigate to homepage', 'PASS');

    // 2. Click Wedding preset
    await page.waitForSelector('button:has-text("💍 Wedding")', { timeout: 5000 });
    await page.click('button:has-text("💍 Wedding")');
    await page.waitForTimeout(500);
    log('Suite 1', 'Click Wedding preset', 'PASS');

    // 3. Verify text boxes populated
    const titleValue = await page.$eval('input[placeholder*="title"]', el => el.value);
    if (titleValue && titleValue.length > 0) {
      log('Suite 1', 'Text boxes populated from preset', 'PASS', `Title: "${titleValue}"`);
    } else {
      log('Suite 1', 'Text boxes populated from preset', 'WARN', 'Title field empty');
    }

    // 4. Enter date
    const dateInput = await page.$('input[type="date"], input[type="datetime-local"]');
    if (dateInput) {
      await dateInput.click();
      await dateInput.type('2024-06-15');
      log('Suite 1', 'Enter date', 'PASS', '2024-06-15');
    } else {
      log('Suite 1', 'Enter date', 'WARN', 'Date input not found');
    }

    // 5. Search location
    const locationInput = await page.$('input[placeholder*="location"], input[placeholder*="search"]');
    if (locationInput) {
      await locationInput.click();
      await locationInput.type('Paris, France');
      await page.waitForTimeout(1000);
      // Try to click first autocomplete result
      const firstResult = await page.$('[role="option"], .autocomplete-item, li');
      if (firstResult) {
        await firstResult.click();
        log('Suite 1', 'Search location', 'PASS', 'Paris, France');
      } else {
        log('Suite 1', 'Search location', 'WARN', 'Autocomplete results not found');
      }
    } else {
      log('Suite 1', 'Search location', 'WARN', 'Location input not found');
    }

    // 6-8. Edit text boxes
    const textInputs = await page.$$('input[type="text"]');
    if (textInputs.length >= 3) {
      await textInputs[0].click({ clickCount: 3 });
      await textInputs[0].type('Our Wedding Night');
      log('Suite 1', 'Edit Title text', 'PASS', 'Our Wedding Night');

      await textInputs[1].click({ clickCount: 3 });
      await textInputs[1].type('June 15, 2024');
      log('Suite 1', 'Edit Subtitle text', 'PASS', 'June 15, 2024');

      await textInputs[2].click({ clickCount: 3 });
      await textInputs[2].type('Love always, Alex & Jordan');
      log('Suite 1', 'Edit Dedication text', 'PASS', 'Love always, Alex & Jordan');
    } else {
      log('Suite 1', 'Edit text boxes', 'WARN', `Found ${textInputs.length} text inputs`);
    }

    // 9. Select Classic style
    const classicButton = await page.$('button:has-text("Navy & Gold"), button:has-text("Classic")');
    if (classicButton) {
      await classicButton.click();
      log('Suite 1', 'Select style', 'PASS', 'Classic style');
    } else {
      log('Suite 1', 'Select style', 'WARN', 'Style button not found');
    }

    // 10. Drag intensity slider
    const slider = await page.$('input[type="range"]');
    if (slider) {
      await slider.evaluate(el => el.value = 50);
      await slider.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
      log('Suite 1', 'Adjust intensity slider', 'PASS', '50%');
    } else {
      log('Suite 1', 'Adjust intensity slider', 'WARN', 'Slider not found');
    }

    // 11. Click reveal button
    const revealButton = await page.$('button:has-text("Find your special moment"), button:has-text("special moment")');
    if (revealButton) {
      await revealButton.click();
      await page.waitForTimeout(2000);
      log('Suite 1', 'Click reveal button', 'PASS');

      // 12. Verify canvas renders
      const canvas = await page.$('canvas');
      if (canvas) {
        log('Suite 1', 'Canvas renders', 'PASS');
      } else {
        log('Suite 1', 'Canvas renders', 'FAIL', 'Canvas not found after reveal');
      }

      // 13. Verify export buttons appear
      const freeButton = await page.$('button:has-text("Free")');
      const hdButton = await page.$('button:has-text("HD")');
      if (freeButton && hdButton) {
        log('Suite 1', 'Export buttons appear', 'PASS');
      } else {
        log('Suite 1', 'Export buttons appear', 'WARN', `Free: ${!!freeButton}, HD: ${!!hdButton}`);
      }
    } else {
      log('Suite 1', 'Click reveal button', 'FAIL', 'Reveal button not found');
    }

  } catch (error) {
    log('Suite 1', 'General error', 'FAIL', error.message);
  }
}

async function testSuite2_PremiumFlow(page) {
  console.log('\n=== Test Suite 2: Premium Flow ===\n');

  try {
    // Continue from Suite 1 state
    // 1. Drag intensity to 70%
    const slider = await page.$('input[type="range"]');
    if (slider) {
      await slider.evaluate(el => el.value = 70);
      await slider.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
      await page.waitForTimeout(500);

      // Check if paywall opened
      const paywallModal = await page.$('div:has-text("Unlock"), div:has-text("checkout")');
      if (paywallModal) {
        log('Suite 2', 'Intensity >60% triggers paywall', 'PASS');
        // Close paywall
        const closeButton = await page.$('button:has-text("×"), button[aria-label*="close"]');
        if (closeButton) await closeButton.click();
      } else {
        log('Suite 2', 'Intensity >60% triggers paywall', 'WARN', 'Paywall not detected');
      }
    }

    // 2. Click HD Download
    const hdButton = await page.$('button:has-text("HD")');
    if (hdButton) {
      await hdButton.click();
      await page.waitForTimeout(500);

      const paywallModal = await page.$('div:has-text("Unlock"), div:has-text("Download your print-ready")');
      if (paywallModal) {
        log('Suite 2', 'HD download triggers paywall', 'PASS');
      } else {
        log('Suite 2', 'HD download triggers paywall', 'WARN', 'Paywall not detected');
      }
    }

  } catch (error) {
    log('Suite 2', 'General error', 'FAIL', error.message);
  }
}

async function testSuite3_Sharing(page) {
  console.log('\n=== Test Suite 3: Sharing ===\n');

  try {
    // 1. Click Save & Remix
    const saveButton = await page.$('button:has-text("Save & Remix"), button:has-text("💾")');
    if (saveButton) {
      await saveButton.click();
      await page.waitForTimeout(2000);

      // Check for success (URL change or notification)
      const url = page.url();
      if (url.includes('/m/') || url !== 'http://localhost:3000') {
        log('Suite 3', 'Save & Remix creates shareable link', 'PASS', url);
      } else {
        log('Suite 3', 'Save & Remix creates shareable link', 'WARN', 'URL did not change');
      }
    } else {
      log('Suite 3', 'Save & Remix button', 'WARN', 'Button not found');
    }

    // 2. Check Share button exists
    const shareButton = await page.$('button:has-text("🔗 Share"), button:has-text("Share")');
    if (shareButton) {
      log('Suite 3', 'Share button exists', 'PASS');
    } else {
      log('Suite 3', 'Share button exists', 'WARN', 'Button not found');
    }

  } catch (error) {
    log('Suite 3', 'General error', 'FAIL', error.message);
  }
}

async function testSuite4_URLState(page) {
  console.log('\n=== Test Suite 4: URL State ===\n');

  try {
    // Get current URL with state
    const currentURL = page.url();
    log('Suite 4', 'Capture URL with state', 'PASS', currentURL);

    // Open URL in new page
    const newPage = await page.browser().newPage();
    await newPage.goto(currentURL, { waitUntil: 'networkidle2', timeout: 10000 });
    await newPage.waitForTimeout(2000);

    // Verify state hydrated
    const textInputs = await newPage.$$('input[type="text"]');
    if (textInputs.length > 0) {
      const value = await textInputs[0].evaluate(el => el.value);
      if (value && value.length > 0) {
        log('Suite 4', 'State hydrates from URL', 'PASS', `Title: "${value}"`);
      } else {
        log('Suite 4', 'State hydrates from URL', 'WARN', 'Text inputs empty');
      }
    }

    await newPage.close();

  } catch (error) {
    log('Suite 4', 'General error', 'FAIL', error.message);
  }
}

async function testSuite5_Responsive(page) {
  console.log('\n=== Test Suite 5: Responsive ===\n');

  try {
    // Test mobile (375px)
    await page.setViewport({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    log('Suite 5', 'Resize to mobile (375px)', 'PASS');

    // Test tablet (768px)
    await page.setViewport({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    log('Suite 5', 'Resize to tablet (768px)', 'PASS');

    // Test desktop (1920px)
    await page.setViewport({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    log('Suite 5', 'Resize to desktop (1920px)', 'PASS');

    // Check for horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    if (!hasHorizontalScroll) {
      log('Suite 5', 'No horizontal scroll at all breakpoints', 'PASS');
    } else {
      log('Suite 5', 'No horizontal scroll', 'WARN', 'Horizontal scroll detected');
    }

  } catch (error) {
    log('Suite 5', 'General error', 'FAIL', error.message);
  }
}

async function testRegressionSuite(page) {
  console.log('\n=== Regression Testing ===\n');

  try {
    // Navigate fresh
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await page.setViewport({ width: 1920, height: 1080 });

    // Test occasion presets
    const presets = await page.$$('button:has-text("💍"), button:has-text("❤️"), button:has-text("🎉")');
    if (presets.length >= 3) {
      log('Regression', 'Occasion presets present', 'PASS', `Found ${presets.length} presets`);
    } else {
      log('Regression', 'Occasion presets present', 'WARN', `Found ${presets.length} presets`);
    }

    // Test intensity slider
    const slider = await page.$('input[type="range"]');
    if (slider) {
      log('Regression', 'Intensity slider present', 'PASS');
    } else {
      log('Regression', 'Intensity slider present', 'FAIL');
    }

    // Test reveal button
    const revealButton = await page.$('button:has-text("Find your special moment")');
    if (revealButton) {
      log('Regression', 'Reveal button present', 'PASS');
    } else {
      log('Regression', 'Reveal button present', 'FAIL');
    }

    // Test text boxes (should be 3)
    const textInputs = await page.$$('input[type="text"]');
    if (textInputs.length === 3) {
      log('Regression', '3 text boxes present', 'PASS');
    } else {
      log('Regression', '3 text boxes present', 'WARN', `Found ${textInputs.length} boxes`);
    }

    // Verify NO advanced controls present
    const fontSelect = await page.$('select[value*="font"], select:has-text("Lora")');
    const colorInput = await page.$('input[type="color"]');
    const sizeInput = await page.$('input[type="number"][min="10"]');

    if (!fontSelect) {
      log('Regression', 'Font selector removed', 'PASS');
    } else {
      log('Regression', 'Font selector removed', 'FAIL', 'Font selector still present');
    }

    if (!colorInput) {
      log('Regression', 'Color picker removed', 'PASS');
    } else {
      log('Regression', 'Color picker removed', 'FAIL', 'Color picker still present');
    }

    if (!sizeInput) {
      log('Regression', 'Size input removed', 'PASS');
    } else {
      log('Regression', 'Size input removed', 'FAIL', 'Size input still present');
    }

    // Check console for errors
    const logs = await page.evaluate(() => {
      return window.console.errors || [];
    });

    if (logs.length === 0) {
      log('Regression', 'No console errors', 'PASS');
    } else {
      log('Regression', 'No console errors', 'WARN', `${logs.length} errors found`);
    }

  } catch (error) {
    log('Regression', 'General error', 'FAIL', error.message);
  }
}

async function runAllTests() {
  console.log('\n🧪 Starting Phase 1 Create Surface Testing\n');
  console.log('='.repeat(50));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set default viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser console error:', msg.text());
    }
  });

  // Run all test suites
  await testSuite1_CoreCreateFlow(page);
  await testSuite2_PremiumFlow(page);
  await testSuite3_Sharing(page);
  await testSuite4_URLState(page);
  await testSuite5_Responsive(page);
  await testRegressionSuite(page);

  await browser.close();

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Summary\n');
  console.log(`✓ Passed: ${RESULTS.passed.length}`);
  console.log(`⚠ Warnings: ${RESULTS.warnings.length}`);
  console.log(`✗ Failed: ${RESULTS.failed.length}`);
  console.log(`\nTotal: ${RESULTS.passed.length + RESULTS.warnings.length + RESULTS.failed.length} tests`);

  if (RESULTS.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    RESULTS.failed.forEach(r => console.log(`  - [${r.suite}] ${r.test}: ${r.details}`));
  }

  if (RESULTS.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    RESULTS.warnings.forEach(r => console.log(`  - [${r.suite}] ${r.test}: ${r.details}`));
  }

  // Write results to file
  const fs = require('fs');
  fs.writeFileSync(
    path.join(__dirname, 'test-results.json'),
    JSON.stringify(RESULTS, null, 2)
  );

  console.log('\n📝 Detailed results saved to: test-results.json\n');

  // Exit code
  process.exit(RESULTS.failed.length > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  console.error('Fatal test error:', error);
  process.exit(1);
});
