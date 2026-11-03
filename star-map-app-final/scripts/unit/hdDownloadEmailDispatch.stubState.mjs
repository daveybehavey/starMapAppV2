/** Shared state for the hdDownloadEmailDispatch stubs (S96-1 F5 tests). */
export const hdStubState = {
  /** One Map backs both record keys and dedupe counters, like real KV. */
  kv: new Map(),
  /** When true, kv.getErrorPreserving throws (unreadable sidecar). */
  kvReadThrows: false,
  /** When true, kv.setDurable throws (outcome write failure). */
  kvSetThrows: false,
  /** When true, kv.setDurable throws only for values carrying deliveredAt (a delivered outcome write). */
  kvSetThrowsIfDelivered: false,
  /** When true, kv.deleteDurable throws (evidence consumption failure). */
  kvDeleteThrows: false,
  /** When set, kv.deleteDurable throws only for keys containing this substring. */
  kvDeleteThrowsFor: null,
  emailConfigured: true,
  archiveExists: false,
  /** FIFO of sendAccountAccessAlert results; defaults to delivered. */
  sendQueue: [],
  sends: [],
  /**
   * Read gate: when set, kv.getErrorPreserving returns the value it
   * captured for keys containing `keyIncludes`, but the `onCount`-th
   * such read first awaits `promise` — modelling a pass that read its
   * evidence and then stalled while a concurrent pass ran (the gate
   * round 5 P2-A repro position).
   */
  kvReadGate: null,
  kvReadGateCount: 0,
};

export function resetHdStubState() {
  hdStubState.kv = new Map();
  hdStubState.kvReadThrows = false;
  hdStubState.kvSetThrows = false;
  hdStubState.kvSetThrowsIfDelivered = false;
  hdStubState.kvDeleteThrows = false;
  hdStubState.kvDeleteThrowsFor = null;
  hdStubState.emailConfigured = true;
  hdStubState.archiveExists = false;
  hdStubState.sendQueue = [];
  hdStubState.sends = [];
  hdStubState.kvReadGate = null;
  hdStubState.kvReadGateCount = 0;
}
