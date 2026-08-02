import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalKvFallbackAllowed,
  KvDurableWriteError,
  persistDurableKvPut,
  persistOrdinaryKvPutWithLocalFallbackOnRemoteFailure,
} from "../../src/lib/kv.ts";

test("isLocalKvFallbackAllowed: explicit local/CI/test boundaries only", () => {
  assert.equal(isLocalKvFallbackAllowed({ CI: "1" }), true);
  assert.equal(isLocalKvFallbackAllowed({ STARMAP_KV_ALLOW_LOCAL: "1" }), true);
  assert.equal(isLocalKvFallbackAllowed({ NODE_ENV: "development" }), true);
  assert.equal(isLocalKvFallbackAllowed({ NODE_ENV: "test" }), true);
  assert.equal(isLocalKvFallbackAllowed({ NODE_ENV: "production" }), false);
  assert.equal(isLocalKvFallbackAllowed({ NODE_ENV: "production", CI: "1" }), true);
});

test("durable put: Cloudflare put failure propagates and does not populate local fallback", async () => {
  const memoryStore = new Map();
  const fallbackWrites = [];
  const cfKv = {
    async get() {
      return null;
    },
    async put() {
      throw new Error("cf put unavailable");
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };

  await assert.rejects(
    () =>
      persistDurableKvPut({
        cfKv,
        allowLocalFallback: false,
        mirrorLocalInCi: false,
        key: "stripe:session:cs_durable_fail",
        value: { recoveryEmailSentAt: 1 },
        memoryStore,
        writeFallback: async (key, value) => {
          fallbackWrites.push({ key, value });
        },
      }),
    (error) => {
      assert.ok(error instanceof KvDurableWriteError);
      assert.equal(error.code, "kv_durable_write_failed");
      return true;
    }
  );

  assert.equal(memoryStore.size, 0);
  assert.equal(fallbackWrites.length, 0);
});

test("durable put: intentional local mode writes memory/file when CF absent", async () => {
  const memoryStore = new Map();
  const fallbackWrites = [];
  await persistDurableKvPut({
    cfKv: null,
    allowLocalFallback: true,
    mirrorLocalInCi: false,
    key: "stripe:session:cs_local_ok",
    value: { recoveryEmailSentAt: 42 },
    memoryStore,
    writeFallback: async (key, value) => {
      fallbackWrites.push({ key, value });
    },
  });
  assert.deepEqual(memoryStore.get("stripe:session:cs_local_ok"), { recoveryEmailSentAt: 42 });
  assert.equal(fallbackWrites.length, 1);
});

test("durable put: production without CF binding rejects rather than silent local success", async () => {
  const memoryStore = new Map();
  await assert.rejects(
    () =>
      persistDurableKvPut({
        cfKv: null,
        allowLocalFallback: false,
        mirrorLocalInCi: false,
        key: "stripe:session:cs_prod_missing_binding",
        value: { recoveryEmailSentAt: 7 },
        memoryStore,
        writeFallback: async () => {
          throw new Error("fallback must not run");
        },
      }),
    KvDurableWriteError
  );
  assert.equal(memoryStore.size, 0);
});

test("negative control: ordinary set swallows CF failure into local success (marker-only race)", async () => {
  const memoryStore = new Map();
  const fallbackWrites = [];
  const remoteMarkerStore = new Map();
  const cfKv = {
    async get() {
      return null;
    },
    async put(key, value) {
      if (key.includes("email_delivered")) {
        remoteMarkerStore.set(key, JSON.parse(value));
        return;
      }
      throw new Error("session put failed remotely");
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };

  // Old ordinary semantics: session put fails → local OK.
  await persistOrdinaryKvPutWithLocalFallbackOnRemoteFailure({
    cfKv,
    key: "stripe:session:cs_old_race",
    value: { recoveryEmailSentAt: 99, recoveryEmailProvider: "resend" },
    memoryStore,
    writeFallback: async (key, value) => {
      fallbackWrites.push({ key, value });
    },
  });
  assert.equal(memoryStore.has("stripe:session:cs_old_race"), true);

  // Marker write then succeeds remotely — other workers see marker-only durable state.
  await cfKv.put(
    "stripe:checkout_recovery:email_delivered:cs_old_race",
    JSON.stringify({ delivered: true, at: 99 })
  );
  assert.equal(remoteMarkerStore.has("stripe:checkout_recovery:email_delivered:cs_old_race"), true);
  // Durable path would have thrown before marker; ordinary path permitted this split brain.
  assert.equal(fallbackWrites.length, 1);
});
