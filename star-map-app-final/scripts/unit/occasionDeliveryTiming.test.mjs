/**
 * W45-4 remaining gaps (post-#474): gap 2 — neither occasion page stated a
 * numeric delivery window (only "carrier transit varies by destination");
 * gap 6 — milestone birthdays existed only inside one /birthday FAQ answer,
 * with no content block. Pins:
 *  - the labeled-example delivery line is composed from the canonical
 *    commerce-facts constants (production + the U.S. transit EXAMPLE, always
 *    labeled, never a silent generic default) and keeps the estimates
 *    disclaimer;
 *  - /anniversary and /birthday both render the numeric window up front,
 *    link to /shipping for destination ranges, and carry a delivery-timing
 *    FAQ fed from the same composed line;
 *  - /birthday carries the milestone-birthdays content block.
 * Behaviour assertions run against the commerce-facts harness mirror (the
 * house pattern for this module); page assertions are source pins.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS,
  PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS,
  getPrintDeliveryEstimateExampleLine,
} from "./commerceFacts.harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("example delivery line: canonical numbers, U.S. figure labeled as an example", () => {
  const line = getPrintDeliveryEstimateExampleLine();
  assert.ok(line.includes(PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS), "production window present");
  assert.ok(line.includes(PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS), "U.S. transit window present");
  assert.ok(line.includes("for example,"), "U.S. window is labeled as an example");
  assert.ok(line.includes("within the United States"), "example destination is named");
  assert.ok(line.includes("estimates, not guarantees"), "estimates disclaimer kept");
  assert.ok(!/instant/i.test(line), "no instant-delivery language");
});

test("commerceFacts source composes the example line from the constants, not literals", () => {
  const src = read("src/lib/commerceFacts.ts");
  assert.ok(src.includes("export function getPrintDeliveryEstimateExampleLine()"));
  assert.ok(
    src.includes("${PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS}") &&
      src.includes("${PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS}"),
    "both windows come from the canonical constants",
  );
});

for (const page of ["anniversary", "birthday"]) {
  test(`/${page}: numeric delivery window up front + delivery FAQ from the composed line`, () => {
    const src = read(`src/app/${page}/page.tsx`);
    assert.ok(src.includes("getPrintDeliveryEstimateExampleLine()"), "FAQ answer uses the composed line");
    assert.ok(src.includes('"How long does delivery take?"'), "delivery-timing FAQ present");
    assert.ok(src.includes("PRINT_ORDER_FULFILLMENT_BUSINESS_DAYS"), "header line uses production constant");
    assert.ok(
      src.includes("PRINT_US_STANDARD_TRANSIT_BUSINESS_DAYS"),
      "header line uses the U.S. transit constant",
    );
    assert.ok(src.includes('href="/shipping"'), "links to destination delivery ranges");
    assert.ok(src.includes("Delivery ranges by destination"), "shipping link is labelled");
  });
}

test("/birthday: milestone-birthdays content block with the milestone set + preview link", () => {
  const src = read("src/app/birthday/page.tsx");
  assert.ok(src.includes("Milestone birthdays, written in the stars"), "milestone section heading");
  for (const age of ["18th", "21st", "30th", "40th", "50th", "65th", "90th"]) {
    assert.ok(src.includes(`>${age}</span>`), `milestone ${age} present`);
  }
  assert.ok(
    src.includes('href="/editor?mode=quick&source=birthday-milestone"'),
    "milestone block links to a free preview",
  );
  assert.ok(!/aggregateRating|reviewCount/i.test(src), "no review counts/ratings added");
});
