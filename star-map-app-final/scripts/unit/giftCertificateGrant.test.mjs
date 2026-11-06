/**
 * giftCertificateGrant.test.mjs — Tier C review condition 1
 * (2026-11-06): cross-isolate gift-certificate grant safety.
 *
 * The property G-dot required: a delayed grant write must not be
 * able to replenish credits the recipient has already spent.
 *
 * Storage facts this rests on (src/lib/kv.ts): KV `set`/`setDurable`
 * are unconditional puts — there is no compare-and-swap — and
 * `withSerializedKvUpdate` serializes only within one isolate. The
 * grant and the spend both rewrite the SAME whole entitlement record
 * (`stripe:session:{entitlementSessionId}`; the spend path in
 * src/app/api/entitlements/consume/route.ts writes the record back
 * with a decremented creditsRemaining), so a grant write landing
 * after a spend write restores the spent credit.
 *
 * The closure (giftCertificateGrantState.ts): create-if-absent for
 * the grant is decided ONCE by the serialized GiftCertificateGrantDO
 * (one instance per entitlement session id), and publication is a
 * single serialized operation — the authority performs the KV write
 * itself and persists confirmation only after the write resolves,
 * so no grant write can be outstanding when a publish returns (and
 * delivery, then any spend, becomes possible). The first closure
 * left the write in the redeem route; the gate's return verdict
 * showed a repair pass could confirm and deliver while the winner's
 * write was still outstanding, and the delayed write then set the
 * balance a second time — the "winner's outstanding write" test
 * below is that exact interleaving, and it failed against the
 * route-side write before the fix.
 *
 * The interleaving tests execute the PRODUCTION orchestration
 * (publishGiftCertificateGrant + the production client over its
 * serialized store) against a scripted backing store, and include a
 * NEGATIVE CONTROL: the same interleaving run against the previous
 * KV-only create-if-absent strategy replenishes the balance, proving
 * the harness detects the bug class it claims to close.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./entitlementAuthority.hooks.mjs", import.meta.url);

process.env.STARMAP_GIFT_CERTIFICATE_GRANT_LOCAL = "1";

const {
  confirmGiftCertificateGrantPublished,
  createEmptyGiftCertificateGrantRow,
  initializeGiftCertificateGrant,
  isGiftCertificateGrantPublicationOpen,
  isValidGiftCertificateGrantRow,
} = await import("../../src/lib/giftCertificateGrantState.ts");
const {
  __resetGiftCertificateGrantMemoryForTests,
  buildGiftCertificateEntitlementRecord,
  createGiftCertificateGrantClient,
  publishGiftCertificateGrant,
} = await import("../../src/lib/giftCertificateGrant.ts");
const { GiftCertificateGrantDO } = await import(
  "../../src/durable-objects/GiftCertificateGrantDO.ts"
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const SESSION = "giftcert:cs_test_grant";
const KEY = `stripe:session:${SESSION}`;
const TERMS = { certificateId: "cs_test_grant", tier: "hd_pack3", plan: "pack3", creditsTotal: 3 };
const T1 = Date.parse("2026-11-06T12:00:00Z");

/**
 * A scripted stand-in for the shared KV namespace: one backing map,
 * read/written through per-"isolate" facades. Reads can be served a
 * forced stale snapshot (KV's cross-isolate eventual consistency) —
 * though the production grant no longer reads KV for its decision,
 * the negative control below does.
 */
function createBackingKv() {
  const data = new Map();
  return {
    data,
    facade({ staleReads = new Map() } = {}) {
      return {
        async get(key) {
          if (staleReads.has(key)) return staleReads.get(key);
          return data.get(key) ?? null;
        },
        async setDurable(key, value) {
          data.set(key, value);
        },
      };
    },
  };
}

/** The spend, shaped like the consume route: read the whole record,
 * write it back with one credit decremented. */
async function spendOneCredit(backing) {
  const record = backing.data.get(KEY);
  assert.ok(record, "spend requires the granted record");
  backing.data.set(KEY, { ...record, creditsRemaining: record.creditsRemaining - 1 });
  return backing.data.get(KEY).creditsRemaining;
}

