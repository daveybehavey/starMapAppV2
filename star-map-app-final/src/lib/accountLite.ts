import { createHash } from "node:crypto";
import { kv } from "@/lib/kv";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";

const MAX_SESSIONS_PER_EMAIL = 40;

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

export async function upsertAccountLiteEmailSession(input: {
  email: string;
  session: AccountLiteSessionIndexItem;
}) {
  const email = normalizeAccountLiteEmail(input.email);
  if (!email) return;

  const key = accountLiteEmailKey(email);
  const existing = await kv.get<AccountLiteEmailIndexRecord>(key);
  const deduped = (existing?.sessions || []).filter((entry) => entry.sessionId !== input.session.sessionId);
  const nextSessions = [input.session, ...deduped]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_SESSIONS_PER_EMAIL);

  await kv.set(key, {
    updatedAt: Date.now(),
    sessions: nextSessions,
  });
}

export async function getAccountLiteEmailSessions(emailInput: string) {
  const email = normalizeAccountLiteEmail(emailInput);
  if (!email) return null;

  const key = accountLiteEmailKey(email);
  const record = await kv.get<AccountLiteEmailIndexRecord>(key);
  if (!record) return null;

  return {
    emailHash: hashEmail(email),
    updatedAt: record.updatedAt,
    sessions: record.sessions,
  };
}
