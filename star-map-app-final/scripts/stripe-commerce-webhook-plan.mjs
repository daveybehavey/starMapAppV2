import fs from 'node:fs';
import { planCommerceWebhookEvents } from './lib/stripe-commerce-webhook-events.mjs';
const file = process.argv[2];
if (!file || process.argv.length !== 3) throw new Error('Usage: node scripts/stripe-commerce-webhook-plan.mjs <local-event-list.json>. Offline only; no credentials.');
const input = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(JSON.stringify(planCommerceWebhookEvents(input), null, 2));
