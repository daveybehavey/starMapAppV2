/**
 * Combined stub for the account-access modules hdDownloadEmailDispatch
 * imports (accountAccessLinks, accountMagicLinkIssue, accountAccessAlerts,
 * downloadArchiveStorage). Send outcomes are scripted via hdStubState.
 */
import { hdStubState } from "./hdDownloadEmailDispatch.stubState.mjs";

export function hasRecoverableAccess(record) {
  return record?.hdRecoverable === true;
}

export async function getOrCreateClaimToken() {
  return "claim-token";
}

export function buildDownloadClaimUrl(siteOrigin, claimToken) {
  return siteOrigin + "/download?token=" + claimToken;
}

export function buildHdArchiveDownloadUrl(siteOrigin, claimToken) {
  return siteOrigin + "/api/download/archive?token=" + claimToken;
}

export async function hdArchiveObjectExists() {
  return hdStubState.archiveExists;
}

export function isAccountAccessEmailConfigured() {
  return hdStubState.emailConfigured;
}

export async function sendAccountAccessAlert(input) {
  hdStubState.sends.push(input);
  const next = hdStubState.sendQueue.shift();
  return next ?? { delivered: true, provider: "resend" };
}
