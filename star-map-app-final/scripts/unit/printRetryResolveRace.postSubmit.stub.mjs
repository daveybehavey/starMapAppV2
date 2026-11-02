/**
 * Post-submit stub for printRetryResolveRace.test.mjs: mirrors the
 * real bind-then-persist contract (bind the accepted provider ID in
 * the REAL authority, persist the sent record through the REAL
 * persistPrintOrderRecord) without the Printful file-review and
 * alert side effects, which are outside this test's scope.
 */
import { bindPrintProviderOrderId } from "../../src/lib/printOrderAuthority.ts";
import { persistPrintOrderRecord } from "../../src/lib/printOrders.ts";

export async function bindAcceptedPrintfulIdentityThenReview({ sessionId, sentRecord }) {
  const bind = await bindPrintProviderOrderId(sessionId, sentRecord.printfulOrderId);
  if (!bind.ok) {
    return {
      identityPersist: null,
      record: sentRecord,
      bindOk: false,
      bindBlockedByTerminal: false,
      bindFailureReason: "authority_unread",
    };
  }
  const identityPersist = await persistPrintOrderRecord(sessionId, sentRecord);
  return {
    identityPersist,
    record: sentRecord,
    bindOk: true,
    bindBlockedByTerminal: false,
    bindFailureReason: null,
  };
}
