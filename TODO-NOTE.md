## Checkout daily ratio sanity

Adds `npm run qa:checkout-daily-ratio` in `star-map-app-final`, a read-only script that prints per-UTC-day **preview_started → checkout_session_created → payment_verified** ratios from the same funnel KV as `qa:commerce-digest`. Exits non-zero only if `payment_verified` exceeds `checkout_session_created` on any day (clear inconsistency). Use `--days 7` (default) for routine review or `--days 1` for a fast pulse; `--json` for automation.

Conservative scope: no new APIs, no prod writes, no CI changes.
