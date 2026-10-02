## Agent note (PR body)

`company-os/` is gitignored in the main repo; `npm run notify:e2e` uses the local `company-os` tree beside this monorepo (same layout as in ops docs).

**Behavior:** `POST /api/tasks` calls `notifyWebhook` with title `New task proposed` and body text built from the task title plus `acceptanceCriteria` when present (so the Slack message is well over 10 characters). The handler uses `runtime = "nodejs"` and `dynamic = "force-dynamic"` so `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` are available at request time.

**Verification:** With `COMPANY_OS_AUTOMATION_KEY` and a webhook URL in `company-os/.env.local`, run `npm run dev` in `company-os` if needed, then `npm run notify:e2e`. Confirm Slack shows a message whose heading is **New task proposed**.

No tracked app code changes were required in this worktree; acceptance is met by the existing local `company-os` API route behavior.
