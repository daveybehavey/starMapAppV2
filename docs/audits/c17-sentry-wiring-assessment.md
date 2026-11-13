# C17 Sentry wiring assessment — implementation stopped

Baseline: `main@b12585834e4952fd3bebd7444b7adbb158088461`. Related issue: #429.

The task premise that the app has no Sentry SDK wiring is stale. Existing
implementation landed in #431; CI release/source-map upload landed in #438.
This assessment changes documentation only and does not enable monitoring.

## Existing integration

- `star-map-app-final/package.json` already declares `@sentry/react` and
  `@sentry/cloudflare` (^11.9.0). This is the repository's native browser/Worker
  approach, not a Node-hosted Next.js server integration.
- `src/app/layout.tsx` mounts `SentryProvider`; `src/lib/sentryBrowser.ts`
  checks the DSN before dynamically importing or initializing the SDK.
  Editor boundaries also report through that shared initializer.
- `wrangler.toml` selects `cloudflare-worker.ts`, which imports the generated
  OpenNext handler. That entry wraps fetch/scheduled handling and Durable
  Objects with the Cloudflare SDK. Missing/invalid DSN yields `enabled: false`.
  This establishes a capture gate, not proof of zero SDK instrumentation or
  identical runtime behavior: the Worker SDK and wrappers are still loaded.
- Both runtimes apply `SENTRY_DATA_COLLECTION_OFF`, drop breadcrumbs, and use
  the shared deny-by-default `beforeSend` scrubber in `src/lib/sentryScrub.ts`.
  The scrubber rebuilds events, drops user/request/body/context payloads, and
  replaces raw exception messages. Tracing is zero; error sampling is 1.0.
  C17's conservative sampling requirement is therefore unresolved.
- `.github/workflows/ci.yml` already uses `SENTRY_AUTH_TOKEN` to create/finalize
  `starmapco@<commit-sha>` releases and upload browser source maps when
  `SENTRY_ORG` and `SENTRY_PROJECT` repository variables and the token exist.
  `next.config.mjs` gates browser source maps on `SENTRY_SOURCEMAPS=1`.
  These files and this automation are unchanged. No release automation added.

## Owner-only activation instructions (not performed)

The existing DSN names match Sentry's conventional Next.js environment names:

| Variable | Where the existing code reads it |
| --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser production **build environment**; compiled into the client bundle. A later rebuild and separately authorized deployment are necessary. |
| `SENTRY_DSN` | Cloudflare Worker **runtime environment** binding, read from `env`. |

The owner supplies the real project DSN separately. Neither variable is set by
this task; `SENTRY_AUTH_TOKEN` is an upload credential and does not activate
runtime capture. Optional `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `SENTRY_ENVIRONMENT`
label events. Optional `NEXT_PUBLIC_SENTRY_RELEASE` / `SENTRY_RELEASE` should
match `starmapco@<commit-sha>` for source-map association; CI already sets the
browser release for its build. The production deploy build needs its own browser
DSN/release inputs; a CI artifact does not automatically configure that build.
Retain project-side sensitive-data scrubbing and IP exclusion as described in
`star-map-app-final/docs/SENTRY-ACTIVATION.md`. Activation and a synthetic event
verification drill require a separately authorized task after the gaps below
are resolved. Existing comments about billing caps are not independently verified
by this assessment.

## Standing-fence stop

Open PR file lists inspected: #527, #566–#572, #576–#579.

- #567 and #572 own `star-map-app-final/package.json` and `package-lock.json`.
  Any SDK dependency change collides; no manifest change is attempted.
- Strengthening the Worker no-DSN bypass or lowering Worker sampling requires
  changing `cloudflare-worker.ts`. That same file exports the print-order
  authority and contains print hold/review scheduled sweeps. C17 explicitly
  forbids touching the print-order pipeline. No change is attempted there.
- No existing open PR owns this new assessment document.

Implementation stops at these boundaries instead of adding parallel SDK wiring
or partially claiming compliance. Re-scope Worker-entry ownership explicitly
before remediation; coordinate manifests with their current PR owners only if
dependency changes are actually needed.

## Validation and acceptance limits

From `star-map-app-final/`, Node v24.19.0:

`env -u SENTRY_DSN -u NEXT_PUBLIC_SENTRY_DSN node --test scripts/unit/sentryScrub.test.mjs`

Passed 11/11 existing tests, covering configuration gating, integration filtering,
scrubbing canaries, and fail-closed behavior. These test the scrubber/config
helper, not an emitted SDK envelope or the deployed Worker lifecycle.

No application changes, full build/full unit suite, deployment, live ingestion,
or production configuration inspection performed. C17's requested CI build plus
full unit suite with DSNs unset remains **unverified**, and strict Worker
inertness/conservative sampling remain **unresolved**. Root docs-only changes do
not match the current CI workflow's path filter; no hosted CI success claimed.
Existing designs/render inputs are untouched; no pixel-comparison claim.

Draft PR only. Never mark ready, merge, or deploy under this task.
