import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalKvFallbackAllowed,
  KvDurableDeleteError,
  KvDurableWriteError,
  persistDurableKvDelete,
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
    async delete() {
      throw new Error("delete should not run");
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

test("durable put: provider-valid print-order TTL remote failure propagates without local success", async () => {
  // Mirrors persistPrintOrderRecord's >=60s retained-write path: setDurable with
  // an exact remaining TTL must not fall back to local-only success on CF put failure.
  const key = "print:order:cs_valid_ttl_fail";
  const memoryStore = new Map();
  const fallbackWrites = [];
  const cfKv = {
    async get() {
      return null;
    },
    async put(_putKey, _value, options) {
      assert.equal(options?.expirationTtl, 120);
      throw new Error("cf put unavailable for retained print order");
    },
    async delete() {
      throw new Error("delete should not run on persist path");
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
        mirrorLocalInCi: true,
        key,
        value: { status: "pending", customerPhone: "+15555550199", createdAt: 1_700_000_000_000 },
        ttlSeconds: 120,
        memoryStore,
        writeFallback: async (writtenKey, value) => {
          fallbackWrites.push({ key: writtenKey, value });
        },
      }),
    (error) => {
      assert.ok(error instanceof KvDurableWriteError);
      assert.equal(error.code, "kv_durable_write_failed");
      return true;
    }
  );

  assert.equal(memoryStore.has(key), false);
  assert.equal(fallbackWrites.length, 0);
});

test("durable put: provider-valid print-order TTL remote success mirrors only when requested", async () => {
  const key = "print:order:cs_valid_ttl_ok";
  const memoryStore = new Map();
  const fallbackWrites = [];
  const remotePuts = [];
  const record = { status: "pending", createdAt: 1_700_000_000_000 };
  const cfKv = {
    async get() {
      return null;
    },
    async put(putKey, value, options) {
      remotePuts.push({ key: putKey, value: JSON.parse(value), options });
    },
    async delete() {
      throw new Error("delete should not run on persist path");
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };

  const result = await persistDurableKvPut({
    cfKv,
    allowLocalFallback: false,
    mirrorLocalInCi: true,
    key,
    value: record,
    ttlSeconds: 60,
    memoryStore,
    writeFallback: async (writtenKey, value) => {
      fallbackWrites.push({ key: writtenKey, value });
    },
  });

  assert.equal(result, "OK");
  assert.equal(remotePuts.length, 1);
  assert.equal(remotePuts[0].key, key);
  assert.equal(remotePuts[0].options?.expirationTtl, 60);
  assert.deepEqual(memoryStore.get(key), record);
  assert.equal(fallbackWrites.length, 1);
});

test("durable delete: remote success clears memory and fallback mirrors", async () => {
  const key = "print:order:cs_delete_ok";
  const memoryStore = new Map([[key, { customerPhone: "+15555550199" }]]);
  const removedFallback = [];
  let remoteDeleted = false;
  const cfKv = {
    async get() {
      return null;
    },
    async put() {
      throw new Error("put should not run");
    },
    async delete(deletedKey) {
      assert.equal(deletedKey, key);
      remoteDeleted = true;
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };

  const result = await persistDurableKvDelete({
    cfKv,
    allowLocalFallback: false,
    key,
    memoryStore,
    removeFallback: async (removedKey) => {
      removedFallback.push(removedKey);
    },
  });

  assert.equal(result, "OK");
  assert.equal(remoteDeleted, true);
  assert.equal(memoryStore.has(key), false);
  assert.deepEqual(removedFallback, [key]);
});

test("durable delete: remote failure throws and does not clear local copies", async () => {
  const key = "print:order:cs_delete_fail";
  const memoryStore = new Map([[key, { customerPhone: "+15555550199" }]]);
  const removedFallback = [];
  const cfKv = {
    async get() {
      return null;
    },
    async put() {
      throw new Error("put should not run");
    },
    async delete() {
      throw new Error("cf delete unavailable");
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };

  await assert.rejects(
    () =>
      persistDurableKvDelete({
        cfKv,
        allowLocalFallback: true,
        key,
        memoryStore,
        removeFallback: async (removedKey) => {
          removedFallback.push(removedKey);
        },
      }),
    (error) => {
      assert.ok(error instanceof KvDurableDeleteError);
      assert.equal(error.code, "kv_durable_delete_failed");
      return true;
    }
  );

  assert.equal(memoryStore.has(key), true);
  assert.equal(removedFallback.length, 0);
});

test("durable delete: intentional local/CI mode removes memory and fallback when CF absent", async () => {
  const key = "print:order:cs_delete_local";
  const memoryStore = new Map([[key, { status: "pending" }]]);
  const removedFallback = [];
  const result = await persistDurableKvDelete({
    cfKv: null,
    allowLocalFallback: true,
    key,
    memoryStore,
    removeFallback: async (removedKey) => {
      removedFallback.push(removedKey);
    },
  });
  assert.equal(result, "OK");
  assert.equal(memoryStore.has(key), false);
  assert.deepEqual(removedFallback, [key]);
});

test("durable delete: production without CF binding rejects rather than silent local success", async () => {
  const key = "print:order:cs_delete_prod_missing";
  const memoryStore = new Map([[key, { status: "pending" }]]);
  await assert.rejects(
    () =>
      persistDurableKvDelete({
        cfKv: null,
        allowLocalFallback: false,
        key,
        memoryStore,
        removeFallback: async () => {
          throw new Error("fallback remove must not run");
        },
      }),
    KvDurableDeleteError
  );
  assert.equal(memoryStore.has(key), true);
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
    async delete() {
      throw new Error("delete should not run");
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
