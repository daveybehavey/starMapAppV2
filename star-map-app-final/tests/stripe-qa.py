#!/usr/bin/env python3
"""
Manual QA Tests for Stripe Integration
- Complete checkout with 100% off code
- Verify single Stripe session creation
- Test cross-device access links
- Test expired/replaced link behavior
"""

import json
import time
from playwright.sync_api import sync_playwright

SITE_URL = "https://starmapco.com"
PROMO_CODE = "GBTRYGVB"

def run_stripe_qa():
    with sync_playwright() as p:
        # Launch browser with visible window for QA observation
        browser = p.chromium.launch(headless=False, slow_mo=500)

        # Create two separate browser contexts to simulate different devices
        context1 = browser.new_context(viewport={"width": 1280, "height": 800})
        context2 = browser.new_context(viewport={"width": 1280, "height": 800})

        page1 = context1.new_page()

        # Track API calls to count Stripe session creations
        checkout_calls = []

        def handle_request(request):
            if "/api/checkout" in request.url:
                checkout_calls.append({
                    "url": request.url,
                    "method": request.method,
                    "time": time.time()
                })
                print(f"📦 Checkout API called: {request.method} {request.url}")

        page1.on("request", handle_request)

        print("\n" + "="*60)
        print("STRIPE QA TEST SUITE")
        print("="*60)

        # ========================================
        # TEST 1: Complete checkout flow
        # ========================================
        print("\n📋 TEST 1: Complete checkout with 100% off code")
        print("-" * 40)

        # Navigate to editor
        print("→ Navigating to editor...")
        page1.goto(f"{SITE_URL}", wait_until="networkidle")
        page1.screenshot(path="/tmp/qa-01-homepage.png")

        # Click create/start button
        print("→ Looking for 'Create' or 'Start' button...")
        try:
            # Try various button selectors
            create_btn = page1.locator("text=Create Your Star Map").first
            if create_btn.is_visible():
                create_btn.click()
            else:
                page1.locator("text=Start").first.click()
        except:
            # Try direct navigation
            page1.goto(f"{SITE_URL}/editor", wait_until="networkidle")

        page1.wait_for_load_state("networkidle")
        page1.screenshot(path="/tmp/qa-02-editor.png")
        print("→ Editor loaded")

        # Apply sample moment to have valid map data
        print("→ Applying sample moment...")
        try:
            sample_btn = page1.locator("text=Try a sample").first
            if sample_btn.is_visible():
                sample_btn.click()
                page1.wait_for_timeout(2000)
        except:
            print("   (No sample button found, continuing...)")

        page1.screenshot(path="/tmp/qa-03-sample-applied.png")

        # Find and click download/purchase button
        print("→ Looking for Download HD button...")
        page1.wait_for_timeout(1000)

        # Try to find the download button
        download_btn = None
        for selector in ["text=Download HD", "text=Get HD Download", "text=Buy Now", "text=Purchase"]:
            try:
                btn = page1.locator(selector).first
                if btn.is_visible(timeout=2000):
                    download_btn = btn
                    break
            except:
                continue

        if download_btn:
            print("→ Clicking download button...")
            download_btn.click()
            page1.wait_for_timeout(2000)

        page1.screenshot(path="/tmp/qa-04-pre-checkout.png")

        # Check if we're on Stripe checkout
        print("→ Waiting for Stripe checkout...")
        page1.wait_for_timeout(3000)

        current_url = page1.url
        print(f"→ Current URL: {current_url}")

        if "checkout.stripe.com" in current_url:
            print("✅ Redirected to Stripe Checkout")
            page1.screenshot(path="/tmp/qa-05-stripe-checkout.png")

            # Enter promo code
            print(f"→ Entering promo code: {PROMO_CODE}")
            try:
                # Click "Add promotion code" link
                promo_link = page1.locator("text=Add promotion code").first
                if promo_link.is_visible(timeout=3000):
                    promo_link.click()
                    page1.wait_for_timeout(500)

                # Enter the code
                promo_input = page1.locator("input[name='promotionCode']").first
                if not promo_input.is_visible():
                    promo_input = page1.locator("[placeholder*='promo'], [placeholder*='code']").first

                promo_input.fill(PROMO_CODE)
                page1.wait_for_timeout(500)

                # Apply the code
                apply_btn = page1.locator("text=Apply").first
                if apply_btn.is_visible():
                    apply_btn.click()
                    page1.wait_for_timeout(2000)

                page1.screenshot(path="/tmp/qa-06-promo-applied.png")
                print("✅ Promo code applied")
            except Exception as e:
                print(f"⚠️ Promo code entry issue: {e}")

            # Fill email if required
            print("→ Filling checkout form...")
            try:
                email_input = page1.locator("input[type='email']").first
                if email_input.is_visible(timeout=2000):
                    email_input.fill("qa-test@starmapco.com")
            except:
                pass

            page1.screenshot(path="/tmp/qa-07-form-filled.png")

            # Since it's 100% off, there should be no card required
            # Look for a "Complete order" or similar button
            print("→ Looking for complete/submit button...")
            try:
                complete_btn = None
                for selector in ["text=Complete order", "text=Subscribe", "text=Pay", "button[type='submit']"]:
                    btn = page1.locator(selector).first
                    if btn.is_visible(timeout=1000):
                        complete_btn = btn
                        break

                if complete_btn:
                    complete_btn.click()
                    print("→ Clicked submit button, waiting for redirect...")
                    page1.wait_for_timeout(5000)
            except Exception as e:
                print(f"⚠️ Submit issue: {e}")

            page1.screenshot(path="/tmp/qa-08-post-submit.png")
        else:
            print("⚠️ Not on Stripe checkout, checking page state...")
            page1.screenshot(path="/tmp/qa-05-not-stripe.png")

        # Check final URL
        final_url = page1.url
        print(f"→ Final URL: {final_url}")

        # ========================================
        # Verify Stripe session count
        # ========================================
        print("\n📋 TEST 2: Verify single Stripe session creation")
        print("-" * 40)
        print(f"→ Total /api/checkout calls detected: {len(checkout_calls)}")
        for i, call in enumerate(checkout_calls):
            print(f"   Call {i+1}: {call['method']} at {call['time']}")

        if len(checkout_calls) == 1:
            print("✅ PASS: Only ONE Stripe session was created")
        elif len(checkout_calls) == 0:
            print("⚠️ No checkout calls detected (may have been cached or pre-existing session)")
        else:
            print(f"❌ FAIL: {len(checkout_calls)} checkout calls detected (expected 1)")

        page1.screenshot(path="/tmp/qa-09-success-page.png")

        # ========================================
        # TEST 3: Generate cross-device access link
        # ========================================
        print("\n📋 TEST 3: Generate cross-device access link")
        print("-" * 40)

        access_link = None

        # Check if we're on success page
        if "/success" in page1.url or "/download" in page1.url:
            print("→ On success/download page, looking for access link...")

            # Look for access link generation
            try:
                # Look for "Access on another device" or similar
                link_btn = page1.locator("text=Access on another device").first
                if not link_btn.is_visible(timeout=2000):
                    link_btn = page1.locator("text=Generate link").first
                if not link_btn.is_visible(timeout=2000):
                    link_btn = page1.locator("text=Share access").first

                if link_btn.is_visible():
                    link_btn.click()
                    page1.wait_for_timeout(2000)

                    # Look for the generated link
                    link_input = page1.locator("input[readonly]").first
                    if link_input.is_visible():
                        access_link = link_input.input_value()
                        print(f"✅ Access link generated: {access_link}")
            except Exception as e:
                print(f"⚠️ Could not find access link UI: {e}")

            page1.screenshot(path="/tmp/qa-10-access-link.png")
        else:
            print(f"⚠️ Not on success page. Current URL: {page1.url}")

        # ========================================
        # TEST 4: Test link on different device
        # ========================================
        print("\n📋 TEST 4: Test cross-device access link")
        print("-" * 40)

        if access_link:
            page2 = context2.new_page()
            print(f"→ Opening link in new browser context (simulating different device)...")
            print(f"→ URL: {access_link}")

            page2.goto(access_link, wait_until="networkidle")
            page2.wait_for_timeout(3000)
            page2.screenshot(path="/tmp/qa-11-device2-access.png")

            # Check if download is unlocked
            current_url2 = page2.url
            page_content = page2.content()

            if "Download" in page_content and "expired" not in page_content.lower():
                print("✅ PASS: Downloads appear to be unlocked on second device")
            else:
                print("⚠️ Need manual verification of download access")

            print(f"→ Second device URL: {current_url2}")
            page2.close()
        else:
            print("⚠️ SKIP: No access link was captured")

        # ========================================
        # TEST 5: Test expired/replaced link
        # ========================================
        print("\n📋 TEST 5: Test expired/replaced link message")
        print("-" * 40)

        if access_link and "/success" in page1.url or "/download" in page1.url:
            old_link = access_link

            # Generate a NEW link on original device
            print("→ Generating NEW link on original device to invalidate old one...")
            try:
                new_link_btn = page1.locator("text=New link").first
                if not new_link_btn.is_visible(timeout=2000):
                    new_link_btn = page1.locator("text=Generate new").first
                if not new_link_btn.is_visible(timeout=2000):
                    new_link_btn = page1.locator("text=Regenerate").first

                if new_link_btn.is_visible():
                    new_link_btn.click()
                    page1.wait_for_timeout(2000)
                    print("→ New link generated")
                    page1.screenshot(path="/tmp/qa-12-new-link.png")

                    # Now try the OLD link
                    print(f"→ Testing OLD link on different device: {old_link}")
                    page2 = context2.new_page()
                    page2.goto(old_link, wait_until="networkidle")
                    page2.wait_for_timeout(3000)
                    page2.screenshot(path="/tmp/qa-13-expired-link.png")

                    page_content = page2.content().lower()
                    if "expired" in page_content or "replaced" in page_content or "invalid" in page_content:
                        print("✅ PASS: Expired/replaced message shown for old link")
                    else:
                        print("⚠️ Need manual verification - check screenshot")
                        print(f"→ Page URL: {page2.url}")

                    page2.close()
                else:
                    print("⚠️ Could not find 'New link' button")
            except Exception as e:
                print(f"⚠️ Could not test expired link: {e}")
        else:
            print("⚠️ SKIP: Cannot test without access link")

        # ========================================
        # Summary
        # ========================================
        print("\n" + "="*60)
        print("QA TEST SUMMARY")
        print("="*60)
        print(f"Screenshots saved to /tmp/qa-*.png")
        print(f"Checkout API calls: {len(checkout_calls)}")
        print(f"Access link captured: {'Yes' if access_link else 'No'}")
        print("\n⚠️ MANUAL VERIFICATION NEEDED:")
        print("   1. Check /tmp/qa-*.png screenshots")
        print("   2. Verify Stripe dashboard shows single session")
        print("   3. Confirm download functionality works")
        print("="*60)

        # Keep browser open for manual inspection
        print("\n→ Browser will stay open for 30 seconds for manual inspection...")
        print("   Press Ctrl+C to close earlier.")
        try:
            page1.wait_for_timeout(30000)
        except KeyboardInterrupt:
            pass

        context1.close()
        context2.close()
        browser.close()

if __name__ == "__main__":
    run_stripe_qa()
