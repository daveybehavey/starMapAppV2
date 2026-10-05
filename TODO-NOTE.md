# PR note (task efbba150-fd99-4393-945d-c6f9fee9158b)

**Slack button test (22:25:10)** — Acceptance (“Click Approve or Reject in Slack”) is **manual**: use the buttons on the Slack message for this task, then confirm on `/tasks` that the title drops the `[DRAFT]` prefix after **Approve**, or status becomes **cancelled** after **Reject**.

No code changes were required in this branch. The interactive handler and draft approve/reject rules already live under the canonical `company-os/` tree (`api/slack/interactions`, `lib/briefing-draft.ts`); that package is **gitignored** here and is not part of this worktree checkout.
