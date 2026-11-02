// S96-1 F5 — HD download email claim release, tested against the REAL
// src/lib/hdDownloadEmailDispatch.ts with provider/KV imports stubbed
// (hdDownloadEmailDispatch.hooks.mjs). Before F5, the dedupe claim was
// taken before dispatch and never released: one failed send made every
// later pass read "already_sent" and the paid customer's download
// email was permanently suppressed. The release must fire ONLY on a
// recorded failure outcome in the per-variant sidecar.
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./hdDownloadEmailDispatch.hooks.mjs", import.meta.url);

const { trySendInitialHdPurchaseEmail, trySendHdArchiveReadyEmail } = await import(
  "../../src/lib/hdDownloadEmailDispatch.ts"
);
const { hdStubState, resetHdStubState } = await import("./hdDownloadEmailDispatch.stubState.mjs");
const { ENTITLEMENT_KV } = await import("./hdEntitlementsStore.stub.mjs");

const SESSION = "cs_test_f5";
const RECORD = { hdRecoverable: true, customerEmail: "buyer@example.com" };
const INPUT = { siteOrigin: "https://starmapco.com", email: "buyer@example.com", sessionId: SESSION, record: RECORD };

function seedArchiveSession() {
  hdStubState.kv.set(ENTITLEMENT_KV.stripeSession(SESSION), { ...RECORD });
  hdStubState.archiveExists = true;
}

test("F5 initial: a recorded failure releases the claim so the next pass retries and delivers", async () => {
  resetHdStubState();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];

  const first = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(first.delivered, false);
  assert.equal(hdStubState.sends.length, 1);
  const sidecar = hdStubState.kv.get(ENTITLEMENT_KV.hdInitialEmailResult(SESSION));
  assert.equal(sidecar.error, "resend_500");
  assert.equal(sidecar.deliveredAt, undefined);

  const second = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(second.delivered, true, "the retry must dispatch, not read as already_sent");
  assert.equal(hdStubState.sends.length, 2);

  const third = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(third.skipped, true);
  assert.equal(third.reason, "already_sent");
  assert.equal(hdStubState.sends.length, 2, "a delivered email is never re-sent");
});

test("F5 initial: a delivered first send keeps the claim (no duplicate)", async () => {
  resetHdStubState();
  const first = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(first.delivered, true);
  const second = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(second.reason, "already_sent");
  assert.equal(hdStubState.sends.length, 1);
});

test("F5 initial: an unreadable sidecar releases nothing (exactly-once residual preserved)", async () => {
  resetHdStubState();
  // A previous pass claimed the counter but its outcome record cannot
  // be read — the send may or may not have happened.
  hdStubState.kv.set(ENTITLEMENT_KV.accessEmailDedupe(SESSION), 1);
  hdStubState.kvReadThrows = true;
  const result = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(result.reason, "already_sent");
  assert.equal(hdStubState.sends.length, 0, "no dispatch on an unprovable outcome");
});

test("F5 initial: no sidecar at all and a standing claim stays already_sent", async () => {
  resetHdStubState();
  hdStubState.kv.set(ENTITLEMENT_KV.accessEmailDedupe(SESSION), 1);
  const result = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(result.reason, "already_sent");
  assert.equal(hdStubState.sends.length, 0);
});

test("F5 archive-ready: a recorded failure releases the claim so the next pass retries and delivers", async () => {
  resetHdStubState();
  seedArchiveSession();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];

  const first = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(first.delivered, false);
  assert.equal(hdStubState.sends.length, 1);

  const second = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(second.delivered, true, "the archive-ready retry must dispatch");
  assert.equal(hdStubState.sends.length, 2);

  const third = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(third.reason, "archive_already_emailed");
  assert.equal(hdStubState.sends.length, 2);
});

test("F5 archive-ready: an initial email that already carried the archive still suppresses the follow-up", async () => {
  resetHdStubState();
  seedArchiveSession();
  hdStubState.kv.set(ENTITLEMENT_KV.hdInitialEmailResult(SESSION), {
    schemaVersion: 1,
    sessionId: SESSION,
    variant: "initial",
    provider: "resend",
    deliveredAt: 123,
    includedArchive: true,
    recordedAt: 123,
  });
  const result = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(result.reason, "archive_already_emailed");
  assert.equal(hdStubState.sends.length, 0);
});
