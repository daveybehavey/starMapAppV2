/** In-memory kv model for the S96-1 F5 dispatch tests. */
import { hdStubState } from "./hdDownloadEmailDispatch.stubState.mjs";

export const kv = {
  async get(key) {
    return hdStubState.kv.get(key) ?? null;
  },
  async getErrorPreserving(key) {
    if (hdStubState.kvReadThrows) throw new Error("kv_read_failed");
    return hdStubState.kv.get(key) ?? null;
  },
  async setDurable(key, value) {
    hdStubState.kv.set(key, value);
    return "OK";
  },
  async deleteDurable(key) {
    hdStubState.kv.delete(key);
    return "OK";
  },
  async incr(key, n = 1) {
    const next = (typeof hdStubState.kv.get(key) === "number" ? hdStubState.kv.get(key) : 0) + n;
    hdStubState.kv.set(key, next);
    return next;
  },
};

export function isDurableKvPersistenceError() {
  return false;
}
