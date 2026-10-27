/**
 * Persona sweep U18 (fleet PR #15): /shop card polish.
 *
 * - Kiss-cut stickers are listed once (the "Stickers & small merch"
 *   section is the canonical merch home), not again in the print grid.
 * - The mug card carries straightforward product copy — the internal
 *   "not the wedding hero" phrasing is gone.
 * - The five Printful card renders are framed for the 4:3 cover slot:
 *   the pins set is fully inside the frame (no pin clipped at the
 *   edges), the sticker shows its whole kiss-cut border, the magnet
 *   crop is tight on the disc, and the tee/hoodie crops centre the
 *   chest print. All five assets are exactly 4:3 so object-cover shows
 *   the framed composition unchanged.
 *
 * Amended 2026-10-27 (owner-reported /shop defect): the raw pins and
 * sticker renders still read wrong at card size — in pins-printful the
 * square design overflows each round button's face (the design title
 * is clipped by the circular edge) and the five buttons sit in a thin
 * band; in sticker-printful the disc floats small in the frame. Both
 * now use the square "-starmap" renders, which show the product large
 * with the design fitted inside its face. The pins render keeps cover
 * (the buttons sit inside the central 4:3 window of the square frame);
 * the sticker render is "contain" so its whole kiss-cut border stays
 * visible. Magnet/tee/hoodie keep their exactly-4:3 raw renders.
 *
 * Image checks parse the real JPEG dimensions; copy/wiring is pinned
 * from source, per repo convention.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const shop = read("src/app/shop/page.tsx");

/* ---------- Item 5: mug copy ---------- */

test("U18: mug card copy is straightforward product copy", () => {
  assert.ok(!shop.includes("wedding hero"), 'shop page must not contain "wedding hero"');
  assert.match(shop, /detail: "Your star map on a black glossy 11 oz mug/);
});

/* ---------- Item 4: stickers listed once ---------- */

test("U18: kiss-cut stickers appear once on /shop — in the merch section", () => {
  // The render file is referenced exactly once (merchShopImage), the
  // grid card + its editor href are gone, and the merch section still
  // maps every enabled family through merchShopImage.
  assert.equal(shop.split("sticker-starmap.jpg").length - 1, 1);
  assert.ok(!shop.includes('key: "stickers"'));
  assert.ok(!shop.includes("source=shop-sticker&"));
  assert.match(shop, /merchFamilies\.map\(\(family\)/);
  assert.match(shop, /case "sticker_kisscut":/);
});

/* ---------- Item 1: pins alt matches the photo ---------- */

test("U18: pins alt text describes the front-and-back photo", () => {
  assert.match(shop, /alt: "Pin-back button with an example star map design, shown from the front/);
});

/* ---------- Items 1–3: card renders framed for the 4:3 slot ---------- */

function jpegDimensions(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8);
  let offset = 2;
  while (offset < buf.length) {
    assert.equal(buf[offset], 0xff);
    const marker = buf[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  throw new Error(`no SOF marker in ${rel}`);
}

const EXPECTED_CARD_RENDERS = {
  "public/printproof/gift-raw/magnet/magnet-printful.jpg": { width: 1200, height: 900 },
  "public/printproof/gift-raw/tshirt/tee-printful.jpg": { width: 1100, height: 825 },
  "public/printproof/gift-raw/hoodie/hoodie-printful.jpg": { width: 1000, height: 750 },
};

for (const [rel, expected] of Object.entries(EXPECTED_CARD_RENDERS)) {
  test(`U18: ${path.basename(rel)} is framed 4:3 for the card slot`, () => {
    const dims = jpegDimensions(rel);
    assert.deepEqual(dims, expected);
    assert.equal(dims.width * 3, dims.height * 4, "card renders are exactly 4:3");
  });
}

/* The pins/sticker "-starmap" renders are square; the shop references
 * each exactly once. Their composition (product large, design fitted
 * inside the product's face) is screenshot-verified in the fix PR. */
const EXPECTED_STARMAP_RENDERS = {
  "public/printproof/gift-raw/pins/pins-starmap.jpg": { width: 1200, height: 1200 },
  "public/printproof/gift-raw/sticker/sticker-starmap.jpg": { width: 600, height: 600 },
};

for (const [rel, expected] of Object.entries(EXPECTED_STARMAP_RENDERS)) {
  test(`U18: ${path.basename(rel)} is the square starmap render used by /shop`, () => {
    const dims = jpegDimensions(rel);
    assert.deepEqual(dims, expected);
    assert.equal(shop.split(path.basename(rel)).length - 1, 1, "/shop references the render exactly once");
  });
}