test("state machine: initialize is create-if-absent and the standing terms win", () => {
  const empty = createEmptyGiftCertificateGrantRow(SESSION);
  assert.equal(isValidGiftCertificateGrantRow(empty), true);
  assert.equal(isGiftCertificateGrantPublicationOpen(empty), false, "no grant yet: nothing to publish");

  const first = initializeGiftCertificateGrant(empty, { terms: TERMS, now: T1 });
  assert.equal(first.created, true);
  assert.equal(first.changed, true);
  assert.equal(first.grant.initializedAt, T1);
  assert.equal(isGiftCertificateGrantPublicationOpen(first.row), true, "initialized + unconfirmed: publication open");

  // A second initialize — even with DIFFERENT terms — is not a
  // creation and does not move the standing grant.
  const second = initializeGiftCertificateGrant(first.row, {
    terms: { ...TERMS, creditsTotal: 99 },
    now: T1 + 1000,
  });
  assert.equal(second.created, false);
  assert.equal(second.changed, false);
  assert.equal(second.grant.creditsTotal, 3, "the recorded terms are authoritative");
  assert.equal(second.grant.initializedAt, T1);
});

test("state machine: confirm requires a grant, is idempotent, and closes publication", () => {
  const empty = createEmptyGiftCertificateGrantRow(SESSION);
  const early = confirmGiftCertificateGrantPublished(empty, { now: T1 });
  assert.equal(early.confirmed, false, "an empty row cannot be confirmed");
  assert.equal(early.changed, false);
  assert.equal(early.row.publishedAt, null);

  const initialized = initializeGiftCertificateGrant(empty, { terms: TERMS, now: T1 }).row;
  const confirmed = confirmGiftCertificateGrantPublished(initialized, { now: T1 + 5 });
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.changed, true);
  assert.equal(confirmed.row.publishedAt, T1 + 5);
  assert.equal(isGiftCertificateGrantPublicationOpen(confirmed.row), false);

  const again = confirmGiftCertificateGrantPublished(confirmed.row, { now: T1 + 9 });
  assert.equal(again.confirmed, true);
  assert.equal(again.changed, false);
  assert.equal(again.row.publishedAt, T1 + 5, "the first confirmation stands");
});

test("state machine: structural validation rejects corrupt rows", () => {
  const good = initializeGiftCertificateGrant(createEmptyGiftCertificateGrantRow(SESSION), {
    terms: TERMS,
    now: T1,
  }).row;
  assert.equal(isValidGiftCertificateGrantRow(good), true);
  assert.equal(isValidGiftCertificateGrantRow(null), false);
  assert.equal(isValidGiftCertificateGrantRow({ ...good, entitlementSessionId: "" }), false);
  assert.equal(
    isValidGiftCertificateGrantRow({ entitlementSessionId: SESSION, grant: null, publishedAt: T1 }),
    false,
    "published without a grant is corrupt",
  );
  assert.equal(
    isValidGiftCertificateGrantRow({ ...good, grant: { ...good.grant, creditsTotal: 0 } }),
    false,
  );
  assert.equal(
    isValidGiftCertificateGrantRow({ ...good, grant: { ...good.grant, initializedAt: Number.NaN } }),
    false,
  );
});

class FakeSqlStorage {
  constructor(rows = new Map()) {
    this.rows = rows;
  }
  exec(sql, ...params) {
    const head = sql.trimStart().slice(0, 6).toUpperCase();
    if (head.startsWith("CREATE")) return { toArray: () => [] };
    if (head.startsWith("SELECT")) {
      const row = this.rows.get(params[0]);
      return { toArray: () => (row ? [row] : []) };
    }
    if (head.startsWith("INSERT")) {
      const [id, stateJson, updatedAt] = params;
      this.rows.set(id, { session_id: id, state_json: stateJson, updated_at: updatedAt });
      return { toArray: () => [] };
    }
    throw new Error(`unexpected SQL in fake: ${sql.slice(0, 80)}`);
  }
}
const fakeCtx = (sql) => ({
  storage: { sql },
  blockConcurrencyWhile(fn) {
    return fn();
  },
});

