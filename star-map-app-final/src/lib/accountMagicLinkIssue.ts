import { createHash } from "node:crypto";
import { normalizeAccountLiteEmail } from "@/lib/accountLite";
import { ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS, accountLiteMagicKey } from "@/lib/accountLiteAuth";
import { kv } from "@/lib/kv";

type MagicLinkRecord = {
  email: string;
  emailHash: string;
  createdAt: number;
};

function hashEmail(normalizedEmail: string) {
  return createHash("sha256").update(normalizedEmail).digest("base64url").slice(0, 40);
}

/** Create a one-time magic link token for hub sign-in. Returns null when email is invalid. */
export async function issueAccountMagicLinkToken(email: string): Promise<string | null> {
  const normalized = normalizeAccountLiteEmail(email);
  if (!normalized) return null;

  const token = crypto.randomUUID();
  const record: MagicLinkRecord = {
    email: normalized,
    emailHash: hashEmail(normalized),
    createdAt: Date.now(),
  };
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
