## PR note (task 891c9449)

- **Sprint calendar:** Rows in `docs/traffic-sprint-tracker.csv` use `date_posted` with sprint **day 1 = 2026-04-07** so **day 14 = 2026-04-20**, matching the task “today” date for the command center.
- **Metrics columns:** Numeric engagement and funnel fields are initialized to `0` as a neutral baseline so the repo does not assert fabricated platform stats. Operators should paste real numbers from TikTok / Instagram / Pinterest / site analytics per `docs/traffic-sprint-14-day.md`.
