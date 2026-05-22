# Post-purchase access — long-term architecture (StarMapCo)

**Audience:** Product / engineering decision  
**Stack:** Cloudflare Workers (OpenNext), `STAR_MAP_KV`, R2, Next.js App Router, Stripe  
**Status:** Recommendation aligned with code on `chore/audit-hardening` (May 2026)

---

## Executive summary

StarMapCo already has the right *shape*: Stripe webhooks write entitlements to KV, claim tokens unlock download, and a nascent **email-anchored account** (`/my-downloads` + magic link) indexes purchases by checkout email. The long-term win is to **make email + magic-link session the primary customer identity**, keep **Stripe checkout session records as the entitlement ledger**, and **stop multiplying parallel recovery paths**. Do not add passwords, forced signup, or D1 until KV-backed access clearly fails ops or analytics needs.

---

## 1. Target state (12–24 months)

### Identity model

| Role | Primary key | Notes |
|------|-------------|--------|
| **Customer (human)** | Normalized **email** | Checkout email + magic-link login; hash for KV keys (`account:email:{sha256}`). |
| **Purchase / entitlement** | **Stripe Checkout `session_id`** | Already stored as `stripe:session:{id}`; drives credits, revoke, mapId. |
| **Payment profile** | **Stripe `customer_id`** | Secondary; use for Billing Portal (subscriptions), not as app login id. |
| **Map design** | **`map_id` (UUID)** | Recipe in `map:{id}`; tie to session via metadata / `client_reference_id`. |

**Rule:** Email is the *login* key; Stripe session is the *rights* key. Never require account creation before checkout (gift / impulse buyers).

### Auth method (one primary)

**Recommendation: passwordless magic link** (extend current `account/magic/*` + `starmap_account_session` cookie).

**Rationale:**

- Matches gift purchases (buyer ≠ downloader), shared inboxes, and “I lost the email” support flows.
- Already implemented with rate limits, generic responses, and 15-minute single-use tokens.
- Lower support burden than passwords; less scope than OAuth (Google/Apple) for a download hub.
- Passkeys / OAuth remain **Phase 3** optional upgrades for power users, not the default path.

### Entitlement storage

**Recommendation: KV hybrid (keep; evolve keys, don’t jump to D1).**

| KV key pattern | Purpose | TTL today |
|--------------|---------|-----------|
| `stripe:session:{sessionId}` | Source of truth: paid, credits, subscription, revoke, mapId, claimToken | Effectively long-lived updates |
| `claim:{token}` | Opaque download / email link bearer | 10 years (`PREMIUM_COOKIE_TTL_SECONDS`) |
| `account:email:{emailHash}` | Index of sessionIds for an email | No TTL (cap 40 sessions) |
| `account:magic:{token}` | One-time login | 15 min |
| `account:session:{token}` | Logged-in hub session | 30 days |
| `map:{mapId}` | Render recipe | 30 days |
| R2 `download-archive/hd/{sessionId}.png` | Exact HD export snapshot | Object lifecycle (no TTL in app) |
| `stripe:access_link:email:{sessionId}` | Idempotent post-purchase access email | 45 days (`kv.incr`) |

**D1 later only if:** support needs cross-customer SQL, immutable audit tables, or entitlement history joins you can’t do with KV list + Stripe API.

### Payment source of truth

**Stripe** — `checkout.session.completed`, subscription events, refunds/chargebacks → webhook updates `stripe:session:*` and revoke paths (`markSessionRevoked`, PI/charge maps). **`/api/stripe/verify`** remains a client-side backstop for success-page race, not a second ledger.

### Map artifacts

- **Recipe:** Keep `map:{id}` in KV; **extend retention for paid sessions** (e.g. copy or refresh TTL on webhook when `map_id` present, or `map:session:{sessionId}` pointer) so re-download isn’t blocked after 30 days.
- **HD archive:** Keep R2 path keyed by **sessionId** (not mapId) — matches one checkout → one export slot; claim token still gates read/write.

### Security baseline

| Control | Today | Target |
|---------|--------|--------|
| Session cookies | `starmap_premium` (session id), `starmap_account_session` (opaque) | HttpOnly, Secure, SameSite=Lax — keep |
| Magic / claim TTL | Magic 15m; claim 10y | Short magic; **claim 90–180d** for email links; refresh on resend |
| Rate limits | IP + email on magic/recover/claim | Keep; add per-session download caps if abused |
| Webhook | Signature verify | Add **`stripe:event:{event.id}`** dedupe (`kv.incr`) |
| CSRF | JSON POST APIs; cookies SameSite | State-changing routes stay POST + no CORS wildcard |
| Idempotency | Email send via `kv.incr` | Extend to webhook event processing |
| Email privacy | SHA-256 in magic record | Store raw email only in `account:session` + stripe session; logs use hash |

---

## 2. Why NOT these alternatives

| Alternative | Why not |
|-------------|---------|
| **Password-only accounts** | High friction for gifts; reset flows; credential storage/rotation on Workers. |
| **Link-only forever (no account session)** | Multiple purchases → email overload; no unified hub; duplicate recover + magic + claim paths. |
| **Forced signup before checkout** | Kills conversion and gift flows. |
| **Stripe Customer ID as login** | Opaque to users; many checkouts are guest until email is collected. |
| **Move off Cloudflare Workers** | Entire app, KV, R2, edge deploy are built here; no ROI for access alone. |
| **D1 now** | No relational query requirement yet; adds migrations and cold-path complexity. |
| **OAuth-first (Google/Apple)** | Wrong default for “email me my maps”; adds linking edge cases. |

---

## 3. Migration phases (no big-bang)

### Phase 0 — Today (baseline)

