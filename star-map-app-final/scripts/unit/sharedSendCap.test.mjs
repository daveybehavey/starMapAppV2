import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);
register("./hcapFinite.hooks.mjs", import.meta.url);
process.env.RESEND_API_KEY = "test-only-placeholder";
process.env.PROMOTION_EMAIL_FROM = "test@example.invalid";
process.env.PROMOTION_UNSUBSCRIBE_SECRET = "test-only-unsubscribe-secret";
process.env.COMMERCIAL_EMAIL_MAILING_ADDRESS = "Test fixture address";
delete process.env.SENDGRID_API_KEY;
const promotions = await import("../../src/lib/promotions.ts");
const guard = await import("../../src/lib/promotionDispatchGuard.ts");
const { drivePromotionJobs } = await import("../../src/lib/promotionCoordinator.ts");
const { ConsistencyCoordinatorDO } = await import("../../src/durable-objects/ConsistencyCoordinatorDO.ts");
const { createSendCapClient, dispatchPrerequisite } = await import("../../src/lib/sharedSendCap.ts");
const { SEND_CAP_OBJECT_NAME, SEND_CAP_WINDOW_MS } = await import("../../src/lib/sharedSendCapState.ts");
const { executeReviewDispatch } = await import("../../src/lib/reviewRequestSuppression.ts");

function harness(t) {
  let clock = 1_000_000;
  t.mock.method(Date, "now", () => clock);
  let row;
  let failRead = false,
    failWrite = false;
  const sql = {
    exec(query, ...args) {
      if (query.trim().startsWith("CREATE")) return { toArray: () => [] };
      if (query.trim().startsWith("SELECT")) {
        if (failRead) throw Error("read failed");
        return { toArray: () => (row ? [row] : []) };
      }
      if (query.trim().startsWith("INSERT")) {
        if (failWrite) throw Error("write failed");
        row = { object_id: args[0], state_json: args[1], updated_at: args[2] };
        return { toArray: () => [] };
      }
      throw Error("unexpected SQL");
    },
  };
  const env = { PROMOTION_DISPATCH_ENABLED: "true" };
  let object = new ConsistencyCoordinatorDO(
    { id: { name: SEND_CAP_OBJECT_NAME }, storage: { sql }, blockConcurrencyWhile: (fn) => fn() },
    env
  );
  env.CONSISTENCY_COORDINATOR = {
    idFromName(name) {
      assert.equal(name, SEND_CAP_OBJECT_NAME);
      return name;
    },
    get() {
      return object;
    },
  };
  return {
    object,
    env,
    client: createSendCapClient(env),
    restart: () => {
      object = new ConsistencyCoordinatorDO(
        { id: { name: SEND_CAP_OBJECT_NAME }, storage: { sql }, blockConcurrencyWhile: (fn) => fn() },
        env
      );
    },
    now: () => clock,
    advance: (ms) => {
      clock += ms;
    },
    state: () => (row ? JSON.parse(row.state_json) : null),
    corrupt: () => {
      row = { state_json: '{"kind":"send_cap","slots":[{}]}' };
    },
    failRead: () => {
      failRead = true;
    },
    failWrite: () => {
      failWrite = true;
    },
  };
}

test("H-cap: concurrent mixed-family reservations permit 25, refuse 26, persist across restart", async (t) => {
  const h = harness(t);
  const results = await Promise.all(
    Array.from({ length: 26 }, (_, i) => h.client.reserve(i % 2 ? "review" : "promotion"))
  );
  assert.equal(results.filter((r) => r.permitted).length, 25);
  assert.deepEqual(results[25], { permitted: false, reason: "send_cap_exhausted" });
  assert.equal(h.state().slots.length, 25);
  h.restart();
  h.advance(2 * SEND_CAP_WINDOW_MS); // orphaned reservations must not time out
  assert.equal((await createSendCapClient(h.env).reserve("review")).reason, "send_cap_exhausted");
});

test("H-cap: open left boundary counts at 24h minus 1ms, frees exactly 24h", async (t) => {
  const h = harness(t);
  for (let i = 0; i < 25; i++) {
    const r = await h.client.reserve("promotion");
    assert.equal(await h.client.commit(r.reservation, h.now()), true);
  }
  h.advance(SEND_CAP_WINDOW_MS - 1);
  assert.equal((await h.client.reserve("review")).reason, "send_cap_exhausted");
  h.advance(1);
  assert.equal((await h.client.reserve("review")).permitted, true);
  assert.equal(h.state().slots.length, 1);
});

