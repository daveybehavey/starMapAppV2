# Quick wins

Low regression risk, clear payoff. Do these before large refactors.

## Repository hygiene

1. **Ignore mobile build exports:** Add `dist-export/` (and any EAS export dirs) to `mobile-app/.gitignore` if not already present—prevents accidental commit of binaries/metadata.
2. **Single workspace entrypoint:** Prefer opening `StarMapAppV2.code-workspace` (or document in root README) so Cursor history and paths stay consistent (see ops rules).

## Developer experience

3. **Pre-merge command:** Document for contributors: `cd star-map-app-final && npm run ci:pr` (lint + build + commerce smoke subset per package scripts—verify exact script name in `package.json`).
4. **Link engineering docs from app README:** One paragraph in `star-map-app-final/README.md` pointing to `../../docs/engineering/README.md` (optional but reduces discovery friction).

## Documentation (already started)

5. Keep **AUDIT_REPORT.md** dated entries when you complete a review cycle (append section per date).

## Code (only when touching those files anyway)

6. When editing webhooks: extract **pure** payment/line-item parsers into `lib/` with unit tests—no behavior change, easier verification next time. **RevenueCat auth:** `src/lib/revenueCatWebhookAuth.mjs` + `npm run test:unit`.

## Non-goals for “quick”

- Rewriting `EditorExperience` in one PR.
- Changing KV key shapes without migration plan.