- Webhook writes `stripe:session:{id}`; optional access email with `claim:{token}` → `/download?token=…`.
- `/api/entitlements/claim` sets `starmap_premium` cookie; `/consume` decrements credits.
- `accountLite` indexes email on paid webhook; `/my-downloads` lists sessions when `starmap_account_session` present.
- Parallel recovery: `account/recover` (multi claim links) vs `account/magic/request` (hub login).
- Map recipe 30d TTL vs 10y entitlement cookie — **long-gap re-render risk**.

### Phase 1 — Email-anchored account (minimal breaking)

**Goal:** One front door: `/my-downloads` + magic link; claim links become implementation detail.

1. Centralize KV keys + shared types (`src/lib/entitlementsStore.ts` or similar).
2. Single `evaluateDigitalAccess(sessionRecord)` used by claim, premium, consume, my-sessions (replaces scattered copies).
3. Webhook: **always** `upsertAccountLiteEmailSession` when email exists; access email CTA → **My downloads** + magic link, not only raw download token.
4. Align claim `mapId` on create/refresh (already in `getOrCreateClaimToken`).
5. Docs + ops: when to use resend vs magic vs recover.

**User-visible change:** Post-purchase email says “View all your maps” → magic link → hub with per-order download buttons.

### Phase 2 — Unified downloads hub + support tooling

1. Deprecate or merge `account/recover` into magic request (one email template).
2. Ops API: lookup by email hash / session id; resend magic; resend claim; read revoke reason.
3. Subscription management: link from hub to existing `stripe/portal` when `plan === subscription`.
4. Recipe retention policy tied to active entitlement (refresh TTL or session-scoped map key).

### Phase 3 — Optional enhancements

- Passkeys (WebAuthn) bound to email hash for returning users.
- Stripe Customer Portal discoverability for all subscription states.
- D1 **audit_log** table if support/compliance needs immutable history.
- Shorter-lived rotating claim tokens + refresh via authenticated hub session.

---

## 4. Concrete PR breakdown (3–5 PRs)

### PR 1 — Entitlement kernel (types, keys, one access evaluator)

**Areas:** New `src/lib/entitlementsStore.ts`; thin imports in `accountAccessLinks.ts`, `entitlements/claim`, `entitlements/consume`, `premium`, `account/my-sessions`, `download/archive`.

**Tests:**

- Unit tests for `evaluateDigitalAccess` / `hasRecoverableAccess` (subscription, pack3 credits, revoked, print-only, print+digital).
- Existing commerce smoke unchanged.

### PR 2 — Post-purchase UX: hub-first email + claim alignment

**Areas:** `accountAccessAlerts`, webhook access-email block, `MyDownloadsClient`, optional `DownloadClient` cross-link.

**Tests:**

- Webhook fixture: paid digital → email index + access email idempotency.
- Playwright or API test: magic request → claim → `my-sessions` returns sessions with `downloadUrl`.

### PR 3 — Webhook hardening

**Areas:** `stripe/webhook/route.ts` — `stripe:event:{id}` dedupe; ensure refund paths clear credits + email index consistency.

**Tests:**

- Duplicate `checkout.session.completed` does not double-send email or double-credit.
- Refund/chargeback sets `revoked` and hub hides download.

### PR 4 — Support / ops surface

**Areas:** `api/ops/download/resend`, new read-only `api/ops/account/lookup` (auth-gated), `docs/operator-quick-reference.md`.

**Tests:**

- Ops route auth negative tests; resend idempotency.

### PR 5 — Map retention for entitled sessions

**Areas:** `api/maps/route.ts`, webhook on pay — extend or duplicate recipe for entitled `map_id`.

**Tests:**

- Paid session with map_id → recipe still readable after 30d simulation (TTL override or session map key).

---

## 5. Compliance / ops

| Topic | Practice |
|-------|----------|
| **GDPR-ish email** | Minimize retention: hash in indexes where possible; magic tokens single-use; privacy policy already mentions edge processing — add “purchase recovery email” purpose. |
| **Refund / revoke** | Webhook `markSessionRevoked`; hub must not mint new claim tokens; archive GET must 401. |
| **Support audit** | Log structured events: `access_email_sent`, `magic_requested`, `magic_claimed`, `claim_used`, `revoked` (no PII in logs — use `emailHash`, `sessionId`). Phase 2: append-only KV `audit:{sessionId}` or D1. |
| **Data export / delete** | Manual ops runbook: Stripe customer + KV keys by email hash; document key prefixes for erasure requests. |

---

## 6. If you only do one thing next week

**Ship Phase 1 PR 1 + PR 2:** consolidate access evaluation and change the post-purchase access email to drive **magic link → `/my-downloads`**, ensuring every paid webhook with an email updates `account:email:*`. That gives customers one durable mental model (“sign in with email”) without blocking guest checkout, and it builds on code you already have instead of a parallel link-only path.

---

## Appendix: Current KV / binding map

```
STAR_MAP_KV (wrangler)
├── stripe:session:{checkoutSessionId}     # entitlement ledger
├── stripe:pi:{piId} / stripe:charge:{id} / stripe:sub:{id}
├── claim:{uuid}                         # → sessionId (+ mapId)
├── account:email:{emailHash}            # session index
├── account:magic:{uuid}                 # one-time login
├── account:session:{uuid}               # hub auth
├── map:{uuid}                           # recipe (30d)
└── stripe:access_link:email:{sessionId} # send dedupe

R2 NEXT_INC_CACHE_R2_BUCKET
└── download-archive/hd/{sessionId}.png
```

**Cookies:** `starmap_premium` = checkout session id (editor/download entitlement); `starmap_account_session` = hub login (my-downloads).