for (const failure of ["failRead", "failWrite", "corrupt"]) {
  test(`H-cap: ${failure} refuses without local fallback`, async (t) => {
    const h = harness(t);
    process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
    h[failure]();
    assert.deepEqual(await h.client.reserve("review"), { permitted: false, reason: "send_cap_unavailable" });
  });
}
test("H-cap: missing binding, thrown RPC and malformed RPC all refuse", async (t) => {
  for (const env of [
    {},
    {
      CONSISTENCY_COORDINATOR: {
        idFromName: (x) => x,
        get: () => ({ async reserveCommercialSend() { throw Error("rpc"); } }),
      },
    },
    {
      CONSISTENCY_COORDINATOR: {
        idFromName: (x) => x,
        get: () => ({ reserveCommercialSend: () => ({ permitted: true }) }),
      },
    },
  ]) {
    assert.deepEqual(await createSendCapClient(env).reserve("review"), {
      permitted: false,
      reason: "send_cap_unavailable",
    });
  }
  const h = harness(t);
  h.env.CONSISTENCY_COORDINATOR.get = () => ({
    async reserveCommercialSend(input) {
      h.object.reserveCommercialSend(input);
      throw Error("response lost after persistence");
    },
  });
  assert.equal((await h.client.reserve("review")).reason, "send_cap_unavailable");
  assert.equal(h.state().slots[0].attemptedAt, null);
});
test("H-cap: promotion fence is default-off, distinct, and before binding access", async () => {
  for (const value of [undefined, "false", "1", true]) {
    const env = {
      PROMOTION_DISPATCH_ENABLED: value,
      get CONSISTENCY_COORDINATOR() {
        assert.fail("binding read");
      },
    };
    assert.deepEqual(dispatchPrerequisite("promotion", env), {
      permitted: false,
      reason: "promotion_dispatch_disabled",
    });
    assert.equal((await createSendCapClient(env).reserve("promotion")).reason, "promotion_dispatch_disabled");
  }
});

async function review(h, overrides = {}) {
  let checks = 0,
    sends = 0;
  const events = [];
  const ledger = {
    async apply(_id, op) {
      events.push(op.type);
      if (op.type === "begin_dispatch")
        return {
          outcome: "dispatching",
          state: { payload: { to: "test@example.invalid" }, retryDeadlineAt: h.now() + 1000 },
        };
      return { outcome: "resolved" };
    },
  };
  const result = await executeReviewDispatch(
    { sessionId: "test", claimId: "claim" },
    {
      ledger,
      sendCap: h.client,
      now: h.now,
      isSuppressed: async () => {
        checks++;
        return false;
      },
      checkEligibility: async () => ({ status: "eligible" }),
      send: async () => {
        sends++;
        events.push("send");
        return { ok: true, id: "fake" };
      },
      ...overrides,
    }
  );
  return { result, checks, sends, events };
}

