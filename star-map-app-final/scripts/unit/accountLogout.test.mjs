import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

process.env.NODE_ENV = "test";
register(new URL("./moneyPathS931.hooks.mjs", import.meta.url));
register(new URL("./dl1S4NextServer.hooks.mjs", import.meta.url));
register("./tsAliasLoader.mjs", import.meta.url);
const { NextRequest } = await import("next/server");
const { kv, persistDurableKvDelete } = await import("../../src/lib/kv.ts");
const { POST } = await import("../../src/app/api/account/magic/logout/route.ts");
const { GET } = await import("../../src/app/api/account/my-sessions/route.ts");
const { accountLiteSessionKey, ACCOUNT_LITE_SESSION_COOKIE } = await import("../../src/lib/accountLiteAuth.ts");
const origin = "https://preview.example.test";
const request = (token, requestOrigin = origin) => new NextRequest(`${origin}/api/account/magic/logout`, {
  method: "POST",
  headers: {
    ...(requestOrigin === null ? {} : { origin: requestOrigin }),
    ...(token === undefined ? {} : { cookie: `${ACCOUNT_LITE_SESSION_COOKIE}=${token}` }),
  },
});
const cleared = (response) => assert.match(response.headers.get("set-cookie"), /Max-Age=0/i);
let data, deletes;
test.beforeEach((t) => {
  data = new Map();
  deletes = [];
  t.mock.method(kv, "get", async (key) => data.get(key) ?? null);
  t.mock.method(kv, "incr", async () => 1); // Keep auth assertions independent of rate limits.
  t.mock.method(kv, "deleteDurable", async (key) => {
    deletes.push(key);
    data.delete(key);
    return "OK";
  });
});
test("valid trimmed token: exact durable key, success and existing cookie attributes", async () => {
  data.set(accountLiteSessionKey("fixture-a"), { email: "synthetic@example.test" });
  const response = await POST(request(" fixture-a "));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(deletes, [accountLiteSessionKey("fixture-a")]);
  assert.equal(data.size, 0);
  cleared(response);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=lax/i);
  assert.match(response.headers.get("set-cookie"), /Path=\//);
  assert.equal(kv.get.mock.callCount(), 0);
});
test("pending durable delete prevents a successful response; concurrent new session survives", async (t) => {
  let release, entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  t.mock.method(kv, "deleteDurable", async (key) => { entered(); await gate; data.delete(key); });
  let returned = false;
  const pending = POST(request("fixture-a")).then((response) => { returned = true; return response; });
  await started;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(returned, false);
  data.set(accountLiteSessionKey("fixture-b"), { email: "synthetic@example.test" });
  release();
  assert.equal((await pending).status, 200);
  assert.ok(data.has(accountLiteSessionKey("fixture-b")));
  const authenticated = await GET(new NextRequest(`${origin}/api/account/my-sessions`, {
    headers: { cookie: `${ACCOUNT_LITE_SESSION_COOKIE}=fixture-b` },
  }));
  assert.equal(authenticated.status, 200);
});
test("durable failure preserves the browser cookie and permits retry", async (t) => {
  const original = kv.deleteDurable;
  t.mock.method(kv, "deleteDurable", async () => { throw new Error("injected failure"); });
  const response = await POST(request("fixture-a"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "service_unavailable" });
  assert.equal(response.headers.get("set-cookie"), null);
  kv.deleteDurable = original;
  assert.equal((await POST(request("fixture-a"))).status, 200);
});
test("remote success followed by mirror failure is unconfirmed; retry succeeds", async (t) => {
  let fail = true;
  t.mock.method(kv, "deleteDurable", async (key) => persistDurableKvDelete({
    cfKv: { delete: async () => { data.delete(key); } },
    allowLocalFallback: false, key, memoryStore: new Map(),
    removeFallback: async () => { if (fail) throw new Error("mirror failure"); },
  }));
  const response = await POST(request("fixture-a"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
  fail = false;
  assert.equal((await POST(request("fixture-a"))).status, 200);
});
for (const token of [undefined, "", "   "]) {
  test(`missing/empty cookie (${JSON.stringify(token)}) skips KV`, async () => {
    const response = await POST(request(token));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    cleared(response);
    assert.deepEqual(deletes, []);
  });
}
test("missing record and repeated logout are idempotent", async () => {
  for (let i = 0; i < 2; i++) {
    const response = await POST(request("fixture-missing"));
    assert.equal(response.status, 200);
    cleared(response);
  }
  assert.equal(deletes.length, 2);
});
for (const badOrigin of [null, "null", "malformed", "https://sibling.example.test", `${origin}/path`]) {
  test(`rejects invalid Origin (${JSON.stringify(badOrigin)}) before cookie or KV mutation`, async () => {
    const response = await POST(request("fixture-a", badOrigin));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(deletes, []);
  });
}
test("audit pin: retained stolen cookie loses authentication while same-email session B remains", async () => {
  const auth = { email: "synthetic@example.test", emailHash: "synthetic", createdAt: Date.now() };
  for (const token of ["fixture-a", "fixture-b"]) data.set(accountLiteSessionKey(token), auth);
  const sessions = (token) => GET(new NextRequest(`${origin}/api/account/my-sessions`, {
    headers: { cookie: `${ACCOUNT_LITE_SESSION_COOKIE}=${token}` },
  }));
  assert.equal((await sessions("fixture-a")).status, 200);
  assert.equal((await sessions("fixture-b")).status, 200);
  assert.equal((await POST(request("fixture-a"))).status, 200);
  // Deliberately retain A instead of relying on a browser cookie jar.
  assert.equal((await sessions("fixture-a")).status, 401);
  assert.equal((await sessions("fixture-b")).status, 200);
});
