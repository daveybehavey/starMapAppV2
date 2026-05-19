# Security notes

**Principle:** Treat the repo as **public**. Never commit Stripe secrets, webhook signing secrets, API tokens, or private keys.

## Authentication & sessions

- **Web:** Magic-link style flows under `/api/account/magic/*` with KV-backed sessions (`accountLite` patterns). Review for: token entropy, TTL, replay, email enumeration behavior when touching these routes.
- **Mobile:** `/api/account/mobile/*` + Google ID token verification (`googleMobileAuth.ts`). Ensure **audience / client ID allowlists** match production OAuth clients; rotate with Play App Signing / EAS keystore changes.
- **Cross-surface:** Shared request/claim cores—changes must preserve **web vs mobile** invariants.

## Payments

- **Stripe:** Secret key and webhook secret must live in **Wrangler secrets** / env—not `[vars]` in `wrangler.toml` if they ever appear there. Webhook handler must verify signatures (`stripe/webhook/route.ts`—maintain on SDK upgrades).
- **Idempotency:** Webhook processing should tolerate retries; confirm event IDs dedupe where Stripe may redeliver.

## Third-party webhooks

- **Printful:** URL often includes shared token query param—protect logging from echoing full URLs with secrets.
- **RevenueCat:** Server webhook must validate **`Authorization`** (or platform-documented scheme) against `REVENUECAT_WEBHOOK_AUTH` (name per your `.env.example` / deploy).

## Client exposure

- **`NEXT_PUBLIC_*`** vars ship to browsers—safe only for non-secrets (price display, GA keys, PostHog key).
- **Mobile:** Never ship RevenueCat **secret** keys; public SDK keys only.

## Rate limiting & abuse (checklist)

**Verified 2026-05-15 (spot check in `src/lib/rateLimit.ts` + route handlers):**

- [x] Magic-link request: per-IP + per-email in `accountLiteMagicLinkRequestCore.ts` (shared by web + mobile request routes).
- [x] Magic / mobile claim: per-IP on claim routes (mobile uses `account:mobile:claim:*` bucket).
- [x] Account recover / access-email: per-IP + per-email where applicable.
- [x] Geocode, maps, checkout, referrals, promotions subscribe: per-IP limits present.
- [x] Download archive HD upload/download: per-IP limits on GET/POST (`download:archive:*`).
- [x] RevenueCat webhook: auth header + per-IP limit + event dedupe in KV.

**Still review when touching ops/admin routes:**

- [ ] `ops/*`, print order admin routes (often token-gated—confirm at change time).
- [ ] Stripe / Printful webhooks (signature-based; not IP-throttled by design).

## Dependency & supply chain

- Run **`npm audit`** on a schedule; triage before mass `npm update`.
- Pin major frameworks (Next) deliberately; read OpenNext/Wrangler release notes before bumps.

## Incident response (pointer)

See **`star-map-app-final/docs/OPS_RUNBOOK.md`**: rollback, Stripe webhook log grep, kill switches.
