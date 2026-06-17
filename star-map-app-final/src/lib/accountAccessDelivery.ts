import type { AccountAccessSessionRecord } from "@/lib/accountAccessLinks";
import {
  dispatchHdPurchaseDownloadEmail,
  type HdDownloadEmailDispatchResult,
} from "@/lib/hdDownloadEmailDispatch";

export type { HdDownloadEmailDispatchResult as AccountAccessAlertResult };

/** Post-purchase HD download email (direct PNG when archived, else secure download page). No magic links. */
export async function sendPostPurchaseAccessEmail(input: {
  siteOrigin: string;
  email: string;
  sessionId: string;
  record: AccountAccessSessionRecord;
  /** Optional override (e.g. archived PNG API URL from ops resend). */
  directDownloadLinkOverride?: string;
}): Promise<HdDownloadEmailDispatchResult> {
  return dispatchHdPurchaseDownloadEmail({
    siteOrigin: input.siteOrigin,
    email: input.email,
    sessionId: input.sessionId,
    record: input.record,
    directDownloadLinkOverride: input.directDownloadLinkOverride,
    variant: "initial",
  });
}

export { trySendInitialHdPurchaseEmail, trySendHdArchiveReadyEmail } from "@/lib/hdDownloadEmailDispatch";
