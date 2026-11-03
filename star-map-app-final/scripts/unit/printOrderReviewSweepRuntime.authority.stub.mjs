/**
 * Authority model for the review-sweep runtime tests: the lifecycle
 * is scripted via the shared stub state, and an optional gate promise
 * holds the read open — the window in which concurrent writers land
 * (gate round 5, P2-B). shouldRejectNonterminalKvMirror reduces the
 * real predicate to the lifecycles these tests exercise ("unread"
 * and terminal failure reject; anything else permits the mirror).
 */
import { sweepRuntimeStubState } from "./printOrderReviewSweepRuntime.stubState.mjs";

async function readLifecycle() {
  sweepRuntimeStubState.authorityReadStarted = true;
  if (sweepRuntimeStubState.authorityGate) {
    await sweepRuntimeStubState.authorityGate;
  }
  return sweepRuntimeStubState.lifecycle;
}

export async function readAuthorityLifecycleForMirrorGuard() {
  return readLifecycle();
}

export async function readAuthorityLifecycleForMirrorGuardFromNamespace() {
  return readLifecycle();
}

export function shouldRejectNonterminalKvMirror(lifecycle) {
  return lifecycle === "unread" || lifecycle === "terminal_failed";
}
