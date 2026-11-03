// S96-1 F5 — HD download email claim release, tested against the REAL
// src/lib/hdDownloadEmailDispatch.ts with provider/KV imports stubbed
// (hdDownloadEmailDispatch.hooks.mjs). Before F5, the dedupe claim was
// taken before dispatch and never released: one failed send made every
// later pass read "already_sent" and the paid customer's download
// email was permanently suppressed. The release must fire ONLY on a
// recorded failure outcome in the per-variant sidecar, and the gate
// round added: the failure evidence is CONSUMED (sidecar deleted)
// before the claim is released, so a delivered retry whose own
// outcome write fails cannot re-authorize another release. Gate
// round 2 made the consumption RESUMABLE: consumption is stamped
// into the sidecar first, so a partial release (stamp done, claim
// delete failed) is completed by the next pass instead of sealing
// the session's email forever (Codex P2 on PR #502).
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

test("F5 initial: a delivered retry whose outcome write fails cannot re-authorize a release (no duplicate)", async () => {
  resetHdStubState();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];
  const first = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(first.delivered, false);
  assert.equal(hdStubState.sends.length, 1);

  // The retry delivers, but recording its (delivered) outcome fails.
  // The pass-one failure evidence was consumed before the release, so
  // nothing can authorize another release now.
  hdStubState.kvSetThrowsIfDelivered = true;
  await assert.rejects(() => trySendInitialHdPurchaseEmail(INPUT), /kv_set_failed/);
  assert.equal(hdStubState.sends.length, 2, "the retry did dispatch and deliver");
  hdStubState.kvSetThrowsIfDelivered = false;

  const third = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(third.reason, "already_sent");
  assert.equal(hdStubState.sends.length, 2, "no duplicate after an unrecorded delivery");
});

test("F5 initial: a failed release is resumable — the consumption marker stands and the next pass completes it", async () => {
  resetHdStubState();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];
  const first = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(first.delivered, false);

  hdStubState.kvDeleteThrows = true;
  await assert.rejects(() => trySendInitialHdPurchaseEmail(INPUT), /kv_delete_failed/);
  assert.equal(hdStubState.sends.length, 1, "no dispatch while the release cannot complete");
  const marked = hdStubState.kv.get(ENTITLEMENT_KV.hdInitialEmailResult(SESSION));
  assert.equal(typeof marked.releaseConsumedAt, "number", "consumption was stamped into the sidecar before the delete failed");
  assert.equal(marked.deliveredAt, undefined, "the stamped record is still the failure outcome");
  assert.equal(hdStubState.kv.get(ENTITLEMENT_KV.accessEmailDedupe(SESSION)), 1, "the claim still stands");
  hdStubState.kvDeleteThrows = false;

  const retry = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(retry.delivered, true, "the next pass resumes and completes the release");
  assert.equal(hdStubState.sends.length, 2);
});

test("F5 initial: a claim-delete failure mid-release resumes instead of sealing the email (Codex P2 repro)", async () => {
  resetHdStubState();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];
  const first = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(first.delivered, false);

  // Exactly the confirmation-review repro: the failure sidecar is
  // consumed (stamped) but deleting the claim fails — under a
  // delete-both protocol the evidence would be gone, the claim would
  // stand, and every later pass would read already_sent forever.
  hdStubState.kvDeleteThrowsFor = "access_link:email";
  await assert.rejects(() => trySendInitialHdPurchaseEmail(INPUT), /kv_delete_failed/);
  assert.equal(hdStubState.sends.length, 1, "no dispatch while the claim delete fails");
  const marked = hdStubState.kv.get(ENTITLEMENT_KV.hdInitialEmailResult(SESSION));
  assert.equal(typeof marked.releaseConsumedAt, "number", "the marked sidecar authorizes resuming the release");
  assert.equal(hdStubState.kv.get(ENTITLEMENT_KV.accessEmailDedupe(SESSION)), 1, "the claim still stands");
  hdStubState.kvDeleteThrowsFor = null;

  const retry = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(retry.delivered, true, "the resumed release lets the retry dispatch");
  assert.equal(hdStubState.sends.length, 2);

  const third = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(third.reason, "already_sent");
  assert.equal(hdStubState.sends.length, 2, "the delivered retry is never duplicated");
});

test("F5 initial: a sidecar-delete failure mid-release also resumes", async () => {
  resetHdStubState();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];
  const first = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(first.delivered, false);

  hdStubState.kvDeleteThrowsFor = "hd-email:initial-result";
  await assert.rejects(() => trySendInitialHdPurchaseEmail(INPUT), /kv_delete_failed/);
  assert.equal(hdStubState.sends.length, 1);
  assert.equal(hdStubState.kv.get(ENTITLEMENT_KV.accessEmailDedupe(SESSION)), undefined, "the claim was already released");
  const marked = hdStubState.kv.get(ENTITLEMENT_KV.hdInitialEmailResult(SESSION));
  assert.equal(typeof marked.releaseConsumedAt, "number", "the marked sidecar still stands, authorizing the resume");
  hdStubState.kvDeleteThrowsFor = null;

  const retry = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(retry.delivered, true);
  assert.equal(hdStubState.sends.length, 2);
});

