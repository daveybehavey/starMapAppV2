/**
 * Canonical KV keys, entitlement types, and shared access evaluation.
 */
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";
import { PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";
import {
  evaluateClaimPaid as evaluateClaimPaidImpl,
  hasRecoverableAccess as evaluateDigitalAccessImpl,
} from "./accountAccessEntitlements.mjs";
import { isValidMapId as isValidMapIdFromLib } from "./mapId";
import { kv } from "@/lib/kv";

/** Stripe checkout session entitlement (source of truth for digital access). */
export type StripeSessionEntitlement = {
  paid?: boolean;
  revoked?: boolean;
  revokedAt?: number;
  reason?: string;
  created?: number;
  mapId?: string;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  creditsTotal?: number;
  subscriptionId?: string | null;
  subscriptionActive?: boolean;
  customerId?: string | null;
  customerEmail?: string | null;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
  claimToken?: string;
  lastConsumeToken?: string;
  lastConsumeRemaining?: number;
  lastConsumeAt?: number;
  lastCompensatedToken?: string;
  accessEmailSentAt?: number;
  accessEmailHadArchive?: boolean;
  accessEmailProvider?: string;
  accessEmailError?: string;
  hdArchiveEmailSentAt?: number;
};

export type ClaimTokenRecord = {
  sessionId: string;
  mapId?: string;
  createdAt: number;
};

/** Newly issued claim tokens use a shorter TTL; existing KV entries are unchanged. */
export const NEW_CLAIM_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180;

/** Legacy claim tokens and premium cookies remain long-lived. */
export const LEGACY_CLAIM_TOKEN_TTL_SECONDS = PREMIUM_COOKIE_TTL_SECONDS;

/** Refresh map recipe TTL when a paid checkout references map_id. */
export const MAP_RECIPE_ENTITLED_TTL_SECONDS = 60 * 60 * 24 * 365;

export const ENTITLEMENT_KV = {
  stripeSession: (sessionId: string) => `stripe:session:${sessionId}`,
  claim: (token: string) => `claim:${token}`,
  stripePaymentIntent: (piId: string) => `stripe:pi:${piId}`,
  stripeCharge: (chargeId: string) => `stripe:charge:${chargeId}`,
  stripeSubscription: (subId: string) => `stripe:sub:${subId}`,
  stripeWebhookEvent: (eventId: string) => `stripe:event:${eventId}`,
  accessEmailDedupe: (sessionId: string) => `stripe:access_link:email:${sessionId}`,
  hdArchiveEmailDedupe: (sessionId: string) => `stripe:hd_archive:email:${sessionId}`,
  mapRecipe: (mapId: string) => `map:${mapId}`,
} as const;

export const ENTITLEMENT_R2 = {
  hdArchiveKey: (sessionId: string) => `download-archive/hd/${sessionId}.png`,
} as const;

export function evaluateDigitalAccess(record: StripeSessionEntitlement): boolean {
  return evaluateDigitalAccessImpl(record);
}

/** Alias used by account access / hub routes. */
export const hasRecoverableAccess = evaluateDigitalAccess;

export function evaluateClaimPaid(record: StripeSessionEntitlement) {
  return evaluateClaimPaidImpl(record);
}

export function isValidMapId(id: string): boolean {
  return isValidMapIdFromLib(id);
}

export function isPrintOnlyOrder(record: StripeSessionEntitlement): boolean {
  return record.orderType === "print" && !record.includesDigitalAddOn;
}

/** Premium cookie /api/premium eligibility (revoked + print-only gate). */
export function evaluatePremiumAccess(record: StripeSessionEntitlement | null | undefined): boolean {
  if (!record || record.revoked || isPrintOnlyOrder(record)) return false;
  return evaluateDigitalAccess(record);
}

/** Extend map recipe KV TTL after paid checkout when map_id is present. */
export async function refreshEntitledMapRecipeTtl(mapId: string | undefined | null): Promise<void> {
  const id = typeof mapId === "string" ? mapId.trim() : "";
  if (!id || !isValidMapId(id)) return;
  const recipe = await kv.get<unknown>(ENTITLEMENT_KV.mapRecipe(id));
  if (!recipe) return;
  await kv.set(ENTITLEMENT_KV.mapRecipe(id), recipe, { ex: MAP_RECIPE_ENTITLED_TTL_SECONDS });
}
