import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildEditorAction, buildQuickStartHref } from "./previewStartNavigation.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

function paramsFromHref(href) {
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

/**
 * What a native GET submission does with the pre-fix form: the browser
 * replaces the formAction query string with the serialized named
 * controls. This is the B2-01 defect, modelled so the regression tests
 * below can assert the fixed navigation does NOT behave this way.
 */
function nativeGetUrl(formAction, fields) {
  const pathOnly = formAction.split("?")[0];
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value) params.set(key, value);
  }
  return `${pathOnly}?${params.toString()}`;
}

const FIELDS = { date: "2024-03-15", location: "Victoria" };

test("B2-01 regression model: native GET drops the intent query (the audited defect)", () => {
  const formAction = buildEditorAction("shop-framed", "print", "poster_framed", false, false);
  const native = paramsFromHref(nativeGetUrl(formAction, FIELDS));
  // The measured audit result: /editor?date=2024-03-15&location=Victoria
  assert.equal(native.get("date"), "2024-03-15");
  assert.equal(native.get("location"), "Victoria");
  assert.equal(native.get("checkout"), null);
  assert.equal(native.get("print_variant"), null);
  assert.equal(native.get("source"), null);
  assert.equal(native.get("mode"), null);
});

test("framed print intent survives: intent params AND fields in one navigation URL", () => {
  const href = buildQuickStartHref(FIELDS, {
    source: "shop-framed",
    checkout: "print",
    printVariant: "poster_framed",
  });
  const params = paramsFromHref(href);
  assert.match(href, /^\/editor\?/);
  assert.equal(params.get("mode"), "quick");
  assert.equal(params.get("source"), "shop-framed");
  assert.equal(params.get("checkout"), "print");
  assert.equal(params.get("print_variant"), "poster_framed");
  assert.equal(params.get("date"), "2024-03-15");
  assert.equal(params.get("location"), "Victoria");
  assert.equal(params.get("include_digital_addon"), null);
  assert.equal(params.get("include_card_addon"), null);
  assert.equal(params.get("lat"), null);
  assert.equal(params.get("lon"), null);
  assert.equal(params.get("tz"), null);
});

test("digital intent survives without a print variant", () => {
  const href = buildQuickStartHref(FIELDS, {
    source: "hero-digital",
    checkout: "digital",
  });
  const params = paramsFromHref(href);
  assert.equal(params.get("checkout"), "digital");
  assert.equal(params.get("print_variant"), null);
  assert.equal(params.get("date"), "2024-03-15");
  assert.equal(params.get("location"), "Victoria");
});

test("add-on intent survives alongside the print variant", () => {
  const href = buildQuickStartHref(FIELDS, {
    source: "shop-framed-bundle",
    checkout: "print",
    printVariant: "poster_framed",
    includeDigitalAddOn: true,
    includeCardAddOn: true,
  });
  const params = paramsFromHref(href);
  assert.equal(params.get("checkout"), "print");
  assert.equal(params.get("print_variant"), "poster_framed");
  assert.equal(params.get("include_digital_addon"), "1");
  assert.equal(params.get("include_card_addon"), "1");
});

test("neutral preview path: no checkout intent, fields and attribution still carried", () => {
  const href = buildQuickStartHref(FIELDS, { source: "preview-start-form" });
  const params = paramsFromHref(href);
  assert.equal(params.get("mode"), "quick");
  assert.equal(params.get("source"), "preview-start-form");
  assert.equal(params.get("checkout"), null);
  assert.equal(params.get("print_variant"), null);
  assert.equal(params.get("date"), "2024-03-15");
  assert.equal(params.get("location"), "Victoria");
});

test("city-prefill coordinates ride along with the intent", () => {
  const href = buildQuickStartHref(
    {
      date: "2024-12-25",
      location: "Victoria, BC",
      lat: "48.4284",
      lon: "-123.3656",
      tz: "America/Vancouver",
    },
    { source: "city-victoria-framed", checkout: "print", printVariant: "poster_framed" }
  );
  const params = paramsFromHref(href);
  assert.equal(params.get("checkout"), "print");
  assert.equal(params.get("print_variant"), "poster_framed");
  assert.equal(params.get("location"), "Victoria, BC");
  assert.equal(params.get("lat"), "48.4284");
  assert.equal(params.get("lon"), "-123.3656");
  assert.equal(params.get("tz"), "America/Vancouver");
});

test("empty/absent fields are omitted, never serialized as empty params", () => {
  const href = buildQuickStartHref(
    { date: "2024-03-15", location: "Victoria", lat: null, lon: undefined, tz: "" },
    { source: "shop-framed", checkout: "print", printVariant: "poster_framed" }
  );
  const params = paramsFromHref(href);
  assert.equal(params.has("lat"), false);
  assert.equal(params.has("lon"), false);
  assert.equal(params.has("tz"), false);
});

test("source pins: component navigates in script and keeps the no-JS native fallback", () => {
  const component = readSrc("components/PreviewStartForm.tsx");

  // The successful submit path must build the merged URL and navigate to
  // it instead of falling through to the native GET submission.
  assert.match(component, /export function buildQuickStartHref/);
  assert.match(component, /window\.location\.assign\(/);
  assert.match(component, /buildQuickStartHref\(/);
  assert.match(component, /event\.preventDefault\(\);\s*\n\s*window\.location\.assign\(/);

  // Validation still blocks an incomplete submit before any navigation.
  const validationIndex = component.indexOf('setValidationMessage("Enter date and location first.")');
  const navigateIndex = component.indexOf("window.location.assign(");
  assert.ok(validationIndex >= 0 && navigateIndex > validationIndex);

  // No-JS fallback deliberately preserved: native GET form whose buttons
  // still carry the intent in their formAction URL.
  assert.match(component, /<form action="\/editor" method="GET"/);
  assert.match(component, /formAction=\{buildEditorAction\(/);

  // Add-on intent must be readable from the submitter, like the other
  // intent fields already were.
  assert.match(component, /data-include-digital-addon=\{intent\.includeDigitalAddOn \? "1" : undefined\}/);
  assert.match(component, /data-include-card-addon=\{intent\.includeCardAddOn \? "1" : undefined\}/);
  assert.match(component, /submitter\?\.dataset\.includeDigitalAddon === "1"/);
  assert.match(component, /submitter\?\.dataset\.includeCardAddon === "1"/);

  // Param names the editor actually parses (EditorExperience reads
  // checkout / print_variant / include_digital_addon).
  assert.match(component, /params\.set\("checkout", checkout\)/);
  assert.match(component, /params\.set\("print_variant", printVariant\)/);
  assert.match(component, /params\.set\("include_digital_addon", "1"\)/);
  assert.match(component, /params\.set\("include_card_addon", "1"\)/);
});
