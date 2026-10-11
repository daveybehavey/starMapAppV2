# Purchase analytics consent and delivery boundary

Checkout snapshots the existing explicit analytics preference and DNT state once before automatic retries. Only `granted-v1` authorizes server purchase capture. Missing, malformed, declined, DNT-enabled and legacy checkout sessions default to no optional GA4/PostHog capture. Stripe terms acceptance is not analytics consent. No historical or later grant is inferred.

The snapshot travels in the checkout body and, only when granted, Stripe metadata. Its versioned idempotency suffix keeps changed metadata separate from existing denied/legacy requests. Automatic retries keep the same decision and request identity; a new manual checkout after changing consent can create a distinct unpaid session. Post-checkout withdrawal synchronization is not implemented.

Verification and webhook handlers schedule optional analytics with Next.js `after`. Essential paid state, entitlement response and print fulfillment do not await providers. The optional job has a 1.5-second deadline and aborts provider fetches; a stalled non-abortable storage operation may remain pending, but cannot hold the essential handler response. A missing scheduling context skips analytics.

This is best-effort capture, not a durable outbox. Existing paid-state guards can suppress later retries after a failed capture. Concurrent handlers can attempt duplicate captures: provider transaction/insert identifiers are stable, but storage checks are not a distributed exactly-once lock. No delivery guarantee or live provider configuration validation is claimed.

Local verification uses synthetic Stripe/Printful/storage boundaries around actual checkout, verify, webhook and credit-consumption handlers. Browser tests exercise both editors, consent/DNT snapshots and retries with external requests blocked. No live payments or fulfillment are used.

The success-page digital add-on and download-page print checkout use the same explicit snapshot as both editors; print captures it before rendering/upload preparation. These two entrypoints currently make one checkout request per action, and do not introduce automatic retries. Every browser checkout handoff uses the shared exact-host/default-port validator, allowing only /pay/cs_*, /c/pay/cs_* and /f/pay/cs_* session paths while preserving fragments.

Internal payment_verified accounting starts independently of optional GA4/PostHog capture. Provider timeout/abort cannot suppress the aggregate update. Existing paid/free/QA meaning, session increment dedupe and TTLs are unchanged. Internal storage failure remains best-effort and non-atomic storage is not distributed exactly-once; the post-response task remains bounded, while non-abortable storage may finish later.
