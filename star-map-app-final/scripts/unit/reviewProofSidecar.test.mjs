/**
 * reviewProofSidecar.test.mjs — PR #447 fix round 5 (Codex P2).
 *
 * Round 4 moved completed settlement metadata (customerEmail, isGift, …)
 * into the settlement-metadata sidecar; the review engine's loader merges
 * it, but /api/reviews/proof still read the RAW session record, so a
 * verify-born purchase whose metadata exists only in the sidecar
 * classified `gift_uncertain` at the proof endpoint forever while the
 * engine considered it due and sent. The proof route now reads the same
 * merged view (sidecar read + applySettlementMetadata, mirroring
 * runReviewRequestTick's loader).
 *
 * These tests drive the REAL proof POST handler against a local temp KV
 * (dl1Slice4Route harness pattern):
 *   (a) metadata ONLY in the sidecar -> due + the email renders;
 *   (b) metadata inline, no sidecar -> report identical to classifying
 *       the raw record directly (pre-fix behaviour, byte-for-byte at the
 *       report level);
 *   (c) metadata nowhere -> still gift_uncertain, render refused
 *       (the merge invents nothing);
 *   (d) inline values WIN over a conflicting sidecar (applySettlement-
 *       Metadata never overrides a present record value).
 *
 * Negative control: on the pre-fix route (ca82d041), test (a) fails —
 * the raw read classifies gift_uncertain and the render is refused.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
// Plain Node cannot resolve the `next/server` package subpath; the S4
// route tests' hook maps it to the package's server.js entry.
register("./dl1S4NextServer.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = path.join(process.cwd(), ".tmp", `proof-sidecar-kv-${RUN}`);
process.env.PRINT_ADMIN_TOKEN = "proof-sidecar-test-admin-token";
process.env.REVIEW_REQUEST_MAILING_ADDRESS = "StarMapCo Test, 1 Proof Way, Victoria, BC";
process.env.REVIEW_OPTOUT_SIGNING_SECRET = "proof-sidecar-test-signing-secret-0123456789abcdef";

const { NextRequest } = await import("next/server");
const route = await import("../../src/app/api/reviews/proof/route.ts");
const { kv } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV } = await import("../../src/lib/entitlementsStore.ts");
const { classifyDigitalEntitlement, REVIEW_DIGITAL_DELAY_MS } = await import(
  "../../src/lib/reviewRequests.ts"
);

const DAY_MS = 24 * 60 * 60 * 1000;
// 4 days old: past the 3-day digital delay, inside the 14-day max age.
const anchor = () => Date.now() - 4 * DAY_MS;

let counter = 0;
function sessionId() {
  counter += 1;
  return `cs_test_proof${RUN}${counter}`;
}

function proofPost(id, render) {
  return new NextRequest("https://starmapco.com/api/reviews/proof", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.PRINT_ADMIN_TOKEN}`,
    },
    body: JSON.stringify({ sessionId: id, render }),
  });
}

async function seed(id, record, sidecar) {
  await kv.set(ENTITLEMENT_KV.stripeSession(id), record);
  if (sidecar) await kv.set(ENTITLEMENT_KV.settlementMetadata(id), sidecar);
}

test("(a) sidecar-only isGift/customerEmail: proof classifies due and renders", async () => {
  const id = sessionId();
  const created = anchor();
  // Verify-born shape: paid + anchor, NO inline completion metadata.
  await seed(id, { paid: true, created }, { isGift: false, customerEmail: "buyer@example.test" });

  const res = await route.POST(proofPost(id, true));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.digital.outcome, "due");
  assert.equal(body.digital.kind, "digital");
  assert.equal(body.digital.emailPresent, true);
  assert.equal(body.digital.anchorAt, created);
  assert.equal(body.digital.dueAt, created + REVIEW_DIGITAL_DELAY_MS);
  assert.ok(body.rendered, "rendered block present");
  assert.equal(body.rendered.unavailable, undefined);
  assert.equal(typeof body.rendered.subject, "string");
  assert.ok(body.rendered.subject.length > 0);
});

test("(b) inline metadata, no sidecar: report identical to direct classification of the raw record", async () => {
  const id = sessionId();
  const record = {
    paid: true,
    created: anchor(),
    isGift: false,
    customerEmail: "inline@example.test",
  };
  await seed(id, record, null);

  const res = await route.POST(proofPost(id, true));
  assert.equal(res.status, 200);
  const body = await res.json();

  const direct = classifyDigitalEntitlement(record, Date.now());
  const expected =
    direct.outcome === "due"
      ? {
          outcome: "due",
          kind: direct.kind,
          anchorAt: direct.anchorAt,
          dueAt: direct.dueAt,
          emailPresent: true,
        }
      : { outcome: direct.outcome, kind: direct.kind, reason: direct.reason, emailPresent: false };
  assert.deepEqual(body.digital, expected);
  assert.equal(body.digital.outcome, "due");
  assert.ok(body.rendered && body.rendered.unavailable === undefined);
});

test("(c) no metadata anywhere: still gift_uncertain, render refused (no over-merge)", async () => {
  const id = sessionId();
  await seed(id, { paid: true, created: anchor() }, null);

  const res = await route.POST(proofPost(id, true));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.digital.outcome, "excluded");
  assert.equal(body.digital.reason, "gift_uncertain");
  assert.equal(body.digital.emailPresent, false);
  assert.deepEqual(body.rendered, { unavailable: "session_not_due" });
});

test("(d) inline values win over a conflicting sidecar (record precedence)", async () => {
  const id = sessionId();
  await seed(
    id,
    { paid: true, created: anchor(), isGift: false, customerEmail: "inline@example.test" },
    { isGift: true, customerEmail: "sidecar@example.test" },
  );

  const res = await route.POST(proofPost(id, false));
  assert.equal(res.status, 200);
  const body = await res.json();
  // The sidecar's isGift:true must NOT override the record's present
  // isGift:false — the purchase stays due, as the engine would judge it.
  assert.equal(body.digital.outcome, "due");
});
