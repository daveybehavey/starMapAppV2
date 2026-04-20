## Capture source reporting

Promo signup `source` was already persisted on subscribe (`lastSource` in KV) and exposed on `GET /api/promotions/subscribers`, but funnel and digest outputs did not surface **which source leads**. This change aggregates active subscribers by `lastSource` (missing values → `unknown`) and shows the top source on `/funnel` and in `commerce-digest` / `loop-scorecard` CLI output.

Verification: open `/funnel?token=…` with `FUNNEL_DASHBOARD_TOKEN` set, or run `node scripts/commerce-digest.mjs` with `PRINT_ADMIN_TOKEN` and inspect the Promo signups section.