test("DO shell: initialize/confirm persist across a restart; absence is an empty row", async () => {
  const sql = new FakeSqlStorage();
  const first = new GiftCertificateGrantDO(fakeCtx(sql), {});
  const absent = await first.getRow(SESSION);
  assert.deepEqual(absent, createEmptyGiftCertificateGrantRow(SESSION));

  const init = await first.initialize(SESSION, { terms: TERMS, now: T1 });
  assert.equal(init.created, true);
  const conf = await first.confirmPublished(SESSION, { now: T1 + 5 });
  assert.equal(conf.confirmed, true);

  const restarted = new GiftCertificateGrantDO(fakeCtx(sql), {});
  const row = await restarted.getRow(SESSION);
  assert.equal(row.grant.creditsTotal, 3);
  assert.equal(row.publishedAt, T1 + 5);
  const reInit = await restarted.initialize(SESSION, { terms: TERMS, now: T1 + 99 });
  assert.equal(reInit.created, false);
});

test("DO publish: the winner's in-flight KV write blocks a second publish; exactly one put ever lands", async () => {
  // The chair's interleaving at the production layer: the DO performs
  // the entitlement put itself, inside the serialized publish
  // operation — so while the winner's put is in flight, a second
  // publish cannot confirm, cannot write, and cannot return (the
  // start path cannot proceed), and no put remains outstanding once
  // a publish has returned.
  const sql = new FakeSqlStorage();
  const kvData = new Map();
  let putCount = 0;
  let putIssued = false;
  let releasePut;
  const putGate = new Promise((resolve) => {
    releasePut = resolve;
  });
  const fakeKv = {
    async put(key, value) {
      putCount += 1;
      if (putCount === 1) {
        putIssued = true;
        await putGate; // the first put is in flight; it has NOT landed
      }
      kvData.set(key, value);
    },
  };
  const grant = new GiftCertificateGrantDO(fakeCtx(sql), { STAR_MAP_KV: fakeKv });

  const passA = grant.publish(SESSION, { terms: TERMS, now: T1, entitlementKey: KEY });
  for (let i = 0; i < 50 && !putIssued; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(putIssued, "the authority reached its publication put");

  let bSettled = false;
  const passB = grant
    .publish(SESSION, { terms: TERMS, now: T1 + 1000, entitlementKey: KEY })
    .then((result) => {
      bSettled = true;
      return result;
    });
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(bSettled, false, "a second publish cannot proceed while the winner's put is outstanding");
  assert.equal(kvData.has(KEY), false, "no entitlement record stands before the winner's put lands");

  releasePut();
  assert.deepEqual(await passA, { published: true, created: true });
  assert.deepEqual(await passB, { published: false, created: false });
  assert.equal(putCount, 1, "exactly one entitlement put ever happens");
  const record = JSON.parse(kvData.get(KEY));
  assert.equal(record.creditsRemaining, 3);
  assert.equal(record.created, T1, "the record's created is the winning initialize time");

  // The recipient spends (whole-record rewrite, as the consume route
  // performs) — and a further publish still writes nothing.
  kvData.set(KEY, JSON.stringify({ ...record, creditsRemaining: record.creditsRemaining - 1 }));
  const third = await grant.publish(SESSION, { terms: TERMS, now: T1 + 60_000, entitlementKey: KEY });
  assert.deepEqual(third, { published: false, created: false });
  assert.equal(putCount, 1, "no put after confirmation");
  assert.equal(JSON.parse(kvData.get(KEY)).creditsRemaining, 2, "the spent credit stays spent");
});

test("interleaving: a delayed second grant pass cannot replenish a spent credit", async () => {
  __resetGiftCertificateGrantMemoryForTests();
  const backing = createBackingKv();
  const client = createGiftCertificateGrantClient();
  let writes = 0;
  const countingWriter = (kv) => async (record) => {
    writes += 1;
    await kv.setDurable(KEY, record);
  };

  // Pass A (isolate 1): the winning grant. Writes the initial record
  // (3 credits) and confirms publication.
  const passA = await publishGiftCertificateGrant({
    client,
    entitlementSessionId: SESSION,
    terms: TERMS,
    now: T1,
    writeEntitlementRecord: countingWriter(backing.facade()),
  });
  assert.deepEqual(passA, { published: true, created: true });
  assert.equal(backing.data.get(KEY).creditsRemaining, 3);

  // The recipient spends one credit (whole-record rewrite, as the
  // consume route performs).
  assert.equal(await spendOneCredit(backing), 2);

  // Pass B (isolate 2): a racing retry whose view of KV is STALE —
  // its facade still serves the pre-grant absence — and whose write,
  // if it made one, would land now, after the spend. Under the old
  // strategy this is exactly the replenishment interleaving (see the
  // negative control). The authority answers created=false +
  // confirmed, so pass B performs NO write at all.
  const stale = new Map([[KEY, null]]);
  const passB = await publishGiftCertificateGrant({
    client,
    entitlementSessionId: SESSION,
    terms: TERMS,
    now: T1 + 60_000,
    writeEntitlementRecord: countingWriter(backing.facade({ staleReads: stale })),
  });
  assert.deepEqual(passB, { published: false, created: false });
  assert.equal(writes, 1, "exactly one grant write ever happened");
  assert.equal(
    backing.data.get(KEY).creditsRemaining,
    2,
    "the spent credit stays spent — the balance cannot increase",
  );
});

test("interleaving: the winner's outstanding write cannot land after a second pass confirms and a spend settles (G-dot return verdict)", async () => {
  // The interleaving the chair named on the return: pass A initializes
  // and its entitlement write is ISSUED but has not landed; a second
  // pass must not be able to confirm publication, deliver, and let a
  // spend settle while A's write is still outstanding — otherwise A's
  // write lands last and sets the initial balance a second time.
  __resetGiftCertificateGrantMemoryForTests();
  const backing = createBackingKv();
  const client = createGiftCertificateGrantClient();
  const writes = [];
  let releaseAWrite;
  const aWriteGate = new Promise((resolve) => {
    releaseAWrite = resolve;
  });
  let aWriteIssued = false;
  const writerA = async (record) => {
    aWriteIssued = true;
    await aWriteGate; // the put is in flight; it has NOT landed
    writes.push(record);
    backing.data.set(KEY, record);
  };
  const writerB = async (record) => {
    writes.push(record);
    backing.data.set(KEY, record);
  };

  // Pass A (isolate 1): wins initialize, then stalls inside its write.
  const passA = publishGiftCertificateGrant({
    client,
    entitlementSessionId: SESSION,
    terms: TERMS,
    now: T1,
    writeEntitlementRecord: writerA,
  });
  for (let i = 0; i < 50 && !aWriteIssued; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(aWriteIssued, "pass A reached its entitlement write");

  // Pass B (isolate 2): a racing redemption of the same code while
  // A's grant stands initialized-but-unconfirmed with a write
  // outstanding.
  let bSettled = false;
  const passB = publishGiftCertificateGrant({
    client,
    entitlementSessionId: SESSION,
    terms: TERMS,
    now: T1 + 1000,
    writeEntitlementRecord: writerB,
  }).then((result) => {
    bSettled = true;
    return result;
  });
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(
    bSettled,
    false,
    "the start path must not proceed while an initialized grant has a write outstanding",
  );
  assert.equal(
    backing.data.has(KEY),
    false,
    "no entitlement record may stand while the winner's write is outstanding",
  );

  // A's write lands and A confirms; only now may B complete — and it
  // must write nothing.
  releaseAWrite();
  const resultA = await passA;
  assert.deepEqual(resultA, { published: true, created: true });
  const resultB = await passB;
  assert.deepEqual(resultB, { published: false, created: false });
  assert.equal(writes.length, 1, "exactly one entitlement write ever happens");
  assert.equal(backing.data.get(KEY).creditsRemaining, 3);

  // Delivery has happened (a grant returned), so the recipient
  // spends — and nothing remains outstanding that could set the
  // balance again.
  assert.equal(await spendOneCredit(backing), 2);
  assert.equal(
    backing.data.get(KEY).creditsRemaining,
    2,
    "the balance was set exactly once — no replenishment",
  );
});

test("interleaving: concurrent passes create once; every write is the identical initial record", async () => {
  __resetGiftCertificateGrantMemoryForTests();
  const backing = createBackingKv();
  const client = createGiftCertificateGrantClient();
  const written = [];
  const writer = async (record) => {
    written.push(record);
    await backing.facade().setDurable(KEY, record);
  };
  const [a, b] = await Promise.all([
    publishGiftCertificateGrant({
      client,
      entitlementSessionId: SESSION,
      terms: TERMS,
      now: T1,
      writeEntitlementRecord: writer,
    }),
    publishGiftCertificateGrant({
      client,
      entitlementSessionId: SESSION,
      terms: TERMS,
      now: T1 + 1,
      writeEntitlementRecord: writer,
    }),
  ]);
  assert.equal([a, b].filter((r) => r.created).length, 1, "exactly one pass created the grant");
  // Publication is serialized: the losing pass runs only after the
  // winner's publish has fully completed (write landed + confirmed),
  // finds the grant confirmed, and writes nothing at all.
  assert.equal(written.length, 1, "exactly one write: the winner's, inside its serialized publish");
  for (const record of written) {
    assert.deepEqual(record, written[0], "every concurrent write is the identical initial record");
    assert.equal(record.created, T1, "initializedAt is the winning initialize time");
  }
  assert.equal(backing.data.get(KEY).creditsRemaining, 3);

  // After a spend, a further pass writes nothing at all.
  assert.equal(await spendOneCredit(backing), 2);
  const writesBefore = written.length;
  const third = await publishGiftCertificateGrant({
    client,
    entitlementSessionId: SESSION,
    terms: TERMS,
    now: T1 + 60_000,
    writeEntitlementRecord: writer,
  });
  assert.deepEqual(third, { published: false, created: false });
  assert.equal(written.length, writesBefore, "no write after confirmation");
  assert.equal(backing.data.get(KEY).creditsRemaining, 2);
});

test("interleaving: a grant left initialized and written but unconfirmed (crashed winner) is repaired byte-identically, then closes", async () => {
  __resetGiftCertificateGrantMemoryForTests();
  const backing = createBackingKv();
  const realClient = createGiftCertificateGrantClient();
  const seenWrites = [];
  const writer = async (record) => {
    seenWrites.push(record);
    await backing.facade().setDurable(KEY, record);
  };
  // The crashed winner, constructed from public operations: it
  // initialized the grant and its entitlement write landed, then it
  // died before confirmation persisted — the state the first
  // version's crash test injected by sabotaging confirmPublished
  // (publication is one serialized operation now, so the crash seam
  // is the state it leaves behind, not a mid-sequence throw).
  const init = await realClient.initialize(SESSION, { terms: TERMS, now: T1 });
  assert.equal(init.created, true);
  await writer(
    buildGiftCertificateEntitlementRecord({
      plan: init.grant.plan,
      creditsTotal: init.grant.creditsTotal,
      initializedAt: init.grant.initializedAt,
    }),
  );
  assert.equal(seenWrites.length, 1);
  // No delivery can have happened (no publish ever returned), so no
  // spend is possible yet — the repair window is safe by construction.

  // Pass B (the recipient's retry): not the creator, but publication
  // is still open, so it re-writes the standing terms and confirms.
  const repair = await publishGiftCertificateGrant({
    client: realClient,
    entitlementSessionId: SESSION,
    terms: TERMS,
    now: T1 + 30_000,
    writeEntitlementRecord: writer,
  });
  assert.deepEqual(repair, { published: true, created: false });
  assert.equal(seenWrites.length, 2);
  assert.deepEqual(seenWrites[1], seenWrites[0], "the repair write is byte-identical to the original");
  assert.equal(seenWrites[1].created, T1, "the entitlement's created is the initialize time, not the repair time");

  // Now the recipient spends, and a third pass still writes nothing.
  assert.equal(await spendOneCredit(backing), 2);
  const third = await publishGiftCertificateGrant({
    client: realClient,
    entitlementSessionId: SESSION,
    terms: TERMS,
    now: T1 + 60_000,
    writeEntitlementRecord: writer,
  });
  assert.deepEqual(third, { published: false, created: false });
  assert.equal(seenWrites.length, 2, "no write after confirmation");
  assert.equal(backing.data.get(KEY).creditsRemaining, 2);
});

test("NEGATIVE CONTROL: the previous KV-only create-if-absent strategy replenishes in the same interleaving", async () => {
  // The pre-condition-1 grant, transcribed from the redeem route at
  // 5e671257: read → if absent, write — serialized by
  // withSerializedKvUpdate, which is a PER-ISOLATE promise chain, so
  // two isolates hold two independent "locks" and do not exclude each
  // other. Each isolate below models its own lock faithfully.
  const backing = createBackingKv();
  const newIsolateLock = () => {
    let chain = Promise.resolve();
    return (_key, fn) => {
      const run = chain.then(fn);
      chain = run.catch(() => {});
      return run;
    };
  };
  const legacyGrant = (isolate) => async (entitlement, { afterRead } = {}) => {
    const key = KEY;
    return isolate.lock(key, async () => {
      const existing = await isolate.kv.get(key);
      if (existing) return;
      if (afterRead) await afterRead();
      await isolate.kv.setDurable(key, entitlement);
    });
  };
  const entitlement = () =>
    buildGiftCertificateEntitlementRecord({ plan: TERMS.plan, creditsTotal: 3, initializedAt: T1 });

  const isolateA = { kv: backing.facade(), lock: newIsolateLock() };
  const isolateB = {
    // Isolate B's read is served the stale pre-grant absence (KV
    // eventual consistency across isolates) — the read the old code
    // based its create-if-absent decision on.
    kv: backing.facade({ staleReads: new Map([[KEY, null]]) }),
    lock: newIsolateLock(),
  };

  // Isolate B starts first: reads absence, then its write is delayed
  // (the interleaving G-dot named: a delayed grant write).
  let releaseWrite;
  const writeGate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const passB = legacyGrant(isolateB)(entitlement(), { afterRead: () => writeGate });

  // Isolate A's grant completes and publishes 3 credits.
  await legacyGrant(isolateA)(entitlement());
  assert.equal(backing.data.get(KEY).creditsRemaining, 3);

  // The recipient spends one credit.
  assert.equal(await spendOneCredit(backing), 2);

  // Isolate B's delayed write finally lands — an unconditional put of
  // the initial record over the post-spend record.
  releaseWrite();
  await passB;
  assert.equal(
    backing.data.get(KEY).creditsRemaining,
    3,
    "CONTROL: the old strategy restores the spent credit — the harness detects the bug",
  );
});

test("wiring: DO binding, migration, worker export, env type, sentry allowlist (source pins)", () => {
  const wrangler = read("wrangler.toml");
  assert.ok(wrangler.includes('name = "GIFT_CERTIFICATE_GRANT"'), "DO binding present");
  assert.ok(wrangler.includes('class_name = "GiftCertificateGrantDO"'), "DO class bound");
  assert.ok(
    wrangler.includes('new_sqlite_classes = ["GiftCertificateGrantDO"]'),
    "sqlite migration registers the class",
  );
  const worker = read("cloudflare-worker.ts");
  assert.ok(
    worker.includes("export const GiftCertificateGrantDO = Sentry.instrumentDurableObjectWithSentry("),
    "worker exports the DO through the Sentry-instrumented wrapper",
  );
  const envTypes = read("cloudflare-env.d.ts");
  assert.ok(
    envTypes.includes("GIFT_CERTIFICATE_GRANT: DurableObjectNamespace /* GiftCertificateGrantDO */;"),
    "env type carries the binding",
  );
  const scrub = read("src/lib/sentryScrub.ts");
  assert.ok(scrub.includes('"GiftCertificateGrantDO"'), "sentry DO-name allowlist includes the class");
  const redeemRoute = read("src/app/api/gift-certificates/redeem/route.ts");
  assert.ok(redeemRoute.includes("terms: {"), "the route passes grant terms to the authority");
  assert.ok(redeemRoute.includes("creditsTotal: tier.credits"), "the granted credits are the tier's");
  // Return-verdict closure: the serialized publish operation and the
  // authority-side write are pinned so the write cannot drift back
  // into the route.
  const doShell = read("src/durable-objects/GiftCertificateGrantDO.ts");
  assert.ok(doShell.includes("async publish("), "the DO exposes the serialized publish operation");
  assert.ok(doShell.includes("STAR_MAP_KV"), "the DO writes via its own STAR_MAP_KV binding");
  assert.ok(
    doShell.includes("await this.putEntitlementRecord("),
    "the entitlement write happens inside the serialized publish, awaited before confirmation persists",
  );
  assert.ok(
    wrangler.includes('binding = "STAR_MAP_KV"'),
    "the KV binding the DO writes through is the app's namespace",
  );
});
