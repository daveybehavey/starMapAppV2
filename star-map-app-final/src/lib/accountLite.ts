import { createHash } from "node:crypto";
import { kv } from "@/lib/kv";
import {
  accountCoordinatorName,
  createConsistencyCoordinatorClient,
} from "@/lib/consistencyCoordinator";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";

export type AccountLiteSessionIndexItem = {
  sessionId: string;
  createdAt: number;
  mapId?: string;
  plan?: CheckoutPlan;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
  amountTotal?: number | null;
  currency?: string | null;
};

type AccountLiteEmailIndexRecord = {
  updatedAt: number;
  sessions: AccountLiteSessionIndexItem[];
};

export function normalizeAccountLiteEmail(raw: unknown) {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return normalized || null;
}

function hashEmail(normalizedEmail: string) {
  return createHash("sha256").update(normalizedEmail).digest("base64url").slice(0, 40);
}

function accountLiteEmailKey(normalizedEmail: string) {
  return `account:email:${hashEmail(normalizedEmail)}`;
}

/**
 * A2-2 (T-SM-KVRACE): the email → sessions index used to be a KV
 * read-modify-write of one shared array — two concurrent purchases for
 * the same email read the same array and the later write silently
 * dropped the earlier purchase. The index now lives in the per-email
 * Consistency Coordinator object (design S3-A); the legacy KV record is
 * passed in as a monotone import fact (insert-if-absent) so pre-cutover
 * purchases are preserved and a late/stale read can never drop a row
 * the coordinator already holds.
 *
 * Coordinator unavailability THROWS (ConsistencyCoordinatorUnavailableError):
 * the only writer is the Stripe webhook, and a failed webhook is
 * retried by Stripe — failing loudly is what makes the retry happen.
 * Falling back to the old KV write would split the authority.
 */
export async function upsertAccountLiteEmailSession(input: {
  email: string;
  session: AccountLiteSessionIndexItem;
}) {
  const email = normalizeAccountLiteEmail(input.email);
  if (!email) return;

  const emailHash = hashEmail(email);
  const legacy = await kv.get<AccountLiteEmailIndexRecord>(accountLiteEmailKey(email));
  const client = createConsistencyCoordinatorClient();
  await client.upsertAccountSession(accountCoordinatorName(emailHash), {
    emailHash,
    session: input.session,
    legacySessions: legacy?.sessions ?? null,
    legacyUpdatedAt: legacy?.updatedAt ?? null,
    now: Date.now(),
  });
}

export async function getAccountLiteEmailSessions(emailInput: string) {
  const email = normalizeAccountLiteEmail(emailInput);
  if (!email) return null;

  const emailHash = hashEmail(email);
  const legacy = await kv.get<AccountLiteEmailIndexRecord>(accountLiteEmailKey(email));
  const client = createConsistencyCoordinatorClient();
  const { view } = await client.getAccountSessions(accountCoordinatorName(emailHash), {
    emailHash,
    legacySessions: legacy?.sessions ?? null,
    legacyUpdatedAt: legacy?.updatedAt ?? null,
  });
  return view;
}
