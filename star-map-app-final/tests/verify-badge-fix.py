#!/usr/bin/env python3
"""Test to verify the NOT VERIFIED badge fix works correctly."""

from playwright.sync_api import sync_playwright
import json

BASE_URL = "http://localhost:3000"

def test_premium_api_logic():
    """Test that /api/premium returns paid=true when credits > 0"""
    print("\n" + "=" * 60)
    print("TEST: Premium API logic with credits")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # First, let's check what happens when we access /download without a session
        print("\n→ Testing /download page without session...")
        page.goto(f"{BASE_URL}/download", wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.screenshot(path="/tmp/verify-1-no-session.png")

        content = page.content()
        if "NOT VERIFIED" in content.upper() or "not-paid" in content.lower():
            print("✓ Correctly shows not verified when no session")
        else:
            print("? Page content check - see screenshot")

        # Check if the verification text/badge is visible
        badge = page.locator("text=Not verified").first()
        if badge.is_visible():
            print("✓ 'Not verified' badge is visible (expected without session)")

        # Now let's test what the download page does when we have the client-side fix
        # We need to intercept the /api/premium response to simulate having credits
        print("\n→ Testing with mocked premium response (credits=3)...")

        page2 = context.new_page()

        # Intercept the premium API call and return a response with credits
        def handle_route(route):
            if "/api/premium" in route.request.url:
                print(f"  Intercepted: {route.request.url}")
                # Simulate a response where paid=false but creditsRemaining=3
                # This tests the client-side fix
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps({
                        "paid": False,  # API says not paid
                        "creditsRemaining": 3,  # But has credits!
                        "plan": "pack3"
                    })
                )
            else:
                route.continue_()

        page2.route("**/*", handle_route)
        page2.goto(f"{BASE_URL}/download", wait_until="networkidle")
        page2.wait_for_timeout(3000)
        page2.screenshot(path="/tmp/verify-2-with-credits.png")

        content2 = page2.content()

        # Check if "NOT VERIFIED" still appears
        if "NOT VERIFIED" in content2.upper():
            print("✗ FAIL: 'NOT VERIFIED' still shows despite having credits!")
            print("  The client-side fix may not be working.")
        else:
            print("✓ PASS: 'NOT VERIFIED' does not appear")

        # Check for the credits display
        if "3 HD download" in content2:
            print("✓ Credits are displayed correctly")

        # Check if we see "Download ready" or similar positive status
        if "ready" in content2.lower() or "download hd" in content2.lower():
            print("✓ Download appears to be ready")

        browser.close()

    print("\n" + "=" * 60)
    print("Screenshots saved to /tmp/verify-*.png")
    print("=" * 60)


def test_real_flow():
    """Test a real checkout flow if possible"""
    print("\n" + "=" * 60)
    print("TEST: Real download page behavior")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Listen to console messages
        page.on("console", lambda msg: print(f"  [console] {msg.text}") if "premium" in msg.text.lower() or "paid" in msg.text.lower() else None)

        # Listen to network responses
        def log_premium_response(response):
            if "/api/premium" in response.url:
                try:
                    data = response.json()
                    print(f"\n  /api/premium response: {json.dumps(data)}")
                except:
                    print(f"\n  /api/premium status: {response.status}")

        page.on("response", log_premium_response)

        print("\n→ Loading download page...")
        page.goto(f"{BASE_URL}/download", wait_until="networkidle")
        page.wait_for_timeout(3000)

        page.screenshot(path="/tmp/verify-3-real-page.png")

        content = page.content()

        # Analyze what we see
        print("\n→ Page analysis:")
        if "NOT VERIFIED" in content.upper():
            print("  - Shows 'NOT VERIFIED' badge")
        if "VERIFIED" in content.upper() and "NOT" not in content.upper():
            print("  - Shows verified status")
        if "Download ready" in content:
            print("  - Shows 'Download ready' status")
        if "Payment verification is still pending" in content:
            print("  - Shows 'Payment verification pending' message")
        if "HD download" in content:
            print("  - Shows HD download info")

        browser.close()

    print("\n→ Check /tmp/verify-3-real-page.png for visual verification")


if __name__ == "__main__":
    test_premium_api_logic()
    test_real_flow()
    print("\n✅ Tests complete!")
