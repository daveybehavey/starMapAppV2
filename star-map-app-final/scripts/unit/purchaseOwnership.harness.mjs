import * as consent from "../../src/lib/purchaseAnalyticsConsent.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

async function load(file, globals, imports) {
  const context = vm.createContext(globals);
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const stub = (name) => {
    if (name === "./purchaseAnalyticsConsent.mjs") imports[name] = consent;
    assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
    const exports = imports[name];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  };
  const mod = new vm.SourceTextModule(source, { context, importModuleDynamically: async (name) => {
    const m = stub(name); await m.link(() => {}); await m.evaluate(); return m;
  } });
  await mod.link(stub); await mod.evaluate(); return mod.namespace;
}

for (const ga4Server of ["true", "false"]) {
  for (const consent of ["true", "false"]) {
    const captures = [], ga = [], layer = [];
    const storage = new Map([["analytics-consent", consent]]);
    const sessionStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
    const api = await load("../../src/lib/analytics.ts", {
      process: { env: { NEXT_PUBLIC_GA4_SERVER_PURCHASES: ga4Server } },
      window: { navigator: {}, location: { pathname: "/success" }, localStorage: sessionStorage, gtag: (...args) => ga.push(args) },
      navigator: {}, localStorage: sessionStorage, sessionStorage, console, setTimeout,
    }, {
      "./googleTagManager": { pushDataLayer: event => layer.push(event) },
      "./marketingAttributionGa4": { buildGa4MarketingParams: () => ({}) },
      "./pinterestTag": { trackPinterestAddToCart: () => {}, trackPinterestCheckout: () => {}, trackPinterestPageView: () => {} },
      "posthog-js": { default: { capture: (...args) => captures.push(args) } },
    });
    api.trackPurchaseCompleted({ transactionId: "cs_test_synthetic", value: 9, currency: "usd", plan: "single" });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(captures.filter(([event]) => event === "purchase").length, 0);
    assert.equal(layer.filter(x => x.event === "purchase").length, consent === "true" ? 1 : 0);
    assert.equal(ga.filter(([,event]) => event === "purchase").length, consent === "true" && ga4Server === "false" ? 1 : 0);
  }
}

const events = [], store = new Map();
let fail = true;
const server = await load("../../src/lib/posthogServerPurchase.ts", {
  process: { env: { NEXT_PUBLIC_POSTHOG_KEY: "synthetic-project-key" } }, URL, console,
  fetch: async (_url, init) => { events.push(JSON.parse(init.body)); return { ok: !fail, status: fail ? 503 : 200 }; },
}, { "./kv": { kv: { get: async k => store.get(k), incr: async k => store.set(k, 1) } } });
const input = { analyticsConsent: "granted-v1", transactionId: "cs_test_synthetic", value: 9, currency: "usd" };
assert.equal((await server.recordPosthogPurchaseOnce(input)).recorded, false);
fail = false;
assert.equal((await server.recordPosthogPurchaseOnce(input)).recorded, true);
assert.equal((await server.recordPosthogPurchaseOnce(input)).reason, "duplicate");
assert.equal(events.length, 2);
assert.equal(events[0].properties.$insert_id, events[1].properties.$insert_id);
assert.equal(events[0].distinct_id, events[1].distinct_id);
console.log("purchase ownership: consent x GA4 mode, server retry and dedupe PASS");
