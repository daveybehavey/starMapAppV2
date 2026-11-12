/**
 * Gift certificates — a port of OurImprint's product-tier certificate
 * pattern (DL/BF-3 decision, David 2026-11-05) adapted to StarMapCo's
 * architecture:
 *
 *   buyer purchases a digital tier as a certificate (Stripe Checkout,
 *   metadata `gift_certificate = "true"`) → the webhook mints a redeem
 *   code against a certificate record → the buyer gets a certificate
 *   email (Resend) + a printable certificate view carrying the code →
 *   the recipient redeems the code alone at /redeem and receives
 *   exactly the purchased tier's entitlement through the existing
 *   entitlement store (a session-shaped record + claim token, so the
 *   recipient lands in the ordinary /download flow).
 *
 * Terms (David's decision): tiers are the existing digital products —
 * single HD download and the HD 3-pack — priced from the existing
 * price books (USD book via getPricingTiers, native CAD book via
 * DIGITAL_CAD_PRICE_CENTS). Digital only: no stored value, no partial
 * redemption, no print tiers, no subscription gifting.
 *
 * EXPIRY — two different clocks that must never be conflated:
 * - The certificate CODE expires 12 calendar months after issuance
 *   (month-end clamped, computed in UTC — see giftCertificateExpiresAt);
 *   an expired code can no longer be redeemed. This mirrors
 *   OurImprint, where the certificate is the recovery entitlement with
 *   a 12-month fuse instead of the standard window.
 * - The ENTITLEMENT granted on redemption follows StarMapCo's normal
 *   paid-download semantics, which have NO expiry (David's decided
 *   policy, 2026-10-22). Redeeming in time buys permanent access;
 *   the 12-month window governs only the unredeemed code.
 * - Payment revocation is enforced at redemption (`payment_revoked`),
 *   not as a post-grant download TTL — see `docs/entitlement-authority.md`.
 *
 * Code storage (OurImprint pattern): the raw code is never persisted.
 * The record stores a random salt and a keyed HMAC hash of the code;
 * the code itself is derived deterministically from the server signing
 * secret + checkout session id + salt, so the server can re-derive it
 * for the certificate email and the buyer's certificate view without
 * ever storing it. Redemption looks the record up by hash and compares
 * in constant time.
 *
 * Promo treatment (mirrors OurImprint's exclusion + the digital promo
 * rules in checkoutPromotions.ts): certificate purchases accept no
 * manual promo code and no referral-auto discount, and redemption
 * grants the tier at face value — discounts never enter either side.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  getDigitalCadPriceCents,
  getPricingTiers,
  type CheckoutPlan,
} from "@/lib/pricing";
import { kv, withSerializedKvUpdate } from "@/lib/kv";

/** Stripe session metadata keys for a certificate purchase. */
export const GIFT_CERTIFICATE_METADATA_KEY = "gift_certificate";
export const GIFT_CERTIFICATE_TIER_METADATA_KEY = "gift_certificate_tier";

/**
 * Sale/discovery flag for gift certificates (Tier C review condition,
 * 2026-11-06): certificate checkout creation and every discovery
 * surface (buy page, sitemap) stay OFF until the owner enables them
 * after the Black Friday dry run. Redemption and delivery are NOT
 * gated — a legitimately issued certificate must keep working while
 * the shop-facing side is dark. Deliberately NOT a [vars] entry in
 * wrangler.toml (same posture as the DL-1 routing flag): activation
 * is an explicit owner action in the dashboard, never a deploy side
 * effect. Absent/unset is OFF.
 */
export const GIFT_CERTIFICATES_ENABLED_ENV = "GIFT_CERTIFICATES_ENABLED";

export function isGiftCertificatesEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return /^(1|true|yes)$/i.test((env[GIFT_CERTIFICATES_ENABLED_ENV] || "").trim());
}

