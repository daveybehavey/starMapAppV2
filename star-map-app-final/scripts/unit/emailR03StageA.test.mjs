import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);
const core = await import("../../src/lib/consistencyCoordinatorState.ts");
const receipt = await import("../../src/lib/promotionReceipt.ts");
const { RD_K_DISCLOSURE: disclosure, resolvePromotionDisclosure } =
  await import("../../src/lib/promotionDisclosure.ts");
const { ConsistencyCoordinatorDO } = await import("../../src/durable-objects/ConsistencyCoordinatorDO.ts");
const NOW = Date.UTC(2026, 10, 10, 10);
const EMAIL = "stage-a@example.test";
const { coordinatorEmailHash } = await import("../../src/lib/consistencyCoordinator.ts");
const HASH = coordinatorEmailHash(EMAIL);
const CAPTURE = {
  email: EMAIL,
  disclosureVersion: disclosure.version,
  disclosureHash: disclosure.hash,
  affirmativeAction: "checkbox_and_submit",
};
const FACTS = {
  state: null,
  inLegacySubscriptionList: null,
  inLegacySentList: null,
  inLegacyFollowupList: null,
};
function artifact(name, value) {
  if (!process.env.EMAIL_R03_EVIDENCE_DIR) return;
  mkdirSync(process.env.EMAIL_R03_EVIDENCE_DIR, { recursive: true });
  writeFileSync(path.join(process.env.EMAIL_R03_EVIDENCE_DIR, name), value);
}
const CONTROLS = {
  recordUrl: "https://example.test/synthetic-record?credential=synthetic",
  unsubscribeUrl: "https://example.test/synthetic-unsubscribe?token=synthetic",
  withdrawalEmail: "withdraw@example.test",
  senderIdentity: "StarMapCo, 123 Synthetic Street",
};
function pending() {
  return core.applyRequestPromotionConsent(null, {
    emailHash: HASH,
    now: NOW,
    facts: FACTS,
    requestId: "synthetic-request",
    tokenHash: "synthetic-token-hash",
    capture: CAPTURE,
  }).state;
}
function complete(state = pending(), now = NOW + 1_000) {
  return core.applyConfirmPromotionConsent(state, { now, tokenHash: state.pendingConsent.tokenHash });
}
class Sql {
  row = null;
  writes = 0;
  failWrite = false;
  exec(sql, ...args) {
    if (sql.trimStart().startsWith("CREATE")) return { toArray: () => [] };
    if (sql.trimStart().startsWith("SELECT")) return { toArray: () => (this.row ? [this.row] : []) };
    if (this.failWrite) throw new Error("injected commit failure");
    this.row = { object_id: args[0], state_json: args[1], updated_at: args[2] };
    this.writes++;
    return { toArray: () => [] };
  }
}
function authority(sql = new Sql()) {
  const ctx = { id: { name: "synthetic-stage-a" }, storage: { sql }, blockConcurrencyWhile: (fn) => fn() };
  return { sql, object: new ConsistencyCoordinatorDO(ctx, {}) };
}
async function requestedAuthority() {
  const a = authority();
  await a.object.requestPromotionConsent({
    emailHash: HASH,
    now: NOW,
    facts: FACTS,
    requestId: "synthetic-request",
    tokenHash: "synthetic-token-hash",
    capture: CAPTURE,
  });
  return a;
}

test("U1/U2: frozen historical UTF-8 artifact resolves exactly; unknown and changed bindings fail", () => {
  assert.equal(createHash("sha256").update(disclosure.text, "utf8").digest("hex"), disclosure.hash);
  assert.equal(resolvePromotionDisclosure(disclosure.version).text, disclosure.text);
  assert.equal(resolvePromotionDisclosure("toString"), null);
  assert.equal(resolvePromotionDisclosure("missing"), null);
  assert.ok(Object.isFrozen(disclosure));
  for (const changed of [
    { disclosureHash: "wrong" },
    { disclosureVersion: "missing" },
    { email: "another@example.test" },
    { affirmativeAction: "page_load" },
  ]) {
    assert.throws(() => receipt.assertPromotionCapture({ ...CAPTURE, ...changed }, HASH));
  }
});

