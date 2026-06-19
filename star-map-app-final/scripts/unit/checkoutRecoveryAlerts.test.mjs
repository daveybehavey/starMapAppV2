import assert from "node:assert/strict";
import test from "node:test";
import { getOfferLabel, getSubject, getIncludesBullets } from "./checkoutRecoveryAlerts.harness.mjs";

// ── getSubject ────────────────────────────────────────────────────────────────

test("subject: framed print includes urgency and 'saved'", () => {
  const subject = getSubject({ orderType: "print", printVariant: "poster_framed" });
  assert.ok(subject.includes("framed"), `subject should say framed: ${subject}`);
  assert.ok(subject.includes("saved"), `subject should say saved: ${subject}`);
});

test("subject: unframed print says saved", () => {
  const subject = getSubject({ orderType: "print", printVariant: "poster_unframed" });
  assert.ok(subject.includes("saved"), `subject should say saved: ${subject}`);
  assert.ok(!subject.includes("framed"), `unframed subject should not say framed: ${subject}`);
});

test("subject: digital HD download", () => {
  const subject = getSubject({ orderType: "digital", plan: "single" });
  assert.ok(subject.includes("download") || subject.includes("waiting"), `digital subject: ${subject}`);
});

test("subject: subscription says subscription", () => {
  const subject = getSubject({ orderType: "digital", plan: "subscription" });
  assert.ok(subject.includes("subscription"), `subscription subject: ${subject}`);
});

test("subject: unknown print variant falls back gracefully", () => {
  const subject = getSubject({ orderType: "print", printVariant: null });
  assert.ok(subject.includes("saved"), `null variant subject: ${subject}`);
  assert.ok(subject.length > 10);
});

// ── getOfferLabel ─────────────────────────────────────────────────────────────

test("offerLabel: framed without addon", () => {
  const label = getOfferLabel({ orderType: "print", printVariant: "poster_framed", includesDigitalAddOn: false });
  assert.equal(label, "framed print");
});

test("offerLabel: framed with HD addon", () => {
  const label = getOfferLabel({ orderType: "print", printVariant: "poster_framed", includesDigitalAddOn: true });
  assert.equal(label, "framed print + HD download");
});

test("offerLabel: digital single", () => {
  const label = getOfferLabel({ orderType: "digital", plan: "single" });
  assert.equal(label, "HD download");
});

test("offerLabel: pack3", () => {
  const label = getOfferLabel({ orderType: "digital", plan: "pack3" });
  assert.equal(label, "3 HD export credits");
});

// ── getIncludesBullets ────────────────────────────────────────────────────────

test("includesBullets: digital order returns empty array", () => {
  const bullets = getIncludesBullets({ orderType: "digital", plan: "single" });
  assert.deepEqual(bullets, []);
});

test("includesBullets: framed print without addon has 2 bullets", () => {
  const bullets = getIncludesBullets({ orderType: "print", printVariant: "poster_framed", includesDigitalAddOn: false });
  assert.equal(bullets.length, 2);
  assert.ok(bullets[0].toLowerCase().includes("framed"), `first bullet: ${bullets[0]}`);
  assert.ok(bullets[1].includes("saved"), `last bullet mentions saved: ${bullets[1]}`);
});

test("includesBullets: framed print with HD addon has 3 bullets", () => {
  const bullets = getIncludesBullets({ orderType: "print", printVariant: "poster_framed", includesDigitalAddOn: true });
  assert.equal(bullets.length, 3);
  assert.ok(bullets[1].toLowerCase().includes("hd"), `second bullet mentions HD: ${bullets[1]}`);
  assert.ok(bullets[1].includes("instantly"), `HD bullet mentions instant unlock: ${bullets[1]}`);
});

test("includesBullets: always ends with 'saved' reminder", () => {
  for (const variant of ["poster_framed", "poster_unframed", "canvas_wrap"]) {
    const bullets = getIncludesBullets({ orderType: "print", printVariant: variant, includesDigitalAddOn: false });
    assert.ok(bullets.at(-1)?.includes("saved"), `last bullet for ${variant}: ${bullets.at(-1)}`);
  }
});