/**
 * Redemption window (David's decided term, pinned precisely by the
 * Tier C review, 2026-11-06): the code is redeemable for 12 CALENDAR
 * months from issuance, computed in UTC, clamped to the target
 * month's last day when the issuance day does not exist there
 * (issued Feb 29 → expires Feb 28 in a non-leap year). Every surface
 * states this same rule and shows the computed date.
 */
export function giftCertificateExpiresAt(issuedAt: number): number {
  const issued = new Date(issuedAt);
  const year = issued.getUTCFullYear();
  const month = issued.getUTCMonth();
  const day = issued.getUTCDate();
  const targetYear = year + 1;
  // Day 0 of the following month is the target month's last day.
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  return Date.UTC(
    targetYear,
    month,
    Math.min(day, lastDayOfTargetMonth),
    issued.getUTCHours(),
    issued.getUTCMinutes(),
    issued.getUTCSeconds(),
    issued.getUTCMilliseconds(),
  );
}

/** Human expiry date for buyer/recipient surfaces (UTC, en-US long form). */
export function formatGiftCertificateExpiryDate(expiresAt: number): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(expiresAt));
}

/** 16 Crockford base32 characters = 80 bits, grouped in fours. */
export const GIFT_CERTIFICATE_CODE_LENGTH = 16;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type GiftCertificateTierId = "hd_single" | "hd_pack3";

export type GiftCertificateTier = {
  id: GiftCertificateTierId;
  /** The existing digital plan this certificate grants on redemption. */
  plan: Extract<CheckoutPlan, "single" | "pack3">;
  label: string;
  /** HD export credits the recipient's entitlement carries. */
  credits: number;
};

export const GIFT_CERTIFICATE_TIERS: Record<GiftCertificateTierId, GiftCertificateTier> = {
  hd_single: { id: "hd_single", plan: "single", label: "Single HD download", credits: 1 },
  hd_pack3: { id: "hd_pack3", plan: "pack3", label: "3 HD export credits", credits: 3 },
};

export function giftCertificateTierForPlan(
  plan: CheckoutPlan | null | undefined,
): GiftCertificateTier | null {
  if (plan === "single") return GIFT_CERTIFICATE_TIERS.hd_single;
  if (plan === "pack3") return GIFT_CERTIFICATE_TIERS.hd_pack3;
  return null;
}

export function isGiftCertificateTierId(value: unknown): value is GiftCertificateTierId {
  return value === "hd_single" || value === "hd_pack3";
}

/**
 * Certificate prices come from the SAME books as the products
 * themselves — the USD book (env-overridable tiers) and the native
 * CAD book (code-struck, never env-overridable). A certificate costs
 * exactly what the tier costs; there is no certificate-specific price.
 */
export function getGiftCertificatePriceCents(
  tier: GiftCertificateTier,
  currency: string,
): number {
  if (currency.trim().toLowerCase() === "cad") {
    return getDigitalCadPriceCents(tier.plan);
  }
  return getPricingTiers()[tier.plan].amountCents;
}

/** True when Stripe session metadata marks a gift-certificate purchase. */
export function isGiftCertificateSessionMetadata(
  metadata: Record<string, string> | null | undefined,
): boolean {
  return metadata?.[GIFT_CERTIFICATE_METADATA_KEY] === "true";
}

/* ------------------------------ codes ------------------------------ */

/** Recovery-style normalization: case, separators and look-alikes fold. */
export function normalizeGiftCertificateCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value
    .toUpperCase()
    .replace(/[\s-]/gu, "")
    .replace(/[OIL]/gu, (c) => (c === "O" ? "0" : "1"));
  if (code.length !== GIFT_CERTIFICATE_CODE_LENGTH) return null;
  if (!/^[0-9A-HJKMNP-TV-Z]+$/u.test(code)) return null;
  return code;
}

export function formatGiftCertificateCode(normalizedCode: string): string {
  return normalizedCode.match(/.{4}/gu)?.join("-") ?? normalizedCode;
}

