# Known risks

## Operational

| Risk | Mitigation (existing) | Gap |
| --- | --- | --- |
| Bad deploy | `wrangler rollback`; OPS runbook | Train on rollback; keep deployment IDs noted during releases |
| Stripe webhook misconfig | Signature verification + structured logs | Alerting on verify failures (external monitor) |
| Printful outage / API errors | Retries, alerts (`printOrderAlerts`) | Runbook for manual fulfillment |

## Product / correctness

| Risk | Notes |
| --- | --- |
| Astronomical accuracy regressions | Core engine dependency (`astronomy-engine`); treat upgrades carefully |
| Pricing mismatch (client vs server) | Server is source of truth at checkout; client labels from env |
| Geo pricing experiment | Feature-flagged (`GEO_DIGITAL_SINGLE_PRICING_*`)—validate country JSON before enabling |

## Security

| Risk | Notes |
| --- | --- |
| Magic link abuse | Rate limits and caps—verify in implementation |
| Leaked secrets in chat/logs | Policy: never echo `.env`; redact tokens in support tooling |

## Organizational

| Risk | Notes |
| --- | --- |
| Two-agent parallel work (web vs mobile) | Coordinate on shared API contracts; update `mobile-app/README.md` and route handlers together |
| Documentation drift | Update engineering docs in same PR as behavior changes when practical |
