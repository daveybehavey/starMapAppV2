# Agent operating model

This document defines how StarMapCo uses GitHub, Cursor Cloud Agents, Codex, ChatGPT Work, and GitHub Actions together.

It implements the repository operating foundation approved in GitHub issue #141.

## Sources of truth

| Concern | Authority |
| --- | --- |
| Work queue | GitHub Issues |
| Implementation | Cursor Cloud Agents (primary), Codex (fallback) |
| Coordination / audits / prioritization / approvals | ChatGPT Work |
| Validation | GitHub Actions |
| Review and merge boundary | GitHub pull requests + human policy by risk class |

BugBot is **not** part of the initial setup.

## Roles

### ChatGPT Work

- Portfolio coordination
- Repository audits
- Task prioritization
- Structured GitHub issue creation (prefer `.github/ISSUE_TEMPLATE/agent-task.yml`)
- Progress reporting
- Approval coordination
- Not the default implementer when Cursor or Codex is available

### Cursor Cloud Agents

Primary implementation agent for:

- bounded feature work
- UI changes
- tests
- documentation
- SEO implementation
- routine bug fixes
- small refactors
- small CI changes (only when an issue explicitly allows workflow edits)

### Codex

Use for:

- Cursor fallback
- complex debugging
- architecture
- security-sensitive work
- difficult state or concurrency problems
- migrations
- **independent review** of Cursor-authored pull requests

### GitHub Actions

Authoritative validation for:

- lint
- typecheck
- unit tests
- production build
- Playwright commerce/recovery smoke
- Playwright render smoke
- full Playwright smoke (nightly)
- other deterministic policy checks already defined in workflows

Current workflow references:

- `.github/workflows/ci.yml` — PR gate: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm run qa:smoke:commerce`, plus `npm run qa:smoke:render`
- `.github/workflows/nightly-e2e.yml` — `npm run qa:smoke`

## Application and commands

- Application root: `star-map-app-final/`
- Package manager: npm
- Node in CI: 22

Verified commands (all from `star-map-app-final/`):

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:ui                 # full Playwright runner helper
npm run qa:smoke:commerce       # commerce / recovery smoke
npm run qa:smoke:render         # render smoke
npm run qa:smoke                # full smoke used by nightly E2E
npx playwright install --with-deps chromium
```

Agents must not invent alternate installers or undocumented deploy shortcuts.

## Agent routing

1. **Cursor Cloud Agent** by default.
2. **Codex** when:
   - Cursor is unavailable
   - Cursor usage is exhausted
   - Cursor fails twice for environmental reasons
   - the task is security-sensitive
   - the task requires deeper architectural reasoning
3. Cursor-authored pull requests require **independent Codex review**.
4. The implementation agent’s own review does **not** count as independent review.
5. Codex-authored pull requests still require a fresh-context review plus green GitHub Actions.

## Risk classes

### Low risk

Examples: documentation, tests, nonfunctional refactors, internal scripts, accessibility tests, SEO metadata, CI improvements.

Allowed future policy:

- automatic implementation
- automatic testing
- automatic independent review
- automatic fixes

**Auto-merge is not enabled** by this operating model.

### Medium risk

Examples: customer-facing UI, editor behavior, analytics, API behavior, performance changes.

Requires **human approval before merge**.

### High risk

Examples: payments, authentication, customer data, databases, secrets, permissions, infrastructure, production deployment, destructive operations.

Requires **human approval before implementation and before deployment**.

## Safety boundaries

Agents must never automatically:

- merge
- deploy
- trigger production deployment
- change billing
- change Stripe or Printful
- change Cloudflare or Vercel
- access, add, expose, or rotate production secrets
- change repository permissions
- change branch protection
- modify production data
- perform destructive migrations

Production secrets must not be committed to the repository or written into `AGENTS.md`, `.cursor/environment.json`, issue templates, or this document.

## Cursor environment configuration

Repo file: `.cursor/environment.json`

Supported schema fields (from `https://www.cursor.com/schemas/environment.schema.json`) include:

- `name`
- `install` (update script after pull)
- optional `start`, `terminals`, `ports`, `snapshot`, `build`, `user`, `repositoryDependencies`, `agentCanUpdateSnapshot`

This repository configures only the minimum:

- `name`
- `install`: `cd star-map-app-final && npm ci`

Intentionally omitted:

- `start` / `terminals` — no automatic app or production-service startup
- secrets / env values — never stored in this file
- deploy commands
- unsupported fields such as `workingDirectory` (not in the schema; working directory is expressed via `cd` inside `install`)

Node version is not a field in `environment.json`. Compatibility with CI Node 22 is expected from the cloud base image/snapshot plus the install command. See `AGENTS.md` for the unit-test Node ≥ 22.18 note observed on some VMs.

## Branch and PR policy

- Branch from the current default branch (`main`).
- Prefer issue-linked names: `chore/<issue>-slug`, `fix/<issue>-slug`, `feat/<issue>-slug`.
- Open **draft** PRs.
- Use `.github/pull_request_template.md`.
- Stop before merge unless a human explicitly merges.

## Related files

- `AGENTS.md` — command and safety quick reference for all agents
- `.cursor/rules/starmapco-agent.mdc` — always-on Cursor rule
- `.cursor/environment.json` — cloud environment install only
- `.github/ISSUE_TEMPLATE/agent-task.yml` — structured agent issues
- `.github/pull_request_template.md` — PR reporting checklist
