## Linked issue

Fixes #

## Summary

<!-- One or two sentences: what changed and why. -->

## Exact files changed

<!-- List every path intentionally changed. -->

-

## Scope confirmation

- [ ] Changes match the linked issue scope
- [ ] Exclusions in the issue were respected
- [ ] No unrelated refactors

## Tests run and results

| Command | Result |
| --- | --- |
| `npm ci` | |
| `npm run lint` | |
| `npm run typecheck` | |
| `npm run test:unit` | |
| `npm run build` | |
| `npm run qa:smoke:commerce` (if applicable) | |
| `npm run qa:smoke:render` (if applicable) | |
| Other | |

## Independent review status

- Implementation agent:
- Independent reviewer required: Codex (for Cursor-authored PRs)
- Independent review status: pending / complete / N/A
- Note: the implementation agent’s own review does **not** count as independent review

## Privacy and security assessment

- [ ] No production secrets added, exposed, or rotated
- [ ] No customer data included in the PR
- [ ] No billing / Stripe / Printful / Cloudflare / Vercel production config changes unless explicitly approved in the issue

## Deployment impact

- [ ] No deployment performed
- [ ] No production deployment workflow triggered
- Impact if merged:

## Rollback procedure

<!-- How to revert safely after merge. -->

## Unresolved risks / assumptions

-

## Merge and deploy confirmation

- [ ] Draft PR only until review/approval gates pass
- [ ] No automatic merge occurred
- [ ] No automatic deployment occurred