test("H-cap review: suppression landing during reservation releases without send", async (t) => {
  const h = harness(t);
  let suppressed = false;
  const sendCap = {
    ...h.client,
    async reserve(family) {
      const r = await h.client.reserve(family);
      suppressed = true;
      return r;
    },
  };
  const r = await review(h, { sendCap, isSuppressed: async () => suppressed });
  assert.equal(r.result.outcome, "suppressed");
  assert.equal(r.sends, 0);
  assert.equal(h.state().slots.length, 0);
});
test("H-cap review: final deadline expiry releases without send", async (t) => {
  const h = harness(t);
  let checks = 0;
  const r = await review(h, {
    isSuppressed: async () => {
      if (++checks === 2) h.advance(1000);
      return false;
    },
  });
  assert.equal(r.result.outcome, "expired");
  assert.equal(r.sends, 0);
  assert.equal(h.state().slots.length, 0);
});
test("H-cap review: no counter await between final suppression and invocation", async (t) => {
  const h = harness(t);
  const events = [];
  const sendCap = {
    async reserve(f) {
      events.push("reserve");
      return h.client.reserve(f);
    },
    async release(r) {
      events.push("release");
      return h.client.release(r);
    },
    async commit(r, at) {
      events.push("commit");
      return h.client.commit(r, at);
    },
  };
  const r = await review(h, {
    sendCap,
    isSuppressed: async () => {
      events.push("suppression");
      return false;
    },
    send: async () => {
      events.push("send");
      return { ok: true, id: "fake" };
    },
  });
  assert.equal(r.result.outcome, "sent");
  assert.deepEqual(events, ["suppression", "reserve", "suppression", "send", "commit"]);
});
for (const behavior of [
  async () => {
    throw Error("ambiguous");
  },
  async () => ({ ok: false, error: "resend_fetch_failed" }),
  async () => ({ ok: true, id: null }),
]) {
  test("H-cap review: ambiguous provider attempt stays charged", async (t) => {
    const h = harness(t);
    await review(h, { send: behavior });
    assert.equal(h.state().slots.length, 1);
    assert.equal(h.state().slots[0].attemptedAt, h.now());
  });
}
test("H-cap: failed settlement retains capacity; pending crashes do not age out", async (t) => {
  const h = harness(t);
  const r = await h.client.reserve("review");
  h.failWrite();
  assert.equal(await h.client.release(r.reservation), false);
  assert.equal(await h.client.commit(r.reservation, h.now()), false);
  assert.equal(h.state().slots[0].attemptedAt, null);
  h.advance(2 * SEND_CAP_WINDOW_MS);
  assert.equal(h.state().slots.length, 1);
});

const permitted = async () => ({ permitted: true });
const payload = (kind) =>
  kind === "coupon"
    ? promotions.preparePromotionCouponPayload("test@example.invalid", "TEST")
    : promotions.preparePromotionFollowupPayload(
        "test@example.invalid",
        "TEST",
        new Date(1_000_000).toISOString()
      );

test("H-cap integration: coupon and followup share review capacity; actual 25th send proceeds, 26th does not", async (t) => {
  const h = harness(t);
  let fetches = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetches++;
    return new Response('{"id":"fake"}', { status: 200 });
  });
  for (let i = 0; i < 23; i++) assert.equal((await review(h)).result.outcome, "sent");
  for (const kind of ["coupon", "followup"]) {
    assert.equal(
      (
        await promotions.deliverPromotionSend(payload(kind), "fake", {
          env: h.env,
          checkDispatchPermission: permitted,
        })
      ).outcome,
      "accepted"
    );
  }
  const refused = await review(h);
  assert.deepEqual(refused.result, { outcome: "refused", reason: "send_cap_exhausted" });
  assert.deepEqual(refused.events, []); // no irreversible ledger transition on exhaustion
  assert.equal(
    (
      await promotions.deliverPromotionSend(payload("coupon"), "fake", {
        env: h.env,
        checkDispatchPermission: permitted,
      })
    ).reason,
    "send_cap_exhausted"
  );
  assert.equal(fetches, 2);
  assert.equal(h.state().slots.length, 25);
});

test("H-cap promotion: permission, compliance and provider configuration pass before reservation", async (t) => {
  const h = harness(t);
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("provider must not run");
  });
  assert.equal(
    (
      await promotions.deliverPromotionSend(payload("coupon"), "fake", {
        env: h.env,
        checkDispatchPermission: async () => ({ permitted: false, reason: "unsubscribed" }),
      })
    ).reason,
    "unsubscribed"
  );
  assert.equal(
    (
      await promotions.deliverPromotionSend({ ...payload("coupon"), headers: undefined }, "fake", {
        env: h.env,
        checkDispatchPermission: permitted,
      })
    ).outcome,
    "unconfigured"
  );
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    assert.equal(
      (
        await promotions.deliverPromotionSend(payload("coupon"), "fake", {
          env: h.env,
          checkDispatchPermission: permitted,
        })
      ).outcome,
      "unconfigured"
    );
  } finally {
    process.env.RESEND_API_KEY = saved;
  }
  assert.equal(h.state(), null);
});