test("F5 archive-ready: a delivered retry whose outcome write fails cannot re-authorize a release", async () => {
  resetHdStubState();
  seedArchiveSession();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];
  const first = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(first.delivered, false);
  assert.equal(hdStubState.sends.length, 1);

  hdStubState.kvSetThrowsIfDelivered = true;
  await assert.rejects(
    () => trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION }),
    /kv_set_failed/,
  );
  assert.equal(hdStubState.sends.length, 2, "the retry did dispatch and deliver");
  hdStubState.kvSetThrowsIfDelivered = false;

  const third = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(third.reason, "archive_email_already_sent");
  assert.equal(hdStubState.sends.length, 2, "no duplicate follow-up after an unrecorded delivery");
});

test("F5 archive-ready: a claim-delete failure mid-release resumes instead of sealing the email", async () => {
  resetHdStubState();
  seedArchiveSession();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];
  const first = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(first.delivered, false);
  assert.equal(hdStubState.sends.length, 1);

  hdStubState.kvDeleteThrowsFor = "hd_archive:email";
  await assert.rejects(
    () => trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION }),
    /kv_delete_failed/,
  );
  assert.equal(hdStubState.sends.length, 1, "no dispatch while the claim delete fails");
  const marked = hdStubState.kv.get(ENTITLEMENT_KV.hdArchiveEmailResult(SESSION));
  assert.equal(typeof marked.releaseConsumedAt, "number", "the marked sidecar authorizes resuming the release");
  assert.equal(hdStubState.kv.get(ENTITLEMENT_KV.hdArchiveEmailDedupe(SESSION)), 1, "the claim still stands");
  hdStubState.kvDeleteThrowsFor = null;

  const retry = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(retry.delivered, true, "the resumed release lets the retry dispatch");
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

test("F5 initial: a stale-read racing pass cannot release over a delivered retry (gate round 5, P2-A repro)", async () => {
  resetHdStubState();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];
  const first = await trySendInitialHdPurchaseEmail(INPUT);
  assert.equal(first.delivered, false);
  assert.equal(hdStubState.sends.length, 1);

  // Pass B reads the same failure sidecar, then stalls — the position
  // of the local Codex seat's repro. Pass A runs the whole release +
  // retry + delivered-outcome write while B holds its stale read.
  let releaseGate;
  const gatePromise = new Promise((resolve) => {
    releaseGate = resolve;
  });
  hdStubState.kvReadGate = { keyIncludes: "hd-email:initial-result", onCount: 2, promise: gatePromise };

  const passA = trySendInitialHdPurchaseEmail(INPUT);
  const passB = trySendInitialHdPurchaseEmail(INPUT);
  const resultA = await passA;
  assert.equal(resultA.delivered, true, "the owning pass completes the retry");
  assert.equal(hdStubState.sends.length, 2);

  releaseGate();
  const resultB = await passB;
  assert.equal(resultB.reason, "already_sent", "the stale pass dispatches nothing");
  assert.equal(hdStubState.sends.length, 2, "no duplicate send from the stale pass");
  const sidecar = hdStubState.kv.get(ENTITLEMENT_KV.hdInitialEmailResult(SESSION));
  assert.equal(typeof sidecar.deliveredAt, "number", "the delivered evidence survives the stale pass");
  assert.equal(
    hdStubState.kv.get(ENTITLEMENT_KV.accessEmailDedupe(SESSION)),
    2,
    "the claim was never deleted out from under the delivered retry: the counter holds the retry's claim plus the stale pass's rejected increment (the buggy flow reset it to 1 and dispatched)",
  );
});

test("F5 archive-ready: a stale-read racing pass cannot release over a delivered retry (gate round 5, P2-A repro)", async () => {
  resetHdStubState();
  seedArchiveSession();
  hdStubState.sendQueue = [
    { delivered: false, provider: "resend", error: "resend_500" },
    { delivered: true, provider: "resend" },
  ];
  const first = await trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  assert.equal(first.delivered, false);
  assert.equal(hdStubState.sends.length, 1);

  let releaseGate;
  const gatePromise = new Promise((resolve) => {
    releaseGate = resolve;
  });
  hdStubState.kvReadGate = { keyIncludes: "hd-email:archive-result", onCount: 2, promise: gatePromise };

  const passA = trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  const passB = trySendHdArchiveReadyEmail({ siteOrigin: "https://starmapco.com", sessionId: SESSION });
  const resultA = await passA;
  assert.equal(resultA.delivered, true, "the owning pass completes the retry");
  assert.equal(hdStubState.sends.length, 2);

  releaseGate();
  const resultB = await passB;
  assert.equal(resultB.reason, "archive_email_already_sent", "the stale pass dispatches nothing");
  assert.equal(hdStubState.sends.length, 2, "no duplicate follow-up from the stale pass");
  const sidecar = hdStubState.kv.get(ENTITLEMENT_KV.hdArchiveEmailResult(SESSION));
  assert.equal(typeof sidecar.deliveredAt, "number", "the delivered evidence survives the stale pass");
  assert.equal(
    hdStubState.kv.get(ENTITLEMENT_KV.hdArchiveEmailDedupe(SESSION)),
    2,
    "the claim was never deleted out from under the delivered retry: the counter holds the retry's claim plus the stale pass's rejected increment (the buggy flow reset it to 1 and dispatched)",
  );
});