test("U1: production form displays the stamped artifact with required unchecked affirmative control", () => {
  const src = readFileSync(new URL("../../src/components/PromotionSignup.tsx", import.meta.url), "utf8");
  assert.match(src, /\{RD_K_DISCLOSURE.text\}/);
  assert.match(src, /name="disclosureVersion" value=\{RD_K_DISCLOSURE.version\}/);
  assert.match(src, /name="disclosureHash" value=\{RD_K_DISCLOSURE.hash\}/);
  assert.match(src, /type="checkbox" name="consent" value="yes" required/);
  assert.doesNotMatch(src, /defaultChecked|checked=/);
  assert.match(src, /action="\/api\/promotions\/consent-request"/);
});

test("U1: request is not consent; confirmation binds historical presentation instead of caller override", () => {
  const state = pending();
  assert.equal(state.subscribedAt, null);
  assert.deepEqual(state.consentEvents, []);
  assert.deepEqual(state.pendingConsent.capture, CAPTURE);
  const done = core.applyConfirmPromotionConsent(state, {
    now: NOW + 1000,
    tokenHash: state.pendingConsent.tokenHash,
    evidence: { disclosureVersion: "today", disclosureHash: "fake" },
  });
  const event = done.state.consentEvents.at(-1);
  assert.equal(event.disclosureVersion, disclosure.version);
  assert.equal(event.disclosureHash, disclosure.hash);
  assert.equal(event.affirmativeAction, "confirmation");
  assert.equal(event.serverAt, NOW + 1000);
  assert.equal(event.rdK.emailHash, HASH);
  assert.equal(event.rdK.scope, "StarMapCo promotional email");
  assert.equal(event.rdK.eventRef, done.state.receiptJobs[2].eventRef);
});

test("U3/AT-5: real DO persists evidence, generation and exactly one receipt in one write; commit failure leaves all pending", async () => {
  const { sql, object } = await requestedAuthority();
  const before = structuredClone(sql.row);
  sql.failWrite = true;
  await assert.rejects(
    object.confirmPromotionConsent({ now: NOW + 1000, tokenHash: "synthetic-token-hash" }),
    /commit failure/
  );
  assert.deepEqual(sql.row, before);
  assert.equal(JSON.parse(sql.row.state_json).subscribedAt, null);
  sql.failWrite = false;
  const writes = sql.writes;
  const done = await object.confirmPromotionConsent({ now: NOW + 1000, tokenHash: "synthetic-token-hash" });
  assert.equal(sql.writes, writes + 1);
  assert.equal(done.result, "confirmed");
  assert.equal(core.isValidPromotionState(JSON.parse(sql.row.state_json)), true);
  assert.equal(Object.keys(done.state.receiptJobs).length, 1);
  const replay = await object.confirmPromotionConsent({ now: NOW + 2000, tokenHash: "synthetic-token-hash" });
  assert.equal(replay.result, "already_confirmed");
  assert.equal(sql.writes, writes + 1);
  assert.deepEqual(replay.state.receiptJobs, done.state.receiptJobs);
});

