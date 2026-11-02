/** Shared state for the hdDownloadEmailDispatch stubs (S96-1 F5 tests). */
export const hdStubState = {
  /** One Map backs both record keys and dedupe counters, like real KV. */
  kv: new Map(),
  /** When true, kv.getErrorPreserving throws (unreadable sidecar). */
  kvReadThrows: false,
  /** When true, kv.setDurable throws (outcome write failure). */
  kvSetThrows: false,
  /** When true, kv.deleteDurable throws (evidence consumption failure). */
  kvDeleteThrows: false,
  emailConfigured: true,
  archiveExists: false,
  /** FIFO of sendAccountAccessAlert results; defaults to delivered. */
  sendQueue: [],
  sends: [],
};

export function resetHdStubState() {
  hdStubState.kv = new Map();
  hdStubState.kvReadThrows = false;
  hdStubState.kvSetThrows = false;
  hdStubState.kvDeleteThrows = false;
  hdStubState.emailConfigured = true;
  hdStubState.archiveExists = false;
  hdStubState.sendQueue = [];
  hdStubState.sends = [];
}
