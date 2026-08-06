import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");
const DIAGNOSTICS = path.join(ROOT, "src/lib/checkoutDiagnostics.ts");

/**
 * Mirror of shouldRecordBuyerCheckoutFailure — kept in lockstep with checkoutDiagnostics.ts.
 * Authenticated QA must not write ordinary-buyer checkout failure diagnostics.
 * @param {{ enabled?: boolean } | null | undefined} qaContext
 */
function shouldRecordBuyerCheckoutFailure(qaContext) {
  return qaContext?.enabled !== true;
}

test("shouldRecordBuyerCheckoutFailure is false for authenticated QA and true for ordinary buyers", () => {
  assert.equal(
    shouldRecordBuyerCheckoutFailure({ enabled: true, source: "live_print", status: "enabled" }),
    false
  );
  assert.equal(shouldRecordBuyerCheckoutFailure({ enabled: false, source: null, status: "absent" }), true);
  assert.equal(
    shouldRecordBuyerCheckoutFailure({ enabled: false, source: null, status: "unauthorized" }),
    true
  );
  assert.equal(shouldRecordBuyerCheckoutFailure(null), true);
  assert.equal(shouldRecordBuyerCheckoutFailure(undefined), true);
  assert.equal(shouldRecordBuyerCheckoutFailure({}), true);

  const diagnostics = fs.readFileSync(DIAGNOSTICS, "utf8");
  assert.match(diagnostics, /qaContext\?\.enabled !== true/);
  assert.match(
    diagnostics,
    /export function shouldRecordBuyerCheckoutFailure\([\s\S]*?return qaContext\?\.enabled !== true;/
  );
});

test("recordBuyerCheckoutFailure skips KV writes when QA is enabled", () => {
  const diagnostics = fs.readFileSync(DIAGNOSTICS, "utf8");
  assert.match(diagnostics, /export async function recordBuyerCheckoutFailure/);
  assert.match(
    diagnostics,
    /if\s*\(\s*!shouldRecordBuyerCheckoutFailure\(qaContext\)\s*\)\s*return;\s*await recordCheckoutFailure\(input\)/
  );
  // Gate closed for enabled QA ⇒ ordinary buyer recorder is not invoked.
  assert.equal(shouldRecordBuyerCheckoutFailure({ enabled: true }), false);
  // Gate open for ordinary buyers ⇒ recorder remains reachable.
  assert.equal(shouldRecordBuyerCheckoutFailure({ enabled: false }), true);
});

test("checkout route isolates QA failures from buyer diagnostics on POST and GET catch families", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  const diagnostics = fs.readFileSync(DIAGNOSTICS, "utf8");

  assert.match(diagnostics, /export function shouldRecordBuyerCheckoutFailure/);
  assert.match(diagnostics, /export async function recordBuyerCheckoutFailure/);

  // Checkout API must use the QA-aware helper — not bare recordCheckoutFailure.
  assert.match(route, /recordBuyerCheckoutFailure/);
  assert.equal(route.includes("recordCheckoutFailure("), false);
  assert.match(route, /import \{ recordBuyerCheckoutFailure \} from "@\/lib\/checkoutDiagnostics"/);

  const postIdx = route.indexOf("export async function POST");
  const getIdx = route.indexOf("export async function GET");
  assert.ok(postIdx > 0 && getIdx >= 0);
  const getSection = route.slice(getIdx, postIdx);
  const postSection = route.slice(postIdx);

  const getCalls = getSection.match(/recordBuyerCheckoutFailure\(qaContext,/g) || [];
  const postCalls = postSection.match(/recordBuyerCheckoutFailure\(qaContext,/g) || [];
  assert.ok(
    getCalls.length >= 3,
    `GET catch family expected >=3 buyer failure writes, got ${getCalls.length}`
  );
  assert.ok(
    postCalls.length >= 3,
    `POST catch family expected >=3 buyer failure writes, got ${postCalls.length}`
  );
  assert.match(getSection, /checkout_api_digital_get/);
  assert.match(getSection, /checkout_api_print_get/);
  assert.match(postSection, /checkout_api_digital_post/);
  assert.match(postSection, /checkout_api_print_post/);

  // Funnel exclusion for QA successes remains in place.
  assert.match(route, /if\s*\(\s*!qaContext\.enabled\s*\)\s*\{\s*\n\s*await recordFunnelStep/);
});