test("AT-5 content: production renderer has six factual fields and only record/unsubscribe controls", () => {
  const job = complete().state.receiptJobs[2];
  const message = receipt.renderPromotionReceipt(job, CONTROLS);
  const all = `${message.subject}\n${message.text}\n${message.html}`;
  for (const field of [
    EMAIL,
    new Date(NOW + 1000).toISOString(),
    disclosure.scope,
    disclosure.text,
    disclosure.version,
    CONTROLS.senderIdentity,
    CONTROLS.recordUrl,
    CONTROLS.unsubscribeUrl,
    CONTROLS.withdrawalEmail,
  ])
    assert.ok(message.text.includes(field), field);
  artifact("receipt.txt", `${message.subject}\n\n${message.text}\n`);
  artifact("receipt.html", message.html);
  assert.equal(message.subject, "Your StarMapCo consent receipt");
  assert.doesNotMatch(
    all,
    /coupon|FIRST50|50%|buy now|shop now|recommend|cross.sell|checkout|discount|offer/i
  );
  assert.deepEqual(message.text.match(/https:\/\/\S+/g), [CONTROLS.recordUrl, CONTROLS.unsubscribeUrl]);
  assert.equal(job.classification, "transactional");
  assert.equal(job.quota, "transactional_provider");
  assert.equal(job.promotionalBudget, false);
  assert.equal(job.deliveryHold, "stage_a_no_send");
  assert.throws(() => receipt.renderPromotionReceipt(job, { ...CONTROLS, recordUrl: "javascript:alert(1)" }));
});

test("AT-5 failure: fault-injected provider rejection retries and durably reaches exactly one terminal state; incident visible; consent stands", async () => {
  const { sql, object } = await requestedAuthority();
  const done = await object.confirmPromotionConsent({ now: NOW + 1000, tokenHash: "synthetic-token-hash" });
  const originalConsent = structuredClone(done.state.consentEvents);
  // No provider call: the harness injects provider results at the real authority outcome boundary.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const input = {
      generation: 2,
      now: NOW + 1000 + attempt * 5 * 60_000,
      attemptNumber: attempt,
      outcome: "definitive_failure",
    };
    const result = await object.recordPromotionReceiptOutcome(input);
    assert.equal(result.state.receiptJobs[2].attempts, attempt);
    assert.equal(result.state.subscribedAt, NOW + 1000);
    assert.deepEqual(result.state.consentEvents, originalConsent);
    const writes = sql.writes;
    await object.recordPromotionReceiptOutcome(input);
    assert.equal(sql.writes, writes, "duplicate outcome must not count twice");
  }
  const final = JSON.parse(sql.row.state_json);
  artifact("receipt-failure-ledger.json", JSON.stringify(final.receiptJobs[2], null, 2) + "\n");
  assert.equal(final.receiptJobs[2].status, "failed");
  assert.equal(final.receiptJobs[2].incidents.length, 3);
  assert.deepEqual(final.receiptJobs[2].terminal, { status: "failed", at: NOW + 901_000 });
  const writes = sql.writes;
  await object.recordPromotionReceiptOutcome({
    generation: 2,
    now: NOW + 950_000,
    attemptNumber: 4,
    outcome: "accepted",
  });
  assert.equal(sql.writes, writes, "terminal state cannot be overwritten");
  assert.equal(core.isValidPromotionState(final), true);
});

test("U3: ambiguity terminates visibly; retry backoff and stale outcomes do not mutate", () => {
  const job = complete().state.receiptJobs[2];
  const failed = receipt.recordPromotionReceiptOutcome(job, {
    now: NOW + 1000,
    attemptNumber: 1,
    outcome: "definitive_failure",
  });
  assert.equal(failed.status, "pending");
  assert.equal(
    receipt.recordPromotionReceiptOutcome(failed, { now: NOW + 2000, attemptNumber: 2, outcome: "accepted" }),
    failed
  );
  const blocked = receipt.recordPromotionReceiptOutcome(job, {
    now: NOW + 1000,
    attemptNumber: 1,
    outcome: "ambiguous",
  });
  assert.equal(blocked.terminal.status, "blocked");
  assert.equal(blocked.incidents.length, 1);
});

test("U3: incomplete capture aborts before completion; paired read validation rejects missing receipt", () => {
  const state = pending();
  state.pendingConsent.capture.disclosureHash = "tampered";
  const before = structuredClone(state);
  assert.throws(() => complete(state));
  assert.deepEqual(state, before);
  const done = complete().state;
  delete done.receiptJobs;
  assert.equal(core.isValidPromotionState(done), false);
});

