import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as consent from "../../src/lib/purchaseAnalyticsConsent.mjs";
import { redirectToStripeCheckout } from "../../src/lib/stripeCheckoutNavigation.ts";

// Execute the actual React callback bodies, without copying their implementation.
// Only rendering, network and UI state boundaries are synthetic. AST extraction
// avoids invoking unrelated component effects/JSX in a Node route regression.
function callback(file, name) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(new URL(file, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name)
      found = node.initializer.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, name);
  return (
    ts.transpileModule(`const handler = ${found};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
      .outputText + "\n handler;"
  );
}
const analyticsSource = ts.createSourceFile(
  "analytics.ts",
  fs.readFileSync(new URL("../../src/lib/analytics.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
const names = [
  "getCheckoutAnalyticsConsent",
  "canTrackAnalytics",
  "hasAnalyticsConsent",
  "isDoNotTrackEnabled",
];
const consentCode = analyticsSource.statements
  .filter((n) => ts.isFunctionDeclaration(n) && names.includes(n.name.text))
  .map((n) => n.getText(analyticsSource).replace(/^export /, ""))
  .join("\n");
const compiledConsent = ts.transpileModule(consentCode, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const mapId = "123e4567-e89b-42d3-a456-426614174000";
for (const entry of ["success", "download"]) {
  for (const state of ["missing", "declined", "invalid", "dnt", "granted"]) {
    test(`${entry} actual checkout callback preserves explicit ${state} consent`, async () => {
      const requests = [],
        navigations = [],
        errors = [];
      let value =
        state === "missing" ? null : state === "declined" ? "false" : state === "invalid" ? "yes" : "true";
      const storage = { getItem: () => value };
      const noop = () => {};
      const url = "https://checkout.stripe.com/pay/cs_test_synthetic#preserved";
      const globals = {
        ...consent,
        ANALYTICS_STORAGE_KEY: "analytics-consent",
        localStorage: storage,
        window: {
          navigator: { doNotTrack: state === "dnt" ? "1" : "0" },
          location: { assign: (u) => navigations.push(u) },
        },
        digitalAddOnLoading: false,
        pauseRedirect: noop,
        setDigitalAddOnLoading: noop,
        setMessage: (x) => {
          if (x) errors.push(x);
        },
        track: noop,
        trackFunnelStep: noop,
        trackBeginCheckout: noop,
        trackCheckoutClientDiagnostic: noop,
        trackSelectItem: noop,
        resolvedMapId: mapId,
        readStoredMapId: () => mapId,
        createCheckoutHandoffToken: () => "b1234567890abcdef",
        orderType: "print",
        printVariant: "poster_framed",
        printCheckoutInFlightRef: { current: false },
        printCheckoutEnabled: true,
        setPrintCheckoutError: (x) => {
          if (x) errors.push(x);
        },
        setPrintCheckoutLoading: noop,
        PAYWALL_PRINT_VARIANT_ORDER: ["poster_framed"],
        printShippingCountry: "CA",
        readStoredPrintShippingCountry: () => "CA",
        mapIdFromUrl: mapId,
        recipe: { shape: "circle" },
        readDraft: () => null,
        // Change the browser preference during asynchronous print preparation.
        ensureFontsLoaded: async () => {
          value = value === "true" ? "false" : "true";
        },
        resolveShapeAndRatio: async () => ({ shape: "circle", ratio: 1 }),
        document: { createElement: () => ({ toDataURL: () => "data:image/jpeg;base64,synthetic" }) },
        renderStarMap: async () => {},
        estimateDataUrlBytes: () => 20,
        MAX_PRINT_ASSET_BYTES: 100,
        fetch: async (path, init) => {
          if (path === "/api/print/assets")
            return { ok: true, json: async () => ({ assetId: "asset-synthetic" }) };
          assert.equal(path, "/api/checkout");
          requests.push(JSON.parse(init.body));
          return { ok: true, json: async () => ({ url }) };
        },
      };
      globals.redirectToStripeCheckout = (u) => {
        globalThis.window = globals.window;
        try {
          redirectToStripeCheckout(u);
        } finally {
          delete globalThis.window;
        }
      };
      const context = vm.createContext(globals);
      vm.runInContext(compiledConsent, context);
      const file =
        entry === "success"
          ? "../../src/app/success/SuccessClient.tsx"
          : "../../src/app/download/DownloadClient.tsx";
      const handler = vm.runInContext(
        callback(file, entry === "success" ? "handleAddDigitalDownload" : "handlePrintCheckout"),
        context
      );
      await handler("poster_framed");
      assert.deepEqual(errors, []);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].analyticsConsent, state === "granted" ? "granted-v1" : "not-granted");
      assert.equal(requests[0].mapId, mapId);
      assert.equal(requests[0].checkoutHandoff, "b1234567890abcdef");
      assert.deepEqual(navigations, [url]);
      if (entry === "download") {
        assert.equal(requests[0].printAssetId, "asset-synthetic");
        assert.equal(requests[0].shippingCountry, "CA");
      }
    });
  }
}
