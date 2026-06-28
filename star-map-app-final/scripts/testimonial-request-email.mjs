#!/usr/bin/env node
/**
 * Print a permissioned testimonial request email (copy/paste to past buyers).
 * Usage: node scripts/testimonial-request-email.mjs [--first-name "Alex"]
 */
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const firstName = (() => {
  const idx = process.argv.indexOf("--first-name");
  if (idx === -1 || idx + 1 >= process.argv.length) return "there";
  return process.argv[idx + 1].trim() || "there";
})();

const supportEmail = (process.env.PROMOTION_EMAIL_FROM || "hello@starmapco.com").replace(/^.*<([^>]+)>.*$/, "$1").trim();

const subject = "Quick favor — would you share how your star map turned out?";

const body = `Hi ${firstName},

Thank you again for ordering from StarMapCo. We're a small shop, and honest words from real buyers help other couples and gift-givers decide with confidence.

If you're open to it, would you reply with:

1. One or two sentences about your experience (what you ordered and who it was for)
2. Whether we may publish your first name + quote on starmapco.com (yes/no)
3. Optional: a photo of the print in your space (only if you're comfortable — we'll ask before using any image)

We never invent reviews or ratings — we only publish what buyers approve in writing.

No pressure at all. Either way, thank you for supporting the project.

— David
StarMapCo
${supportEmail}`;

console.log(`Subject: ${subject}\n`);
console.log(body);
