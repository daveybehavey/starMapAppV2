# Playwright smoke manifest validation

`playwright-smoke-manifest.json` is the repository source of truth for the
named critical Playwright smoke selections:

- `qa:smoke:ui`
- `qa:smoke:render`
- `qa:smoke:commerce`
- `qa:smoke`

Run the deterministic guard from `star-map-app-final/`:

```bash
npm run validate:smoke-manifest
```

The guard compares each package script's selected specs with the manifest,
rejects missing or empty selected files, and runs the actual command with
Playwright `--list`. It does not launch browsers, execute tests, or start the
configured web server. Every critical command must discover at least one test.
Failures name the command, selected spec, and exact `npm run ... -- --list`
diagnostic command.

## Intentional exemptions

These specs are not critical smoke selectors:

| Spec                                 | Why it is exempt                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `tests/manual-flow.spec.ts`          | Operator-driven end-to-end walkthrough; intentionally kept out of deterministic critical smoke selection.             |
| `tests/stripe-qa.spec.ts`            | Live, headed Stripe QA gated by `PLAYWRIGHT_STRIPE_QA=true`; repository validation must not contact production.       |
| `tests/map-tier-visual.snap.spec.ts` | Targeted visual snapshot verification. Baseline refreshes are intentional operator actions, not a general smoke gate. |

The exemptions are also recorded in `playwright-smoke-manifest.json`, and the
validator rejects missing exempted specs or overlap between exempt and critical
specs. Other Playwright specs remain available through `npm run test:ui` or
their documented targeted commands; exemption does not disable discovery or
execution outside this guard.
