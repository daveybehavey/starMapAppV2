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
  };
}
