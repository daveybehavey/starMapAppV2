## PR note (task 99c20cf8)

- **Change:** Centralized Slack/Discord “New task proposed” notifications in `company-os/lib/task-notify.ts` and call it from `POST /api/tasks` and from the `/tasks` server action so both automation and UI-created tasks get the same message.
- **Why:** `createTaskAction` previously inserted tasks and wrote events but never called `notifyWebhook`, so Slack could miss “New task proposed” when tasks were created from the form. The API path already notified; this aligns the UI path and keeps one implementation.
- **Verify:** `cd company-os && npm run notify:e2e` (requires `.env.local` with `COMPANY_OS_AUTOMATION_KEY` and `SLACK_WEBHOOK_URL` or `DISCORD_WEBHOOK_URL`, and `npm run dev` on port 3010 or let the script wait).
