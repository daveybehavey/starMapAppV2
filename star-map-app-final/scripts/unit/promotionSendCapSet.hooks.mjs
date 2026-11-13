/** Test-only finite-H + successful counter fixture for existing guard tables.
 * Arithmetic/persistence tests use hcapFinite.hooks instead and the REAL client.
 * No runtime override or local-memory cap mode is exposed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function load(url, context, nextLoad) {
  if (url === new URL("../../src/lib/promotionSendCap.ts", import.meta.url).href) {
    return { format: "module", source: "export const PROMOTION_SEND_CAP_H = 1;", shortCircuit: true };
  }
  if (url === new URL("../../src/lib/sharedSendCap.ts", import.meta.url).href) {
    const source = readFileSync(fileURLToPath(url), "utf8")
      .replace("export function createSendCapClient(", "function liveClientNotUsedInGuardFixture(");
    return { format: "module-typescript", shortCircuit: true, source: source + `
export function createSendCapClient(env?: unknown): SendCapClient {
  return {
    async check(family) { return dispatchPrerequisite(family, env); },
    async reserve(family) {
      const gate = dispatchPrerequisite(family, env);
      return gate.permitted ? { permitted: true, reservation: { id: "guard-fixture", reservedAt: 0 } } : gate;
    },
    async release() { return true; },
    async commit() { return true; },
  };
}
` };
  }
  return nextLoad(url, context);
}
