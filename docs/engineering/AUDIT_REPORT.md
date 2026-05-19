# Audit report

**Cycle:** 2026-05-14 (initial)  
**Scope:** Repo structure, `star-map-app-final` configs, representative API/lib paths, CI; **not** a full line-by-line audit or fresh `npm audit` run in this session.

## Summary

The codebase is **production-shaped**: structured logging on money paths, explicit env parsing, OpenNext + Wrangler, CI lint/build, extensive QA scripts. Primary risks are **maintainability of very large UI modules**, **density of webhook/KV logic**, and **repository hygiene** (legacy root tree, build artifacts). Security posture depends heavily on **secrets staying out of git** and **webhook signature verification**—Stripe route reviewed at a high level; others need periodic checklist review.

## Findings

| ID | Area | Severity | Finding | Root cause | Downstream risk | Fix now / later |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | UI architecture | Medium | `EditorExperience` is a multi-thousand-line component. | Organic feature growth. | Regression rate, slow refactors, hard review. | **Later** (phased extract); gate with tests. |
| A2 | Webhooks | Medium | Stripe webhook route is large and multi-concern. | Single handler for related side effects. | Subtle ordering/idempotency bugs. | **Later**; add unit tests around pure helpers first. |
| A3 | Repo layout | Low | Root-level legacy `pages/` / static HTML alongside app. | Historical site. | Wrong-file edits, Turbopack confusion. | **Later**; archive or document “do not use.” |
| A4 | DX / artifacts | Low | Mobile `dist-export`, large `.aab` may appear in `git status`. | Export scripts / local builds. | Accidental commits, noisy reviews. | **Now** (gitignore hygiene)—see QUICK_WINS. |
| A5 | Verification gap | Low | Full `eslint`/`tsc` not completed in agent session (prior run timed background). | Environment / long runs. | Undetected issues. | **Now**: rely on CI; locally run `npm run ci:pr` before merge. |
| A6 | Config clarity | Low | `wrangler.toml` mixes many `[vars]` (public-by-definition in Workers). | Cloudflare pattern. | Contributors confuse public vs secret. | **Later**: document in SECURITY_NOTES; keep secrets only in dashboard. |

## Security spot-check (non-exhaustive)

- Stripe webhook uses **`STRIPE_WEBHOOK_SECRET`** and structured logging—good baseline.
- **Unverified in this pass (2026-05-14):** payload size limits on some JSON routes; ops routes auth—see SECURITY_NOTES (updated 2026-05-15) for rate-limit spot check.

## Follow-up 2026-05-15 (implementation)

| ID | Change | Notes |
| --- | --- | --- |
| B1 | RevenueCat webhook auth | Extracted to `src/lib/revenueCatWebhookAuth.mjs` + `.d.ts`; `npm run test:unit` covers header matching. |
| B2 | Mobile claim rate limit | Dedicated KV key `account:mobile:claim:*` (was sharing `account:magic:claim`). |
| B3 | `/api/download/archive` | Per-IP limits: GET 40/min, POST 10/min (token still required). |
| B4 | KV prefix doc | `src/lib/kvKeyPrefixes.ts` registry for ops grep. |

## Recommended next audit actions

1. Run **`npm run ci:pr`** locally after substantive changes.
2. Add **quarterly** `npm audit` + dependency review update to DEPENDENCY_REVIEW.md.
3. Pick one **high-risk route** per sprint (checkout, magic claim, printful webhook) for focused code + test review.
