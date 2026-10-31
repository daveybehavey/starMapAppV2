/**
 * claimTokenClosure.test.mjs — fix round 4 (PR #447, G-dot gate rejection
 * at adbc60fa), the S60-1 M2-02 closure pattern for claim-token issuance.
 *
 * The gate's third blocking finding: getOrCreateClaimToken persisted a
 * fresh token by replacing the WHOLE session record from a caller-held
 * snapshot (`kv.set(sessionKey, { ...record, claimToken: token })`),
 * republishing stale accounting over landed consumption/revocation —
 * the same class as the metadata-completion finding. These tests drive
 * the real helper against the fault-injecting fake KV and assert:
 * zero session-record writes on every issuance path; the token lives in
 * its claim record + the governing pointer; legacy inline tokens still
 * resolve; the governing pointer beats a stale caller hint; force-new
 * supersedes; write-applied/response-lost retries never double-apply or
 * resurrect a superseded token.
 *
 * Negative control: every test here fails on adbc60fa — the helper wrote
 * the session record on mint, had no pointer concept, and returned the
 * caller hint without validating it against a governing token.
 *
 * Round 6 scope correction (G-dot condition 2): the lost-response tests
 * above retry against FRESH visible storage, and their convergence claim
 * holds only for that scope — a retry that OBSERVES the landed pointer
 * converges on it. The two histories at the end of this file establish
 * the wider truth: a retry whose pointer READ is stale, and two truly
 * concurrent issuances, can each mint a SECOND claim record and move the
 * pointer, superseding the earlier token. That token-availability
 * residual is accepted and recorded in the PR body; no exactly-once
 * token architecture is claimed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

process.env.STARMAP_KV_ALLOW_LOCAL = "1";

const { kv } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV } = await import("../../src/lib/entitlementsStore.ts");
const { getOrCreateClaimToken } = await import("../../src/lib/accountAccessLinks.ts");

const realKv = { get: kv.get, set: kv.set, setDurable: kv.setDurable };

let data;
let putLog;
let failSetKeys;
let failDurableKeys;

function installFakeKv() {
  data = new Map();
  putLog = [];
  failSetKeys = new Set();
  failDurableKeys = new Set();
  kv.get = async (key) => (data.has(key) ? structuredClone(data.get(key)) : null);
  kv.set = async (key, value) => {
    if (failSetKeys.has(key)) throw new Error(`injected set failure for ${key}`);
    data.set(key, structuredClone(value));
    putLog.push({ op: "set", key });
    return "OK";
  };
  kv.setDurable = async (key, value) => {
    if (failDurableKeys.has(key)) throw new Error(`injected durable failure for ${key}`);
    data.set(key, structuredClone(value));
    putLog.push({ op: "setDurable", key });
    return "OK";
  };
}

function restoreKv() {
  kv.get = realKv.get;
  kv.set = realKv.set;
  kv.setDurable = realKv.setDurable;
}

test.beforeEach(() => installFakeKv());
test.afterEach(() => restoreKv());

const sessionKey = (id) => ENTITLEMENT_KV.stripeSession(id);
const pointerKey = (id) => ENTITLEMENT_KV.claimPointer(id);
const claimKey = (token) => ENTITLEMENT_KV.claim(token);
const sessionPuts = (id) => putLog.filter((entry) => entry.key === sessionKey(id));

const SESSION_ID = "cs_claim_r4";
const RICH_RECORD = {
  paid: true,
  plan: "pack3",
  creditsRemaining: 2,
  creditsTotal: 3,
  mapId: "map_r4",
  customerEmail: "buyer@example.com",
};

function seedSession(record = RICH_RECORD) {
  data.set(sessionKey(SESSION_ID), structuredClone(record));
  return structuredClone(record);
}

function seedClaim(token, sessionId = SESSION_ID) {
  data.set(claimKey(token), { sessionId, mapId: "map_r4", createdAt: 1_700_000_000_000 });
}

test("PASS mint: token persists in claim record + pointer; session record never written", async () => {
  const before = seedSession();
  const token = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.ok(token, "a token is returned");
  assert.equal(data.get(claimKey(token)).sessionId, SESSION_ID);
  assert.equal(data.get(claimKey(token)).mapId, "map_r4");
  assert.equal(data.get(pointerKey(SESSION_ID)).token, token, "pointer names the governing token");
  assert.equal(sessionPuts(SESSION_ID).length, 0, "ZERO session-record writes");
  assert.deepEqual(data.get(sessionKey(SESSION_ID)), before, "session record byte-identical");
  // A second issuance reuses the governing token with no writes at all.
  putLog = [];
  const again = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.equal(again, token);
  assert.equal(putLog.length, 0, "reuse performs no writes");
});

test("PASS legacy inline token resolves and is adopted by pointer only — no session write", async () => {
  const legacyToken = "11111111-2222-3333-4444-555555555555";
  seedClaim(legacyToken);
  const before = seedSession({ ...RICH_RECORD, claimToken: legacyToken });
  const token = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.equal(token, legacyToken, "the pre-existing inline token still resolves");
  assert.equal(sessionPuts(SESSION_ID).length, 0, "no session-record write");
  assert.deepEqual(data.get(sessionKey(SESSION_ID)), before);
  assert.equal(data.get(pointerKey(SESSION_ID)).token, legacyToken, "adopted as governing");
  putLog = [];
  const again = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.equal(again, legacyToken);
  assert.equal(putLog.length, 0, "once adopted, reuse is write-free");
});

test("PASS hint whose claim record belongs to another session is not honored — a new token mints", async () => {
  const foreignToken = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  seedClaim(foreignToken, "cs_someone_else");
  const before = seedSession({ ...RICH_RECORD, claimToken: foreignToken });
  const token = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.notEqual(token, foreignToken);
  assert.equal(data.get(claimKey(token)).sessionId, SESSION_ID);
  assert.equal(data.get(pointerKey(SESSION_ID)).token, token);
  assert.equal(sessionPuts(SESSION_ID).length, 0);
});

test("PASS hint with a missing claim record mints fresh (pre-fix reuse check preserved)", async () => {
  const dangling = "99999999-8888-7777-6666-555555555555";
  const before = seedSession({ ...RICH_RECORD, claimToken: dangling });
  const token = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.notEqual(token, dangling);
  assert.equal(data.get(pointerKey(SESSION_ID)).token, token);
  assert.equal(sessionPuts(SESSION_ID).length, 0);
});

test("PASS governing pointer beats a stale caller hint (superseded token is not resurrected)", async () => {
  const staleToken = "12345678-1234-1234-1234-123456789012";
  const governingToken = "87654321-4321-4321-4321-210987654321";
  seedClaim(staleToken);
  seedClaim(governingToken);
  data.set(pointerKey(SESSION_ID), {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    token: governingToken,
    updatedAt: 1,
  });
  const before = seedSession({ ...RICH_RECORD, claimToken: staleToken });
  const token = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.equal(token, governingToken, "the governing token wins over the stale snapshot's hint");
  assert.equal(sessionPuts(SESSION_ID).length, 0);
  assert.deepEqual(data.get(sessionKey(SESSION_ID)), before);
});

test("PASS forceNewToken supersedes: pointer moves, old token no longer governs", async () => {
  const oldToken = "0badf00d-0bad-0bad-0bad-0bad0bad0bad";
  seedClaim(oldToken);
  const before = seedSession({ ...RICH_RECORD, claimToken: oldToken });
  const fresh = await getOrCreateClaimToken(SESSION_ID, structuredClone(before), {
    forceNewToken: true,
  });
  assert.notEqual(fresh, oldToken);
  assert.equal(data.get(pointerKey(SESSION_ID)).token, fresh, "pointer moved to the new token");
  assert.equal(sessionPuts(SESSION_ID).length, 0);
  // Subsequent ordinary issuance returns the new governing token.
  const after = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.equal(after, fresh);
});

test("PASS pointer write applied but response lost: issuance rejects; retry converges on one governing token", async () => {
  const before = seedSession();
  const realSetDurable = kv.setDurable;
  let lostOnce = false;
  kv.setDurable = async (key, value) => {
    if (key === pointerKey(SESSION_ID) && !lostOnce) {
      lostOnce = true;
      data.set(key, structuredClone(value)); // applied…
      throw new Error("injected: response lost after apply"); // …unseen by the caller
    }
    return realSetDurable(key, value);
  };
  await assert.rejects(
    () => getOrCreateClaimToken(SESSION_ID, structuredClone(before)),
    /response lost after apply/,
    "an unconfirmed token is never returned",
  );
  kv.setDurable = realSetDurable;
  // The applied pointer already names a token whose claim record exists:
  // the retry RESOLVES it instead of minting a second governing token.
  const landedPointer = data.get(pointerKey(SESSION_ID));
  assert.ok(landedPointer?.token, "the applied write did land");
  const retry = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.equal(retry, landedPointer.token, "retry converges on the landed token — no double-apply");
  assert.equal(data.get(claimKey(retry)).sessionId, SESSION_ID);
  const claimRecords = [...data.keys()].filter((key) => key.startsWith("claim:"));
  assert.equal(claimRecords.length, 1, "exactly one claim record exists — nothing duplicated");
  assert.equal(sessionPuts(SESSION_ID).length, 0);
  assert.deepEqual(data.get(sessionKey(SESSION_ID)), before);
});

test("RESIDUAL stale pointer READ on retry: a second claim mints and supersedes (round 6)", async () => {
  const before = seedSession();
  // Attempt 1: the pointer write is applied but its response is lost, so
  // no token is returned — the fresh-storage retry above converges from
  // exactly this state. THIS retry's pointer read is STALE instead: it
  // observes the pre-write snapshot (null), as a lagging KV read can.
  const realSetDurable = kv.setDurable;
  let lostOnce = false;
  kv.setDurable = async (key, value) => {
    if (key === pointerKey(SESSION_ID) && !lostOnce) {
      lostOnce = true;
      data.set(key, structuredClone(value)); // applied…
      throw new Error("injected: response lost after apply"); // …unseen by the caller
    }
    return realSetDurable(key, value);
  };
  await assert.rejects(
    () => getOrCreateClaimToken(SESSION_ID, structuredClone(before)),
    /response lost after apply/,
  );
  kv.setDurable = realSetDurable;
  const landedToken = data.get(pointerKey(SESSION_ID))?.token;
  assert.ok(landedToken, "attempt 1's pointer write did land");

  const realGet = kv.get;
  let staleArmed = true;
  kv.get = async (key) => {
    if (staleArmed && key === pointerKey(SESSION_ID)) {
      staleArmed = false;
      return null; // the stale pre-write snapshot
    }
    return realGet(key);
  };
  const retry = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  kv.get = realGet;

  // Honest outcome: the retry cannot see a governing token, so it mints.
  // TWO claim records now exist and the pointer has MOVED — the landed
  // token from the lost response is superseded and no longer governs.
  assert.notEqual(retry, landedToken);
  const claimRecords = [...data.keys()].filter((key) => key.startsWith("claim:"));
  assert.equal(claimRecords.length, 2, "the stale-read retry minted a second claim record");
  assert.equal(data.get(pointerKey(SESSION_ID)).token, retry, "the pointer moved to the retry's token");
  // Later issuances with fresh reads converge on the retry's token.
  const after = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.equal(after, retry);
  assert.equal(sessionPuts(SESSION_ID).length, 0, "still zero session-record writes");
  assert.deepEqual(data.get(sessionKey(SESSION_ID)), before);
});

test("RESIDUAL concurrent issuance: both mint, exactly one governs (round 6)", async () => {
  const before = seedSession();
  // Force the race open deterministically: BOTH issuances complete
  // their initial pointer read — observing the same pre-write snapshot
  // (null) — before either is allowed to proceed to mint.
  const realGet = kv.get;
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  kv.get = async (key) => {
    if (key === pointerKey(SESSION_ID)) {
      arrived += 1;
      if (arrived === 2) release();
      await gate;
      return null;
    }
    return realGet(key);
  };
  const [tokenA, tokenB] = await Promise.all([
    getOrCreateClaimToken(SESSION_ID, structuredClone(before)),
    getOrCreateClaimToken(SESSION_ID, structuredClone(before)),
  ]);
  kv.get = realGet;
  assert.equal(arrived, 2, "both issuances really did read the pointer before either wrote");

  // Honest outcome: two distinct tokens, two claim records, and the
  // pointer names exactly one of them (last durable write wins). The
  // other token's claim record persists but the token does not govern.
  assert.notEqual(tokenA, tokenB);
  const claimRecords = [...data.keys()].filter((key) => key.startsWith("claim:"));
  assert.equal(claimRecords.length, 2, "both issuances minted claim records");
  const governing = data.get(pointerKey(SESSION_ID))?.token;
  assert.ok(governing === tokenA || governing === tokenB, "the pointer names one of the two");
  const after = await getOrCreateClaimToken(SESSION_ID, structuredClone(before));
  assert.equal(after, governing, "later issuances converge on the governing token");
  assert.equal(sessionPuts(SESSION_ID).length, 0, "still zero session-record writes");
  assert.deepEqual(data.get(sessionKey(SESSION_ID)), before);
});

test("PASS claim-record write failure: no token is returned and the session is untouched", async () => {
  const before = seedSession();
  // Fail every claim-record write: intercept by key prefix.
  const realSet = kv.set;
  kv.set = async (key, value) => {
    if (key.startsWith("claim:")) throw new Error("injected claim write failure");
    return realSet(key, value);
  };
  await assert.rejects(
    () => getOrCreateClaimToken(SESSION_ID, structuredClone(before)),
    /injected claim write failure/,
  );
  kv.set = realSet;
  assert.equal(data.get(pointerKey(SESSION_ID)), undefined, "no pointer without a claim record");
  assert.equal(sessionPuts(SESSION_ID).length, 0);
  assert.deepEqual(data.get(sessionKey(SESSION_ID)), before);
});
