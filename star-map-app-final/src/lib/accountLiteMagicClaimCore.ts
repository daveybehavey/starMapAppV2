import { kv } from "@/lib/kv";
import {
  ACCOUNT_LITE_SESSION_TTL_SECONDS,
  accountLiteMagicKey,
  accountLiteSessionKey,
  type AccountLiteAuthSession,
} from "@/lib/accountLiteAuth";

type MagicLinkRecord = {
  email?: string;
  emailHash?: string;
  createdAt?: number;
  usedAt?: number;
};

export type MagicClaimCoreResult =
  | { ok: true; sessionToken: string }
  | { ok: false; error: "invalid_token" };

/**
 * Consumes a one-time magic token and creates an account-lite KV session.
 * Caller is responsible for rate limits, cookies (web), and JSON (mobile).
 */
export async function executeAccountLiteMagicClaim(magicToken: string): Promise<MagicClaimCoreResult> {
  const token = magicToken.trim();
  if (!token) {
    return { ok: false, error: "invalid_token" };
  }

  const magic = await kv.get<MagicLinkRecord>(accountLiteMagicKey(token));
  if (!magic?.email || !magic?.emailHash || magic.usedAt) {
    return { ok: false, error: "invalid_token" };
  }

  const sessionToken = crypto.randomUUID();
  const authSession: AccountLiteAuthSession = {
    email: magic.email,
    emailHash: magic.emailHash,
    createdAt: Date.now(),
  };
  await kv.set(accountLiteSessionKey(sessionToken), authSession, { ex: ACCOUNT_LITE_SESSION_TTL_SECONDS });
  await kv.set(accountLiteMagicKey(token), {
    ...magic,
    usedAt: Date.now(),
  });

  return { ok: true, sessionToken };
}
