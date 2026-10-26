/**
 * Test-only rendezvous wrapper around the entitlement authority
 * client factory, used solely by dl1Slice4Route.test.mjs (the route
 * module's "@/lib/entitlementAuthority" import is redirected here by
 * dl1S4AuthorityRendezvous.hooks.mjs; every other importer resolves
 * the real module).
 *
 * Purpose (Codex P2 on the correction-round-3 head): the area-3 race
 * tests must FORCE the stale-snapshot interleaving structurally, not
 * probabilistically. When armed for a session, the first two
 * getState calls for that session each execute their real read and
 * then block on a barrier until BOTH reads have completed; only
 * then are both snapshots returned. A registration (apply) can only
 * be issued after the issuing request's getState returns, so both
 * snapshots are provably taken before either registration commits —
 * the exact precondition of the JN1→R7 stale-snapshot race. Later
 * getState calls (e.g. the route's bounded reconstruction read)
 * pass through unimpeded. A timeout releases the barrier anyway so
 * a broken request fails the test's assertions instead of hanging
 * the suite; the status record lets the test assert the rendezvous
 * actually engaged.
 *
 * Second mechanism (correction round 4, G-dot verdict #3, area 3):
 * an apply-null injection. When armed for a session, the wrapped
 * client's register_publication_intent applies for that session are
 * counted, and the first one AFTER `skip` real ones returns null
 * WITHOUT reaching the authority — the exact shape of authority
 * unavailability at the reconstruction apply. The local in-memory
 * seam cannot otherwise produce a null on a chosen apply (its apply
 * only returns null for a blank session id), so this is the sole
 * deterministic failure-injection point for the round-4 test: first
 * registration refused from a stale snapshot, reconstruction read
 * finds the fresh promoted intent, reconstruction apply unavailable.
 * The status record lets the test assert the injection fired.
 */
import { createEntitlementAuthorityClient as createRealClient } from "../../src/lib/entitlementAuthority.ts";

export * from "../../src/lib/entitlementAuthority.ts";

const RENDEZVOUS_TIMEOUT_MS = 20_000;

let armed = null;

export function __armAuthorityGetStateRendezvous(sessionId) {
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  armed = { sessionId, arrived: 0, timedOut: false, barrier, release };
}

export function __authorityRendezvousStatus() {
  if (!armed) return { arrived: 0, timedOut: false, armed: false };
  return { arrived: armed.arrived, timedOut: armed.timedOut, armed: true };
}

export function __disarmAuthorityGetStateRendezvous() {
  if (armed) armed.release();
  armed = null;
}

let applyNullArm = null;

/** Arm the apply-null injection for a session: the first
 * register_publication_intent apply through a wrapped client AFTER
 * `skip` real ones returns null (authority unavailable) exactly
 * once, without reaching the authority. */
export function __armAuthorityApplyNull(sessionId, { skip = 1 } = {}) {
  applyNullArm = { sessionId, skip, seen: 0, fired: false };
}

export function __authorityApplyNullStatus() {
  if (!applyNullArm) return { seen: 0, fired: false, armed: false };
  return { seen: applyNullArm.seen, fired: applyNullArm.fired, armed: true };
}

export function __disarmAuthorityApplyNull() {
  applyNullArm = null;
}

export function createEntitlementAuthorityClient(...args) {
  const real = createRealClient(...args);
  return {
    ...real,
    async getState(sessionId) {
      const state = await real.getState(sessionId);
      const current = armed;
      if (current && sessionId === current.sessionId && current.arrived < 2) {
        current.arrived += 1;
        if (current.arrived === 2) current.release();
        let timer;
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => {
            current.timedOut = true;
            resolve();
          }, RENDEZVOUS_TIMEOUT_MS);
        });
        await Promise.race([current.barrier, timeout]);
        clearTimeout(timer);
      }
      return state;
    },
    async apply(sessionId, op) {
      const arm = applyNullArm;
      if (arm && sessionId === arm.sessionId && op && op.type === "register_publication_intent") {
        arm.seen += 1;
        if (!arm.fired && arm.seen > arm.skip) {
          arm.fired = true;
          // Injected authority unavailability: the apply never
          // reaches the authority, so no commit is recorded — the
          // caller observes exactly a null result.
          return null;
        }
      }
      return real.apply(sessionId, op);
    },
  };
}
