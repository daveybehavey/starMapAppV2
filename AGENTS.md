# AGENTS.md

Shared operating instructions for Cursor Cloud Agents, Codex, and ChatGPT Work.

GitHub Issues are the authoritative work queue. GitHub pull requests are the review and approval boundary. GitHub Actions is the authoritative validator.

Do not merge, deploy, or change production configuration unless a human explicitly approves that step in the linked issue or PR.

## Application root

- Runnable app: `star-map-app-final/`
- Package manager: **npm** (`star-map-app-final/package-lock.json`)
- Node: CI uses **Node 22** (`engines`: `>=20 <25`)
- Repo-root `src/`, `pages/`, `routes/`, `blog/`, and similar trees are legacy/static scaffolding — do not treat them as the app.
- `company-os/` is a gitignored local automation workspace and is not part of this operating model unless an issue explicitly says otherwise.

All commands below run from `star-map-app-final/` unless noted.

## Verified commands

These scripts exist in `star-map-app-final/package.json` and are used by `.github/workflows/ci.yml` / `.github/workflows/nightly-e2e.yml`:

| Purpose | Command |
| --- | --- |
| Install | `npm ci` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm run test:unit` |
| Production build | `npm run build` |
| Playwright (full local runner) | `npm run test:ui` |
| Commerce / recovery smoke | `npm run qa:smoke:commerce` |
| Render smoke | `npm run qa:smoke:render` |
| Full Playwright smoke (nightly) | `npm run qa:smoke` |
| PR-local composite (optional) | `npm run ci:pr` |

Playwright Chromium (when needed):

```bash
npx playwright install --with-deps chromium
```

### Cursor Cloud Node note

Some cloud VMs expose a default Node on `PATH` older than CI’s Node 22 latest. `npm ci`, `lint`, `typecheck`, and `build` usually work on that default. `npm run test:unit` (and `npm run ci:pr`) may require **Node ≥ 22.18** because unit tests import `.ts` via Node type-stripping. If unit tests fail with `ERR_UNKNOWN_FILE_EXTENSION`, prepend a Node 22.18+ binary to `PATH` before re-running.

## Workflow requirements

1. Work from a **GitHub issue**. Read the issue completely before editing.
2. Inspect relevant files before changing them. Prefer the smallest change that satisfies the issue.
3. Use an issue-linked branch name, for example:
   - `chore/<issue>-short-slug`
   - `fix/<issue>-short-slug`
   - `feat/<issue>-short-slug`
4. Open or update a **draft** pull request linked to the issue.
5. Report exact commands run and their results in the PR.
6. Stop before merge and before deployment.
7. Stop and ask for human direction when the required change exceeds the issue scope.

## Agent roles

| Role | Responsibility |
| --- | --- |
| ChatGPT Work | Audits, prioritization, structured issue creation, progress reporting, approval coordination. Not the default implementer when Cursor or Codex is available. |
| Cursor Cloud Agents | Primary implementation agent for bounded features, UI, tests, docs, SEO, routine fixes, small refactors, small CI changes. |
| Codex | Fallback implementer; independent reviewer of Cursor-authored PRs; preferred for architecture/security-sensitive work. |
| GitHub Actions | Authoritative validation (lint, typecheck, unit tests, build, Playwright commerce/render/full smoke). |
| BugBot | Not part of the initial setup. |

### Routing

1. Default implementer: **Cursor Cloud Agent**.
2. Use **Codex** when Cursor is unavailable, usage is exhausted, Cursor fails twice for environmental reasons, or the task is architecture/security sensitive.
3. Cursor-authored PRs require **independent Codex review**.
4. The implementation agent’s own review does **not** count as independent review.

## Risk classes

- **Low**: docs, tests, nonfunctional refactors, internal scripts, a11y tests, SEO metadata, CI improvements. Cursor may implement and test; independent review required; **no auto-merge**.
- **Medium**: customer-facing UI, editor behavior, analytics, API behavior, performance. Human approval required **before merge**.
- **High**: payments, auth, customer data, databases, secrets, permissions, infrastructure, production deployment, destructive ops. Human approval required **before implementation and before deployment**.

## Safety boundaries

Agents must **never** automatically:

- merge pull requests
- deploy or trigger production deployment
- change billing, Stripe, or Printful configuration
- change Cloudflare or Vercel configuration
- access, add, expose, or rotate production secrets
- change repository permissions or branch protection
- modify production data
- perform destructive migrations

Do not paste `.env` contents, API keys, or customer data into chat, commits, or PRs.

## Local environment (non-production)

For local/cloud implementation only, `star-map-app-final/.env.local` may use placeholder Stripe **test** values for editor/storefront/build. Real test keys are only needed for live checkout exercises. Never commit secrets. Never reference production secret values in docs or config files.

## Further reading

- Operating model: [`docs/AGENT_OPERATING_MODEL.md`](docs/AGENT_OPERATING_MODEL.md)
- Ops runbook (humans / deploy): [`star-map-app-final/docs/OPS_RUNBOOK.md`](star-map-app-final/docs/OPS_RUNBOOK.md)
