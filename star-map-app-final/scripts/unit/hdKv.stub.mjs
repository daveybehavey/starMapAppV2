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
    if (hdStubState.kvSetThrows) throw new Error("kv_set_failed");
    hdStubState.kv.set(key, value);
    return "OK";
  },
  async deleteDurable(key) {
    if (hdStubState.kvDeleteThrows) throw new Error("kv_delete_failed");
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
