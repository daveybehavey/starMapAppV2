# F-WH-1 Phase 1 build and rotation

Base: `905ac521` (includes #623–#626). Phase 1 only. No PR, merge,
deployment, production secret access or production configuration change is part
of this build. Jack opens the draft for the Tier C chair gate.

## Implemented behavior

Authenticated v1 events are hints. Before session resolution, notification, or
failure/hold application, the route reads the current order using the existing
`PRINTFUL_API_TOKEN` and `PRINTFUL_API_BASE_URL` configuration. Reads bypass caches,
reject redirects, and have a 10-second timeout (including body consumption).
API errors, malformed responses, identity disagreement, absent shipment tracking,
or unconfirmed status return 503 without invoking application handlers.

Both supplied identifiers must agree with the API. External-only hints use v1's
`@external_id` lookup. Only returned API identifiers are passed to session
resolution. Failure requires `failed`, cancellation requires `canceled`, and hold
requires `onhold`. Unknown event types retain 200 ignored behavior. Token
authentication still precedes JSON parsing; constant-time comparison, header
fallback, empty-secret 401, and malformed-JSON 400 remain.

Shipping fields come from the first API shipment with a tracking number, in API
array order. Payload shipment fields never select or populate the shipment.
Existing shipping notification idempotency and apply functions are unchanged.
No checkout, prices, customer copy, Stripe, or entitlement changes.

Route warning logs contain fixed path/outcome fields. Verification alerts contain
only fixed path/outcome, numeric order ID, known event type and enumerated reason.
No exception text, request objects, free-text webhook reasons, or URLs are logged.
Existing Sentry scrubbing drops request data. Wrangler disables automatic
invocation logs, because those platform-generated records can contain the full
incoming URL. Explicit sanitized console logs remain enabled.

## Production rotation runbook — pending chair-approved deployment

Do not record or paste a configured webhook URL in chat, tickets, runbooks, shell
commands/history, screenshots, or logs. The URL token is still secret in v1.

1. Complete the chair gate and arrange the approved deployment/rotation window in
   a low-traffic minute. Confirm the store token can read orders. Check that the
   deployed Wrangler configuration has invocation logs disabled. Review any
   account-level HTTP Logpush, proxy/access logging, Tail consumers, and dashboard
   observability exports: omit query strings for this path or disable collection
   of these requests. Application code cannot sanitize upstream access records.
2. Retain the old secret temporarily in the team password vault. Generate a new
   value with a cryptographic password-manager generator using at least 32 random
   bytes (256 bits); store it only in the vault during the change window. Never
   commit it or add it to an environment file in the repository.
3. Set `PRINTFUL_WEBHOOK_SECRET` on the correct production Cloudflare Worker using
   the dashboard's secret field (or interactive `wrangler secret put
   PRINTFUL_WEBHOOK_SECRET`, pasting only at the hidden prompt). Ensure the new
   secret is active. There is no dual-secret acceptance.
4. Immediately edit the existing v1 Printful configuration privately in its
   dashboard: keep the existing endpoint path, event types and other settings;
   replace the `token` query parameter with the new value. Save. v1 has one active
   URL, so brief authorization failures between steps 3 and 4 are expected and
   must remain retryable deliveries. Do not create a v2 configuration.
5. Immediately GET the endpoint with the new token using the retained
   `x-printful-token` header. Use an in-memory client with request/response tracing
   off and no verbose output; output status only. Expect 200 ready. GET and POST
   using the vault-retained old token must return 401; an old-token POST may use
   an empty body because auth must reject it before parsing. Also verify the
   dashboard configuration via a real/test v1 delivery: a header health check
   alone does not prove the dashboard URL was saved correctly.
6. Confirm one API-confirmed event end to end, including the existing application
   idempotency behavior on redelivery. Check sanitized path/outcome logs and
   ensure no URL query or secret is present in downstream exports. Record only
   statuses, event type, and aggregate outcomes in gate evidence. Clear clipboard
   and temporary client memory. Delete the old vault value only after this live
   proof. Phase 1 remains operationally incomplete until these steps are done.

Rollback: revert the code through the gate if needed. To roll back a problematic
rotation, restore the vault-retained old Worker secret and dashboard token in the
same window, then repeat the health/delivery checks. Never restore URL logging.

## Differences and limitations for the chair

- Actual production rotation and probes are pending the chair deployment gate;
  this branch cannot honestly claim a live rotation. No production access used.
- The audit's `securityAuditInvariantPins.test.mjs` exists only in draft #621,
  not reconciled main. Dedicated real-route tests were added here instead of
  importing unrelated audit work. The existing money-path hold integration
  fixtures now supply independent API confirmation and expect stale holds to
  retry; the other existing suites run unchanged.
- API order reads do not provide the webhook's free-text failure/hold reason;
  reason is passed as null rather than trusting the body. Existing API-backed
  file review can still enrich failure details. No notification template changed.
- Missing API shipment tracking returns 503 even if a shipment object exists;
  a later API read may acquire tracking, so acknowledging it would lose the
  notification. The existing handler's missing-tracking fallback is preserved.
- Multi-shipment events select the first API shipment with tracking. The current
  notification path is per order and already deduplicates per order; no new
  per-package notification semantics are introduced.
- Disabling invocation records applies worker-wide: Cloudflare's setting cannot
  redact one route's query. Sanitized application logs remain. External access
  logging must be checked operationally at deployment.
- v1 still carries the token in the URL and has no provider body signature.
  A token alone can trigger reads/retries, but cannot supply order state or
  tracking fields. Current API truth is the gate; Phase 2 HMAC is deferred.

Provider references: [Printful v1 orders and webhooks](https://developers.printful.com/docs/),
[Cloudflare Workers logging configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).
