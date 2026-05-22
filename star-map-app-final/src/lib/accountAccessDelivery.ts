import { getOrCreateClaimToken, type AccountAccessSessionRecord } from "@/lib/accountAccessLinks";
import { sendAccountAccessAlert, type AccountAccessAlertResult } from "@/lib/accountAccessAlerts";
import {
  buildDownloadClaimUrl,
  buildMyDownloadsMagicUrl,
  issueAccountMagicLinkToken,
} from "@/lib/accountMagicLinkIssue";

/** Hub-first post-purchase email: magic link to My Downloads + optional direct download claim URL. */
export async function sendPostPurchaseAccessEmail(input: {
  siteOrigin: string;
  email: string;
  sessionId: string;
  record: AccountAccessSessionRecord;
  /** Optional override (e.g. archived PNG API URL from ops resend). */
  directDownloadLinkOverride?: string;
}): Promise<AccountAccessAlertResult> {
  const claimToken = await getOrCreateClaimToken(input.sessionId, input.record);
  const claimDownloadLink = buildDownloadClaimUrl(input.siteOrigin, claimToken);
  const directDownloadLink = input.directDownloadLinkOverride?.trim() || claimDownloadLink;
  const magicToken = await issueAccountMagicLinkToken(input.email);
  const hubLink = magicToken ? buildMyDownloadsMagicUrl(input.siteOrigin, magicToken) : directDownloadLink;

  return sendAccountAccessAlert({
    email: input.email,
    link: hubLink,
    directDownloadLink: magicToken ? directDownloadLink : undefined,
  });
}
