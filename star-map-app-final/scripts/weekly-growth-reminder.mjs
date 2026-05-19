#!/usr/bin/env node
/**
 * Prints the weekly growth / release checklist for starmapco.com operators.
 * Run from star-map-app-final/:  npm run growth:weekly
 */
const lines = [
  "",
  "StarMapCo — weekly operator checklist",
  "====================================",
  "",
  "1. Funnel vs Stripe (last 14 days, needs STRIPE_SECRET_KEY in env):",
  "   npm run qa:funnel-reconcile -- --days 14",
  "",
  "2. SEO scoreboard (export 7d + prior 7d CSVs from Search Console):",
  "   npm run seo:scoreboard -- --current <current.csv> --previous <previous.csv>",
  "",
  "3. Before any production deploy:",
  "   npm run qa:release-gate:live:smoke",
  "",
  "4. After deploy:",
  "   npm run qa:live-smoke",
  "",
  "5. Money pages to improve when conversion is the bottleneck:",
  "   /star-map-gift  /personalized-star-map",
  "   Add real testimonials to src/data/testimonials.ts when you have permission.",
  "",
];

console.log(lines.join("\n"));
