import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { withEditorLocation } from "./editorLocationPrefill.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

function locationFromHref(href) {
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("location");
}

test("withEditorLocation encodes spaces and punctuation for editor contract", () => {
  const href = withEditorLocation(
    "/editor?mode=quick&source=city-new-york-ny-framed",
    "New York, NY"
  );
  assert.match(href, /^\/editor\?/);
  assert.equal(locationFromHref(href), "New York, NY");
  assert.match(href, /location=New\+York%2C\+NY|location=New%20York%2C%20NY/);

  const punctuated = withEditorLocation(
    "/editor?mode=quick&source=city-st-louis-mo",
    "St. Louis, MO"
  );
  assert.equal(locationFromHref(punctuated), "St. Louis, MO");
  assert.match(punctuated, /St\.|St%2E/);

  const apostrophe = withEditorLocation("/editor?mode=quick&source=city-test", "O'Fallon, IL");
  assert.equal(locationFromHref(apostrophe), "O'Fallon, IL");
});

test("withEditorLocation preserves existing query params and replaces prior location", () => {
  const href = withEditorLocation(
    "/editor?mode=quick&source=sticky-city-miami-fl&checkout=print&print_variant=poster_framed",
    "Miami, FL"
  );
  const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  assert.equal(params.get("mode"), "quick");
  assert.equal(params.get("source"), "sticky-city-miami-fl");
  assert.equal(params.get("checkout"), "print");
  assert.equal(params.get("print_variant"), "poster_framed");
  assert.equal(params.get("location"), "Miami, FL");

  const replaced = withEditorLocation(
    "/editor?mode=quick&location=Wrong+City&source=city-test",
    "Paris, France"
  );
  assert.equal(locationFromHref(replaced), "Paris, France");
});

test("withEditorLocation is a no-op for empty location (non-city / generic paths)", () => {
  const base = "/editor?mode=quick&source=star-map-in-hub";
  assert.equal(withEditorLocation(base, undefined), base);
  assert.equal(withEditorLocation(base, null), base);
  assert.equal(withEditorLocation(base, ""), base);
  assert.equal(withEditorLocation(base, "   "), base);
  assert.equal(locationFromHref(withEditorLocation(base, undefined)), null);
});

test("PreviewStartForm prefills via editable defaultValue and never locks the field", () => {
  const source = readSrc("components/PreviewStartForm.tsx");
  assert.match(source, /defaultLocation\?: string/);
  assert.match(source, /defaultValue=\{defaultLocation\?\.trim\(\) \|\| undefined\}/);
  assert.match(source, /id="preview-location"/);
  assert.match(source, /name="location"/);
  assert.doesNotMatch(source, /id="preview-location"[\s\S]{0,400}\breadOnly\b/);
  assert.doesNotMatch(source, /id="preview-location"[\s\S]{0,400}\bdisabled\b/);
  assert.doesNotMatch(source, /id="preview-location"[\s\S]{0,400}\breadonly\b/i);
});

test("city landing page wires location into primary CTAs and PreviewStartForm", () => {
  const page = readSrc("app/star-map-in/[slug]/page.tsx");
  assert.match(page, /from "@\/lib\/editorLocationPrefill"/);
  assert.match(page, /defaultLocation=\{display\}/);
  assert.match(page, /framedCtaHref = withEditorLocation\(/);
  assert.match(page, /stickyPrimaryHref = withEditorLocation\(/);
  assert.match(page, /<StickyCtaBar source=\{stickySource\} primaryHref=\{stickyPrimaryHref\}/);
  assert.match(page, /location=\{display\}/);
  assert.match(page, /href=\{framedCtaHref\}/);
});

test("generic / non-city entry paths do not force a city defaultLocation", () => {
  const hub = readSrc("app/star-map-in/page.tsx");
  assert.doesNotMatch(hub, /defaultLocation=/);
  assert.doesNotMatch(hub, /withEditorLocation/);
  assert.match(hub, /source="star-map-in-hub"/);

  const wedding = readSrc("app/wedding/page.tsx");
  assert.doesNotMatch(wedding, /defaultLocation=/);

  const gallery = readSrc("app/star-map-gallery/page.tsx");
  assert.doesNotMatch(gallery, /defaultLocation=/);

  const delivery = readSrc("components/DeliveryFormatModule.tsx");
  assert.match(delivery, /location\?: string/);
  assert.match(delivery, /withEditorLocation\(/);
  // Optional prop only — callers without location keep prior hrefs.
  assert.match(delivery, /location,/);
});
