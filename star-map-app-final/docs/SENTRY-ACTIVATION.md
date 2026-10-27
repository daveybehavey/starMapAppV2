# Sentry activation checklist (SQ-58 / issue #429)

The Sentry wiring shipped dark: both SDKs stay inert until a DSN exists, and
the privacy contract (shared deny-by-default scrubber in
`src/lib/sentryScrub.ts`, SDK `dataCollection` fully off, errors-only
sampling, no traces/replay/breadcrumbs) is already in code and unit-tested.

## Owner steps to activate

1. **Browser DSN** — set `NEXT_PUBLIC_SENTRY_DSN` in the production build
   environment (Cloudflare Workers Builds variables). Optionally
   `NEXT_PUBLIC_SENTRY_RELEASE=starmapco@<commit-sha>`; CI already bakes the
   release into its own builds. Rebuild/redeploy so the value is inlined.
2. **Worker DSN** — set `SENTRY_DSN` (and optionally `SENTRY_RELEASE`,
   `SENTRY_ENVIRONMENT`) in the Worker environment via the Cloudflare
   dashboard. Deliberately NOT a `wrangler.toml` [vars] entry: binding budget
   and activation must stay an explicit owner action.
3. **Project-side settings** — in the Sentry project: enable sensitive-data
   scrubbing and IP-address exclusion (defense in depth; `beforeSend` cannot
   control network source addresses at ingestion).
4. **CI release + source-map upload** — set repository variables
   `SENTRY_ORG` and `SENTRY_PROJECT`, then add the step below to
   `.github/workflows/ci.yml` in the `build-and-commerce-smoke` job,
   immediately after the "Production build" step, and add the two `env`
   entries to that build step. (This step is not yet in ci.yml: the agent
   environment's GitHub OAuth token lacks the `workflow` scope needed to
   push workflow-file changes. The existing `SENTRY_AUTH_TOKEN` Actions
   secret is already in place.)

   Build-step env additions:

   ```yaml
   env:
     NEXT_PUBLIC_SENTRY_RELEASE: starmapco@${{ github.sha }}
     SENTRY_SOURCEMAPS: ${{ vars.SENTRY_ORG != '' && vars.SENTRY_PROJECT != '' && '1' || '' }}
   ```

   New steps after "Production build":

   ```yaml
   - name: Check Sentry credentials
     id: sentry-creds
     env:
       SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
     run: |
       if [ -n "$SENTRY_AUTH_TOKEN" ]; then
         echo "available=true" >> "$GITHUB_OUTPUT"
       else
         echo "available=false" >> "$GITHUB_OUTPUT"
       fi

   - name: Upload Sentry release and source maps
     if: ${{ vars.SENTRY_ORG != '' && vars.SENTRY_PROJECT != '' && steps.sentry-creds.outputs.available == 'true' }}
     env:
       SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
       SENTRY_ORG: ${{ vars.SENTRY_ORG }}
       SENTRY_PROJECT: ${{ vars.SENTRY_PROJECT }}
       SENTRY_RELEASE: starmapco@${{ github.sha }}
     run: |
       npx --yes @sentry/cli@2 releases new "$SENTRY_RELEASE" || echo "Sentry release already exists"
       npx --yes @sentry/cli@2 sourcemaps upload --release "$SENTRY_RELEASE" --url-prefix "~/_next/static" .next/static
       npx --yes @sentry/cli@2 releases finalize "$SENTRY_RELEASE"
   ```

   The credential check gates the upload because fork and Dependabot runs
   withhold the `SENTRY_AUTH_TOKEN` secret while the repository variables
   remain set, so without the gate the upload would fail the job before the
   smoke tests run.

   With `SENTRY_SOURCEMAPS=1` in the build env, `next.config.mjs` emits
   browser source maps for that build only — maps are never emitted for
   ordinary production builds, so they never become publicly served assets.
   Worker-artifact source maps (`.open-next` output) can be uploaded with
   the same `sourcemaps upload` command from the deploy environment as a
   follow-up.

5. **Verification drill** (per SQ-58 §5) — against a test target, trigger one
   browser and one Worker unhandled exception with synthetic privacy
   canaries (fake email/address/token/order payload/asset URL in body,
   query, headers, cookies, exception text, breadcrumbs); confirm the
   received events carry the exact `starmapco@<sha>` release, resolve source
   frames, and contain none of the canary material; confirm project IP
   handling. A quota-dropped event is a failed drill, not a pass.

## Notes

- Sentry pay-as-you-go is capped at $0: once the plan allowance is consumed,
  Sentry drops events rather than billing. Absence of an event is never
  proof of success; keep independent smoke checks authoritative.
- Plan/credits: downgrade or cancel **before October 24, 2027** or the card
  on file starts being charged (tracked in the improvement expiry ledger).
