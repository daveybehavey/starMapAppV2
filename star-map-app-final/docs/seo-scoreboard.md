# Weekly SEO Scoreboard

Use this after exporting Search Console "Performance" CSV files.

## 1) Export two CSV files from Google Search Console

- Current window (example: last 7 days)
- Previous comparable window (example: previous 7 days)
- Export in CSV format with columns that include clicks, impressions, CTR, and position.

## 2) Generate the scoreboard

```bash
npm run seo:scoreboard -- \
  --current /path/to/current.csv \
  --previous /path/to/previous.csv \
  --out reports/seo-weekly-scoreboard.md
```

## 3) Review output

The report includes:

- Overall clicks/impressions/CTR/avg position deltas
- Focus keyword groups (star map, constellation map, gift intent terms)
- Focus page performance
- Top queries and top pages by impressions
