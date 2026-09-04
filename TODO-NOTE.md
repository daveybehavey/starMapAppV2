## Agent note (PR body)

`company-os/` is gitignored in the main repo; changes were applied to the local `company-os` tree (same layout as `npm run notify:e2e`).

**What changed:** `POST /api/tasks` (and `POST /api/approvals` for parity) now export `runtime = "nodejs"` and `dynamic = "force-dynamic"` so these handlers match other webhook-heavy routes and always run in Node with request-time env (e.g. `SLACK_WEBHOOK_URL`). Task Slack metadata `link` now points at `/tasks` instead of `/`, consistent with the approval ping linking to `/approvals`.

**Verification:** With `company-os` dev server and `.env.local` (automation key + Slack or Discord webhook), run `npm run notify:e2e` and confirm a Slack message whose heading is **New task proposed**, with body text at least 10 characters (from the task title and/or acceptance criteria).
