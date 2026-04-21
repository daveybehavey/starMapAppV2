## Checkout ratio sanity check

The `npm run qa:checkout-ratio-sanity` script (run from `star-map-app-final/`) reads the same funnel dashboard counts as the commerce digest: `preview_started`, `checkout_session_created`, and `payment_verified`. The “24h” window is implemented as the funnel API’s `days=1` range (UTC calendar days aggregated in KV), not a rolling clock-24h Stripe query. When the deployed site sets `FUNNEL_DASHBOARD_TOKEN`, the script needs that token in the environment (for example via `.env.local`, which this task does not modify).
