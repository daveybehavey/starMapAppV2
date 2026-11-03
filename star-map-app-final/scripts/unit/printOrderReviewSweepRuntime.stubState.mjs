/** Shared state for the review-sweep runtime stubs (PR #502 gate round 5). */
export const sweepRuntimeStubState = {
  /** Lifecycle the authority readers report. */
  lifecycle: "bound",
  /** When set, the authority lifecycle read awaits this promise first — the persist window. */
  authorityGate: null,
  /** Set once an authority lifecycle read has begun (test synchronisation). */
  authorityReadStarted: false,
};

export function resetSweepRuntimeStubState() {
  sweepRuntimeStubState.lifecycle = "bound";
  sweepRuntimeStubState.authorityGate = null;
  sweepRuntimeStubState.authorityReadStarted = false;
}
