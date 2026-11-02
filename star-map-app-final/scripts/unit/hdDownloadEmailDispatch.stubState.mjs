/** Shared state for the hdDownloadEmailDispatch stubs (S96-1 F5 tests). */
export const hdStubState = {
  /** One Map backs both record keys and dedupe counters, like real KV. */
  kv: new Map(),
  /** When true, kv.getErrorPreserving throws (unreadable sidecar). */
  kvReadThrows: false,
  emailConfigured: true,
  archiveExists: false,
  /** FIFO of sendAccountAccessAlert results; defaults to delivered. */
  sendQueue: [],
  sends: [],
};

export function resetHdStubState() {
  hdStubState.kv = new Map();
  hdStubState.kvReadThrows = false;
  hdStubState.emailConfigured = true;
  hdStubState.archiveExists = false;
  hdStubState.sendQueue = [];
  hdStubState.sends = [];
}