test("H-cap promotion: SendGrid fallback charges one slot; ambiguous fetch is not refunded", async (t) => {
  const h = harness(t);
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  process.env.SENDGRID_API_KEY = "test-only-placeholder";
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "https://api.sendgrid.com/v3/mail/send");
    throw Error("ambiguous transport");
  });
  try {
    const result = await promotions.deliverPromotionSend(payload("followup"), "fake", {
      env: h.env,
      checkDispatchPermission: permitted,
    });
    assert.equal(result.outcome, "ambiguous");
    assert.equal(h.state().slots.length, 1);
    assert.equal(h.state().slots[0].attemptedAt, h.now());
  } finally {
    process.env.RESEND_API_KEY = saved;
    delete process.env.SENDGRID_API_KEY;
  }
});

test("H-cap promotion: persistence failure prevents provider invocation", async (t) => {
  const h = harness(t);
  h.failWrite();
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("provider must not run");
  });
  assert.deepEqual(
    await promotions.deliverPromotionSend(payload("coupon"), "fake", {
      env: h.env,
      checkDispatchPermission: permitted,
    }),
    { outcome: "refused", provider: "none", reason: "send_cap_unavailable" }
  );
});

test("H-cap fence-off: transport, permission checker, coordinator driver and alarm stop before other guards", async (t) => {
  const h = harness(t);
  const trap = new Proxy(
    {},
    {
      get() {
        assert.fail("other guard accessed");
      },
    }
  );
  delete h.env.PROMOTION_DISPATCH_ENABLED;
  const saved = process.env.PROMOTION_DISPATCH_ENABLED;
  delete process.env.PROMOTION_DISPATCH_ENABLED;
  try {
    assert.equal(guard.evaluatePromotionDispatchPermission(trap).reason, "promotion_dispatch_disabled");
    assert.equal(
      (await guard.createPromotionDispatchPermissionChecker(trap)("anything")).reason,
      "promotion_dispatch_disabled"
    );
    assert.deepEqual(await promotions.deliverPromotionSend(trap), {
      outcome: "refused",
      provider: "none",
      reason: "promotion_dispatch_disabled",
    });
    assert.equal(
      (await drivePromotionJobs(trap, "unused", "unused")).couponError,
      "promotion_dispatch_refused:promotion_dispatch_disabled"
    );
    h.failRead();
    await h.object.alarm();
  } finally {
    if (saved === undefined) delete process.env.PROMOTION_DISPATCH_ENABLED;
    else process.env.PROMOTION_DISPATCH_ENABLED = saved;
  }
});

for (const status of ["ineligible", "unavailable"]) {
  test(`H-cap review: ${status} eligibility releases reservation`, async (t) => {
    const h = harness(t);
    const r = await review(h, {
      checkEligibility: async () => ({ status, reason: "refunded", error: "test" }),
    });
    assert.equal(r.sends, 0);
    assert.equal(h.state().slots.length, 0);
  });
}
test("H-cap review: unavailable final suppression releases reservation", async (t) => {
  const h = harness(t);
  let checks = 0;
  const r = await review(h, { isSuppressed: async () => (++checks === 1 ? false : null) });
  assert.equal(r.result.outcome, "uncertain");
  assert.equal(r.sends, 0);
  assert.equal(h.state().slots.length, 0);
});
test("H-cap review: expired/failed ledger transitions release reservation", async (t) => {
  const h = harness(t);
  for (const outcome of ["expired", "quarantined", "not_dispatchable"]) {
    const r = await review(h, { ledger: { apply: async () => ({ outcome }) } });
    assert.equal(r.sends, 0);
    assert.equal(h.state().slots.length, 0);
  }
});
test("H-cap review: synchronous provider throw and timeout both retain charge", async (t) => {
  const h = harness(t);
  for (const send of [
    () => {
      throw Error("sync");
    },
    () => new Promise(() => {}),
  ]) {
    assert.equal((await review(h, { send, sendTimeoutMs: 1 })).result.outcome, "uncertain");
  }
  assert.equal(h.state().slots.length, 2);
  assert.ok(h.state().slots.every((slot) => slot.attemptedAt === h.now()));
});
test("H-cap: acknowledged attempts cannot be refunded and clock regression fails closed", async (t) => {
  const h = harness(t);
  const r = await h.client.reserve("review");
  assert.equal(await h.client.commit(r.reservation, h.now()), true);
  assert.equal(await h.client.release(r.reservation), false);
  h.advance(-1);
  assert.equal((await h.client.reserve("promotion")).reason, "send_cap_unavailable");
});
