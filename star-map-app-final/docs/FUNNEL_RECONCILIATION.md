# Funnel reconciliation safety (#658)

The authenticated reconciliation endpoint is a read-only diagnostic. Omitted
`dryRun` defaults to true. Invalid JSON/options return 400. Explicit
`dryRun: false` returns 409 `apply_unavailable` before provider reads or writes.
The CLI retains its explicit apply acknowledgement, but cannot override this
server-side refusal.

`days` (1–60) covers UTC calendar dates including today; today's count ends at
the frozen `window.endExclusive` timestamp, not at midnight tomorrow. `limit`
(1–500) now caps **all scanned sessions**, including unpaid, QA and test sessions.
The endpoint only returns counts after the provider reports no more pages.
Limit exhaustion, repeated sessions, invalid cursors/pages and out-of-window
records produce 409 `scan_incomplete`; provider failures produce 502. Neither
returns partial counts as a complete result. Raising the limit can help a dry-run;
windows exceeding 500 sessions must be reduced.

Only positive-amount, paid StarMap sessions with `livemode === true` and no
existing QA classification enter `countsByDate` or marker lookups. API and CLI
responses contain aggregates, not session IDs. `repaired` is always zero;
`wouldRepair` counts missing session markers and is diagnostic only. These counts
do not establish net revenue, refunds, profitability or payment correctness.

## Why apply remains unavailable

The old `syncPaymentVerifiedWindow` read totals, replaced daily keys and then
replaced the all-time total. Cloudflare KV and its current adapter provide no
transaction or compare-and-swap across those keys and webhook writers. A lock
used only by reconciliation, or a second read before writing, cannot prevent
lost updates. Even individual session repair can race the existing dedupe and
counter writes. This patch removes the unused destructive replacement helper
and refuses every apply request instead of claiming to fix that race.

The complete-explicit-apply/idempotent-write acceptance criterion of #658 is
**not met**. Keep the issue open. Enabling apply requires a separately reviewed
design in which reconciliation and every live payment counter writer share an
atomic authority, with migration, failure/retry and concurrent-writer tests.
No storage migration, webhook change, live reconciliation, merge or deployment
is included in this patch. Do not bypass the refusal with direct KV writes.

## Offline validation

`node --test scripts/unit/funnelReconciliationSafety.test.mjs scripts/unit/funnelReconcile.test.mjs`
executes the actual route body with mocked provider/storage dependencies and the
real QA classifier, plus the existing CLI tests. Fixtures are synthetic. It
checks invalid input, read-only defaults, QA/test exclusion, bounded pagination,
UTC bounds, provider failure, apply refusal and aggregate-only output. This
does not prove a production incident or authorize a live repair.
