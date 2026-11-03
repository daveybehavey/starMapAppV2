/**
 * Authority model for the hold-sweep runtime tests: the lifecycle is
 * scripted via the shared stub state, and an optional gate promise
 * holds the read open — the window in which concurrent writers land
 * (#551 N3). shouldRejectNonterminalKvMirror reduces the real
 * predicate to the lifecycles these tests exercise ("unread" and
 * terminal failure reject; anything else permits the mirror).
 */
import { holdSweepRuntimeStubState } from "./printOrderHoldSweepRuntime.stubState.mjs";

async function readLifecycle() {
  holdSweepRuntimeStubState.authorityReadStarted = true;
  if (holdSweepRuntimeStubState.authorityGate) {
    await holdSweepRuntimeStubState.authorityGate;
  }
  return holdSweepRuntimeStubState.lifecycle;
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
