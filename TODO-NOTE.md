# PR note (agent task 54f734af)

Fix: `company-os/app/api/tasks/route.ts` — prepend `New task proposed` to the Slack webhook body so the phrase appears in Slack previews and clients that only show the message body (not the formatted title line). `company-os/` is gitignored in StarMapAppV2; merge the same change into the company-os repo your runner uses. Verify with `cd company-os && npm run notify:e2e` (dev server + `.env.local` with `COMPANY_OS_AUTOMATION_KEY` and `SLACK_WEBHOOK_URL`).
