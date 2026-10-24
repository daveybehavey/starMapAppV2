import { createHash } from "node:crypto";
import { normalizeAccountLiteEmail } from "@/lib/accountLite";
import { ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS, accountLiteMagicKey } from "@/lib/accountLiteAuth";
import {
  createConsistencyCoordinatorClient,
  magicCoordinatorName,
} from "@/lib/consistencyCoordinator";
import { kv } from "@/lib/kv";

type MagicLinkRecord = {
  email: string;
  emailHash: string;
  createdAt: number;
};

function hashEmail(normalizedEmail: string) {
  return createHash("sha256").update(normalizedEmail).digest("base64url").slice(0, 40);
}

/**
 * Magic links remain for optional /my-downloads sign-in (phase 2: remove when hub uses email-only recovery).
 * Post-purchase HD delivery no longer embeds magic links — see hdDownloadEmailDispatch.ts.
 */
/** Create a one-time magic link token for hub sign-in. Returns null when email is invalid. */
export async function issueAccountMagicLinkToken(email: string): Promise<string | null> {
  const normalized = normalizeAccountLiteEmail(email);
  if (!normalized) return null;

  const token = crypto.randomUUID();
  const emailHash = hashEmail(normalized);
  const now = Date.now();
  const record: MagicLinkRecord = {
    email: normalized,
    emailHash,
    createdAt: now,
  };
  // A2-1 (T-SM-KVRACE): register the token with the Consistency
  // Coordinator BEFORE anything is sent, with its explicit expiry
  // (design S3-A). Registration failure fails the issuance closed —
  // no KV record, no link — rather than minting a token whose claim
  // would depend on an eventually-consistent KV read. The KV record
  // below remains as the claim path's legacy import source.
  try {
    const client = createConsistencyCoordinatorClient();
    await client.registerMagicToken(magicCoordinatorName(token), {
      email: normalized,
      emailHash,
      expiresAt: now + ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS * 1000,
      now,
    });
  } catch (error) {
    console.error("magic link coordinator registration failed", { emailHash, error });
    return null;
  }
  await kv.set(accountLiteMagicKey(token), record, { ex: ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS });
  return token;
}

export function buildMyDownloadsMagicUrl(siteOrigin: string, magicToken: string): string {
  const base = siteOrigin.replace(/\/+$/, "");
  return `${base}/my-downloads?token=${encodeURIComponent(magicToken)}`;
}

export function buildDownloadClaimUrl(siteOrigin: string, claimToken: string): string {
  const base = siteOrigin.replace(/\/+$/, "");
  return `${base}/download?token=${encodeURIComponent(claimToken)}`;
}
