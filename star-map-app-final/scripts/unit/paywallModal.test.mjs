/**
 * paywallModal.test.mjs
 *
 * Unit tests for pure logic extracted from PaywallModal.tsx.
 * Run with: node --test scripts/unit/paywallModal.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getBullets, getTabOrder, getInitialActiveIntent } from "./paywallModal.harness.mjs";

// ── getBullets ──────────────────────────────────────────────────────────────

describe("getBullets", () => {
  it("returns 4 digital bullets when activeIntent is 'digital'", () => {
    const bullets = getBullets("digital");
    assert.equal(bullets.length, 4);
  });

  it("digital bullets mention high resolution", () => {
    const bullets = getBullets("digital");
    assert.ok(bullets.some((b) => b.includes("6,000 px")), "should mention 6,000 px resolution");
  });

  it("digital bullets mention no watermark", () => {
    const bullets = getBullets("digital");
    assert.ok(bullets.some((b) => b.toLowerCase().includes("watermark")));
  });

  it("digital bullets mention instant download", () => {
    const bullets = getBullets("digital");
    assert.ok(bullets.some((b) => b.toLowerCase().includes("instant download")));
  });

  it("returns 4 print bullets when activeIntent is 'print'", () => {
    const bullets = getBullets("print");
    assert.equal(bullets.length, 4);
  });

  it("print bullets mention shipped to your door", () => {
    const bullets = getBullets("print");
    assert.ok(bullets.some((b) => b.toLowerCase().includes("shipped")));
  });

  it("print bullets mention production review", () => {
    const bullets = getBullets("print");
    assert.ok(bullets.some((b) => b.toLowerCase().includes("production reviewed")));
  });

  it("print bullets do NOT mention '6,000 px'", () => {
    const bullets = getBullets("print");
    assert.ok(!bullets.some((b) => b.includes("6,000 px")), "print bullets should not show digital resolution claim");
  });

  it("print bullets do NOT mention watermark", () => {
    const bullets = getBullets("print");
    assert.ok(!bullets.some((b) => b.toLowerCase().includes("watermark")), "print bullets should not mention watermark");
  });

  it("both variants include a secure checkout bullet", () => {
    for (const intent of /** @type {const} */ (["digital", "print"])) {
      const bullets = getBullets(intent);
      assert.ok(bullets.some((b) => b.toLowerCase().includes("secure checkout")), `${intent} bullets should include secure checkout`);
    }
  });
});

// ── getTabOrder ─────────────────────────────────────────────────────────────

describe("getTabOrder", () => {
  it("digital-intent: first tab is Digital HD", () => {
    const tabs = getTabOrder("digital");
    assert.equal(tabs[0].id, "digital");
    assert.equal(tabs[0].label, "Digital HD");
  });

  it("digital-intent: second tab is Printed gift", () => {
    const tabs = getTabOrder("digital");
    assert.equal(tabs[1].id, "print");
    assert.equal(tabs[1].label, "Printed gift");
  });

  it("print-intent: first tab is Printed gift", () => {
    const tabs = getTabOrder("print");
    assert.equal(tabs[0].id, "print");
    assert.equal(tabs[0].label, "Printed gift");
  });

  it("print-intent: second tab is Digital HD", () => {
    const tabs = getTabOrder("print");
    assert.equal(tabs[1].id, "digital");
    assert.equal(tabs[1].label, "Digital HD");
  });

  it("always returns exactly 2 tabs", () => {
    for (const intent of /** @type {const} */ (["digital", "print"])) {
      assert.equal(getTabOrder(intent).length, 2);
    }
  });
});

// ── getInitialActiveIntent ──────────────────────────────────────────────────

describe("getInitialActiveIntent", () => {
  it("starts on 'print' when hasPrintOptions=true and purchaseIntent='print'", () => {
    assert.equal(getInitialActiveIntent(true, "print"), "print");
  });

  it("starts on 'digital' when hasPrintOptions=false even if purchaseIntent='print'", () => {
    assert.equal(getInitialActiveIntent(false, "print"), "digital");
  });

  it("starts on 'digital' when purchaseIntent='digital'", () => {
    assert.equal(getInitialActiveIntent(true, "digital"), "digital");
  });

  it("starts on 'digital' when hasPrintOptions=false and purchaseIntent='digital'", () => {
    assert.equal(getInitialActiveIntent(false, "digital"), "digital");
  });
});
