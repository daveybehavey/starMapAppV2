/** Shared state for the hold-sweep runtime stubs (#551 N3). */
export const holdSweepRuntimeStubState = {
  /** Lifecycle the authority readers report. */
  lifecycle: "bound",
  /** When set, the authority lifecycle read awaits this promise first — the persist window. */
  authorityGate: null,
  /** Set once an authority lifecycle read has begun (test synchronisation). */
  authorityReadStarted: false,
};

export function resetHoldSweepRuntimeStubState() {
  holdSweepRuntimeStubState.lifecycle = "bound";
  holdSweepRuntimeStubState.authorityGate = null;
  holdSweepRuntimeStubState.authorityReadStarted = false;
}