const MIN_SIGNING_SECRET_LENGTH = 16;

/**
 * Signing secret for code derivation/hashing. A dedicated env var
 * wins; the fallbacks mirror referralCookie.ts so the feature works
 * with the secrets production already carries. No secret → the
 * service fails closed (issuance/redemption refuse).
 */
export function getGiftCertificateSigningSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const candidates = [
    env.GIFT_CERTIFICATE_SIGNING_SECRET,
    env.REFERRAL_SIGNING_SECRET,
    env.STRIPE_WEBHOOK_SECRET,
    env.STRIPE_SECRET_KEY,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.length >= MIN_SIGNING_SECRET_LENGTH) return trimmed;
  }
  return null;
}

function hmacBase64Url(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

function crockfordFromBytes(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output;
}

/**
 * The code is a deterministic function of (secret, session id, salt):
 * the database alone (salt + hash) cannot reproduce it, and the server
 * can re-derive it for delivery without storing it — the OurImprint
 * construction, carried over.
 */
export function deriveGiftCertificateCode(
  signingSecret: string,
  stripeSessionId: string,
  salt: string,
): string {
  const digest = createHmac("sha256", signingSecret)
    .update(`smc-gift-certificate-code:v1:${stripeSessionId}:${salt}`)
    .digest();
  return crockfordFromBytes(digest.subarray(0, 10));
}

/** Keyed hash stored on the record; lookups and comparisons use this. */
export function hashGiftCertificateCode(
  signingSecret: string,
  normalizedCode: string,
): string {
  return hmacBase64Url(signingSecret, `smc-gift-certificate-hash:v1:${normalizedCode}`);
}

export function newGiftCertificateSalt(): string {
  return randomBytes(32).toString("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------ records ------------------------------ */

export type GiftCertificateRecord = {
  /** The Stripe checkout session id of the purchase (the record id). */
  id: string;
  stripeSessionId: string;
  paymentIntentId: string | null;
  tier: GiftCertificateTierId;
  plan: GiftCertificateTier["plan"];
  currency: string;
  amountCents: number;
  buyerEmail: string | null;
  /** Random per-certificate salt for code derivation. */
  salt: string;
  /** Keyed HMAC of the normalized code. The raw code is never stored. */
  codeHash: string;
  issuedAt: number;
  /** Code redemption deadline: issuedAt + 12 calendar months (clamped). NOT an entitlement expiry. */
  expiresAt: number;
  redeemedAt: number | null;
  /** Synthetic entitlement session id created for the recipient. */
  redeemedEntitlementSessionId: string | null;
  emailSentAt: number | null;
  emailError: string | null;
};

/**
 * Storage contract for the certificate service. `insertIfAbsent` and
 * `markRedeemed` must be atomic from the caller's perspective (the KV
 * adapter serializes per key; the in-memory test store is serial by
 * construction): issuance idempotency and single-use redemption rest
 * on those two operations.
 */
export interface GiftCertificateStore {
  findByCodeHash(codeHash: string): Promise<GiftCertificateRecord | null>;
  findBySessionId(sessionId: string): Promise<GiftCertificateRecord | null>;
  /** Returns true when this call created the record. */
  insertIfAbsent(record: GiftCertificateRecord): Promise<boolean>;
  /**
   * Marks the certificate redeemed exactly once. Returns false when it
   * was already redeemed (the caller treats that as already_redeemed).
   */
  markRedeemed(
    codeHash: string,
    redemption: { redeemedAt: number; entitlementSessionId: string },
  ): Promise<boolean>;
  recordEmailOutcome(
    sessionId: string,
    outcome: { sentAt: number | null; error: string | null },
  ): Promise<void>;
}

/** KV keys — deliberately OUTSIDE the `stripe:session:` prefix (the
 * review engine scans that prefix as its entitlement population; the
 * settlement side records set the same precedent). */
export const GIFT_CERTIFICATE_KV = {
  byCodeHash: (codeHash: string) => `gift-cert:code:${codeHash}`,
  bySession: (sessionId: string) => `gift-cert:session:${sessionId}`,
} as const;

/** The recipient entitlement lives under this synthetic session id, so
 * every existing entitlement reader treats it as a normal purchase. */
export function giftCertificateEntitlementSessionId(certificateId: string): string {
  return `giftcert:${certificateId}`;
}

export function createGiftCertificateKvStore(): GiftCertificateStore {
  return {
    async findByCodeHash(codeHash) {
      return kv.get<GiftCertificateRecord>(GIFT_CERTIFICATE_KV.byCodeHash(codeHash));
    },
    async findBySessionId(sessionId) {
      return kv.get<GiftCertificateRecord>(GIFT_CERTIFICATE_KV.bySession(sessionId));
    },
    async insertIfAbsent(record) {
      // Serialized per SESSION id (Tier C gate fix): two concurrent
      // issuance passes for the same session derive DIFFERENT codes
      // (each pass mints a fresh salt), so serializing on the code
      // hash would not serialize them against each other at all —
      // both could insert, and the session index would keep only the
      // last record while both codes stayed redeemable. The session
      // id is the stable key both passes share.
      return withSerializedKvUpdate(GIFT_CERTIFICATE_KV.bySession(record.stripeSessionId), async () => {
        const existingByCode = await kv.get<GiftCertificateRecord>(
          GIFT_CERTIFICATE_KV.byCodeHash(record.codeHash),
        );
        if (existingByCode) return false;
        const existingBySession = await kv.get<GiftCertificateRecord>(
          GIFT_CERTIFICATE_KV.bySession(record.stripeSessionId),
        );
        if (existingBySession) return false;
        await kv.setDurable(GIFT_CERTIFICATE_KV.byCodeHash(record.codeHash), record);
        await kv.setDurable(GIFT_CERTIFICATE_KV.bySession(record.stripeSessionId), record);
        return true;
      });
    },
    async markRedeemed(codeHash, redemption) {
      return withSerializedKvUpdate(GIFT_CERTIFICATE_KV.byCodeHash(codeHash), async () => {
        const record = await kv.get<GiftCertificateRecord>(GIFT_CERTIFICATE_KV.byCodeHash(codeHash));
        if (!record || record.redeemedAt !== null) return false;
        const updated: GiftCertificateRecord = {
          ...record,
          redeemedAt: redemption.redeemedAt,
          redeemedEntitlementSessionId: redemption.entitlementSessionId,
        };
        await kv.setDurable(GIFT_CERTIFICATE_KV.byCodeHash(codeHash), updated);
        await kv.setDurable(GIFT_CERTIFICATE_KV.bySession(record.stripeSessionId), updated);
        return true;
      });
    },
    async recordEmailOutcome(sessionId, outcome) {
      const bySession = await kv.get<GiftCertificateRecord>(GIFT_CERTIFICATE_KV.bySession(sessionId));
      if (!bySession) return;
      await withSerializedKvUpdate(GIFT_CERTIFICATE_KV.byCodeHash(bySession.codeHash), async () => {
        const record = await kv.get<GiftCertificateRecord>(
          GIFT_CERTIFICATE_KV.byCodeHash(bySession.codeHash),
        );
        if (!record) return;
        const updated: GiftCertificateRecord = {
          ...record,
          emailSentAt: outcome.sentAt ?? record.emailSentAt,
          emailError: outcome.error,
        };
        await kv.setDurable(GIFT_CERTIFICATE_KV.byCodeHash(record.codeHash), updated);
        await kv.setDurable(GIFT_CERTIFICATE_KV.bySession(record.stripeSessionId), updated);
      });
    },
  };
}

/* ------------------------------ issuance ------------------------------ */

export type IssueGiftCertificateInput = {
  stripeSessionId: string;
  paymentIntentId: string | null;
  plan: CheckoutPlan | null | undefined;
  currency: string | null | undefined;
  amountCents: number | null | undefined;
  buyerEmail: string | null;
  now: number;
};

export type IssueGiftCertificateResult =
  | { kind: "issued"; record: GiftCertificateRecord; code: string; created: boolean }
  | { kind: "refused"; reason: "not_a_certificate_tier" | "signing_secret_unavailable" };

/**
 * Mint (or re-read) the certificate for a paid certificate session.
 * Idempotent by session: a duplicate issuance event returns the
 * existing record with its re-derived code and `created: false` — it
 * never mints a second certificate and never changes the code.
 */
export async function issueGiftCertificate(
  store: GiftCertificateStore,
  signingSecret: string | null,
  input: IssueGiftCertificateInput,
): Promise<IssueGiftCertificateResult> {
  const tier = giftCertificateTierForPlan(input.plan);
  if (!tier) return { kind: "refused", reason: "not_a_certificate_tier" };
  if (!signingSecret) return { kind: "refused", reason: "signing_secret_unavailable" };

  const existing = await store.findBySessionId(input.stripeSessionId);
  if (existing) {
    return {
      kind: "issued",
      record: existing,
      code: deriveGiftCertificateCode(signingSecret, existing.stripeSessionId, existing.salt),
      created: false,
    };
  }

  const salt = newGiftCertificateSalt();
  const code = deriveGiftCertificateCode(signingSecret, input.stripeSessionId, salt);
  const currency = (input.currency ?? "usd").trim().toLowerCase() || "usd";
  const record: GiftCertificateRecord = {
    id: input.stripeSessionId,
    stripeSessionId: input.stripeSessionId,
    paymentIntentId: input.paymentIntentId,
    tier: tier.id,
    plan: tier.plan,
    currency,
    amountCents:
      typeof input.amountCents === "number" && Number.isFinite(input.amountCents)
        ? input.amountCents
        : getGiftCertificatePriceCents(tier, currency),
    buyerEmail: input.buyerEmail,
    salt,
    codeHash: hashGiftCertificateCode(signingSecret, code),
    issuedAt: input.now,
    expiresAt: giftCertificateExpiresAt(input.now),
    redeemedAt: null,
    redeemedEntitlementSessionId: null,
    emailSentAt: null,
    emailError: null,
  };
  const created = await store.insertIfAbsent(record);
  if (!created) {
    // A concurrent issuance won the insert; answer from its record so
    // both passes deliver the SAME code.
    const winner = await store.findBySessionId(input.stripeSessionId);
    if (winner) {
      return {
        kind: "issued",
        record: winner,
        code: deriveGiftCertificateCode(signingSecret, winner.stripeSessionId, winner.salt),
        created: false,
      };
    }
    return { kind: "refused", reason: "signing_secret_unavailable" };
  }
  return { kind: "issued", record, code, created: true };
}

/* ------------------------------ redemption ------------------------------ */

export type RedeemGiftCertificateResult =
  | {
      kind: "redeemed";
      record: GiftCertificateRecord;
      entitlementSessionId: string;
    }
  | {
      kind: "rejected";
      reason:
        | "invalid_code"
        | "already_redeemed"
        | "expired"
        | "payment_revoked"
        | "signing_secret_unavailable";
    };

/**
 * Redeem a code exactly once. The caller supplies the entitlement
 * grant (`grantEntitlement`), invoked with the deterministic
 * recipient session id BEFORE the code is consumed: the grant writes
 * a normal session-shaped entitlement record under that id, so
 * re-running it (a retry after a partial failure, or the losing side
 * of a race) converges on the same record instead of minting a
 * second entitlement. The optional `prepareDelivery` runs next —
 * still before consumption — so the caller's access credential is
 * minted while a failure can still abort with the code redeemable.
 * Consumption is the final step, and a
 * consumption that reports "already redeemed" still succeeds when
 * the recorded entitlement is the deterministic one this call
 * granted — both sides of the race land on the same entitlement.
 *
 * `isPaymentRevoked` lets the caller refuse redemption when the
 * purchase's payment was refunded/disputed (checked against the
 * durable revocation evidence for the certificate's own session).
 */
export async function redeemGiftCertificate(
  store: GiftCertificateStore,
  signingSecret: string | null,
  input: {
    code: unknown;
    now: number;
    isPaymentRevoked?: (record: GiftCertificateRecord) => Promise<boolean>;
    grantEntitlement: (input: {
      entitlementSessionId: string;
      record: GiftCertificateRecord;
    }) => Promise<void>;
    /**
     * Optional delivery preparation, invoked after the grant and
     * BEFORE the code is consumed (Tier C gate fix): the caller mints
     * whatever credential delivers access (the claim token) here, so
     * a delivery failure aborts the redemption with the code still
     * redeemable instead of stranding the recipient with a consumed
     * code and no access. Must be idempotent — a retry re-runs it.
     */
    prepareDelivery?: (input: {
      entitlementSessionId: string;
      record: GiftCertificateRecord;
    }) => Promise<void>;
  },
): Promise<RedeemGiftCertificateResult> {
  if (!signingSecret) return { kind: "rejected", reason: "signing_secret_unavailable" };
  const normalized = normalizeGiftCertificateCode(input.code);
  if (!normalized) return { kind: "rejected", reason: "invalid_code" };
  const codeHash = hashGiftCertificateCode(signingSecret, normalized);
  const record = await store.findByCodeHash(codeHash);
  if (!record) return { kind: "rejected", reason: "invalid_code" };
  // Constant-time confirmation on top of the indexed hash lookup.
  if (!constantTimeEqual(record.codeHash, codeHash)) {
    return { kind: "rejected", reason: "invalid_code" };
  }
  if (record.redeemedAt !== null) return { kind: "rejected", reason: "already_redeemed" };
  if (input.now >= record.expiresAt) return { kind: "rejected", reason: "expired" };
  if (input.isPaymentRevoked && (await input.isPaymentRevoked(record))) {
    return { kind: "rejected", reason: "payment_revoked" };
  }

  const entitlementSessionId = giftCertificateEntitlementSessionId(record.id);
  await input.grantEntitlement({ entitlementSessionId, record });
  if (input.prepareDelivery) {
    await input.prepareDelivery({ entitlementSessionId, record });
  }
  const consumed = await store.markRedeemed(codeHash, {
    redeemedAt: input.now,
    entitlementSessionId,
  });
  if (!consumed) {
    const standing = await store.findByCodeHash(codeHash);
    if (standing?.redeemedEntitlementSessionId === entitlementSessionId) {
      // The racing pass consumed the code against the SAME
      // deterministic entitlement this call just granted.
      return { kind: "redeemed", record: standing, entitlementSessionId };
    }
    return { kind: "rejected", reason: "already_redeemed" };
  }
  return {
    kind: "redeemed",
    record: { ...record, redeemedAt: input.now, redeemedEntitlementSessionId: entitlementSessionId },
    entitlementSessionId,
  };
}

/** Public, non-oracle copy for a redemption outcome. */
export function giftCertificateRedeemErrorMessage(
  reason: Extract<RedeemGiftCertificateResult, { kind: "rejected" }>["reason"],
): string {
  switch (reason) {
    case "already_redeemed":
      return "This gift certificate has already been redeemed.";
    case "expired":
      return "This gift certificate has expired — codes can be redeemed for 12 calendar months after issuance.";
    case "payment_revoked":
      return "This gift certificate is no longer valid. Please ask the buyer to contact support.";
    default:
      return "We couldn't find that gift certificate code. Check the code and try again.";
  }
}
