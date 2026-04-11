# Bulk Version Template Guide

Use this when a bulk/event order needs multiple map versions.

Template file:

- `public/templates/starmapco-bulk-versions-template.csv`

Recommended workflow:

1. approve one base layout or one style group first
2. keep logo placement and print spec consistent
3. collect the version rows in the CSV
4. generate the batch from that sheet

## Columns

- `version_name`
  - Short internal label for the version.
  - Example: `Scottsdale kickoff`

- `style_group`
  - Use this only if the order includes more than one approved style direction.
  - Example: `minimal`, `branded`, `wedding`

- `event_title`
  - Optional human-readable title for the final print.
  - Example: `Scottsdale Leadership Summit`

- `date`
  - ISO date preferred: `YYYY-MM-DD`

- `time`
  - Optional local time.
  - Prefer `HH:MM` in 24-hour format if exact time matters.

- `location_name`
  - Human-readable place label.
  - Example: `Scottsdale, AZ, USA`

- `latitude`
  - Decimal latitude if known.

- `longitude`
  - Decimal longitude if known.

- `timezone`
  - IANA timezone if known.
  - Example: `America/Phoenix`

- `quantity`
  - Number of pieces needed for this exact version.

- `notes`
  - Optional notes for wording, logo handling, or special constraints.

## Rules

- Keep one row per unique map version.
- If time does not matter, leave `time` blank.
- If exact coordinates are unknown, `location_name` is still enough to start.
- If multiple styles exist, make sure `style_group` matches an already approved style direction.
- Do not mix framed and unframed variants in the same sheet without calling that out separately in the quote.