test("U3: expired/stale tokens create no artifact; reconsent creates its own receipt and preserves welcome history", () => {
  const state = pending();
  const expired = complete(state, state.pendingConsent.tokenExpiresAt);
  assert.equal(expired.result, "expired");
  assert.equal(expired.state.receiptJobs, undefined);
  let done = complete().state;
  const first = structuredClone(done.receiptJobs[2]);
  const welcome = structuredClone(done.welcomeState);
  done = core.applyUnsubscribePromotion(done, {
    emailHash: HASH,
    now: NOW + 2000,
    reason: "test",
    facts: FACTS,
  }).state;
  const requested = core.applyRequestPromotionConsent(done, {
    emailHash: HASH,
    now: NOW + 3000,
    facts: FACTS,
    requestId: "second",
    tokenHash: "second-hash",
    capture: CAPTURE,
  }).state;
  const second = complete(requested, NOW + 4000).state;
  assert.deepEqual(second.receiptJobs[2], first);
  assert.equal(second.receiptJobs[4].generation, 4);
  assert.notEqual(second.receiptJobs[4].eventRef, first.eventRef);
  assert.deepEqual(second.welcomeState, welcome);
  assert.deepEqual(second.jobs, done.jobs);
});

test("U3: pre-RD-K unstamped ceremony is explicitly blocked without reconstruction", () => {
  const state = pending();
  delete state.pendingConsent.capture;
  const job = complete(state).state.receiptJobs[2];
  assert.equal(job.status, "blocked");
  assert.equal(job.capture, null);
  assert.match(job.incidents[0].reason, /no_reconstruction/);
  assert.throws(() => receipt.renderPromotionReceipt(job, CONTROLS));
});

test("U1: fresh capture flow never reads legacy lists or invokes any provider", async () => {
  process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
  process.env.STARMAP_KV_ALLOW_LOCAL = "1";
  const { kv } = await import("../../src/lib/kv.ts");
  const clients = await import("../../src/lib/consistencyCoordinator.ts");
  const flows = await import("../../src/lib/promotionCoordinator.ts");
  clients.__resetConsistencyCoordinatorMemoryForTests();
  const savedFetch = globalThis.fetch;
  const savedGet = kv.get;
  const savedStrictGet = kv.getErrorPreserving;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("network forbidden");
  };
  kv.get = async () => {
    throw new Error("legacy KV forbidden");
  };
  kv.getErrorPreserving = async () => {
    throw new Error("legacy KV forbidden");
  };
  try {
    const first = await flows.requestPromotionConsentFlow({ email: EMAIL, capture: CAPTURE });
    assert.equal(first.outcome, "created");
    assert.equal(first.state.legacySubscribed, false);
    assert.equal(first.state.subscribedAt, null);
    assert.equal(first.state.receiptJobs, undefined);
    const repeated = await flows.requestPromotionConsentFlow({ email: EMAIL, capture: CAPTURE });
    assert.equal(repeated.outcome, "existing");
    assert.equal(repeated.token, null);
    assert.deepEqual(repeated.state.pendingConsent.capture, CAPTURE);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = savedFetch;
    kv.get = savedGet;
    kv.getErrorPreserving = savedStrictGet;
  }
});

test("U3 regression: erasure removes the new receipt address and content; late receipt outcome recreates nothing", () => {
  const done = complete().state;
  const erased = core.applyErasePromotionIdentity(done, {
    emailHash: HASH,
    now: NOW + 2000,
    facts: FACTS,
    keyedDigest: "synthetic-keyed-digest",
    digestKeyVersion: 1,
    authorityId: "synthetic-authority",
  });
  assert.equal(erased.erasureRefused, undefined);
  assert.equal(erased.state.receiptJobs, undefined);
  assert.ok(!JSON.stringify(erased.state).includes(EMAIL));
  assert.equal(
    core.applyRecordPromotionReceiptOutcome(erased.state, {
      generation: 2,
      now: NOW + 3000,
      attemptNumber: 1,
      outcome: "accepted",
    }).changed,
    false
  );
});
