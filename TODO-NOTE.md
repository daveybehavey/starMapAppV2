# PR note (Slack button test)

**Change:** `approveBriefingDraft` in `company-os/lib/briefing-draft.ts` no longer requires `status === "proposed"`. It rejects only `cancelled` and `merged`, so Slack **Approve** strips `[DRAFT]` after the agent runner has claimed the task (`claimed`), matching the manual `briefing:approve` PATCH behavior.

**Why:** Without this, Approve from Slack failed with “Task is not proposed” while the test task was claimed and still `[DRAFT]` in the title.
