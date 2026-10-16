#!/usr/bin/env node
/**
 * Print a permissioned testimonial request email (copy/paste to past buyers).
 * Usage: node scripts/testimonial-request-email.mjs [--first-name "Alex"]
 */
import { loadDotenv } from "./load-dotenv.mjs";

export const TESTIMONIAL_REVIEW_LINKS = {
  google: {
    href: "https://g.page/r/CVMm_3hOFgRTEAI/review",
    label: "Review us on Google",
  },
  trustpilot: {
    href: "https://www.trustpilot.com/review/starmapco.com",
    label: "Review us on Trustpilot",
  },
};

export function buildTestimonialRequestSubject() {
  return "Quick favor — would you share how your star map turned out?";
}

/**
 * Outbound testimonial / review request body for past buyers.
 * Primary CTA: public Google + Trustpilot reviews.
 * Secondary: optional reply with a permissioned site testimonial.
 */
export function buildTestimonialRequestEmailBody(firstName = "there", supportEmail = "hello@starmapco.com") {
  const google = TESTIMONIAL_REVIEW_LINKS.google;
  const trustpilot = TESTIMONIAL_REVIEW_LINKS.trustpilot;

  return `Hi ${firstName},

Thank you again for ordering from StarMapCo. We're a small shop, and honest words from real buyers help other couples and gift-givers decide with confidence.

If you're open to it, the most helpful thing is a quick public review:

${google.label}
${google.href}

${trustpilot.label}
${trustpilot.href}

Optional — if you'd rather reply with a short testimonial we can consider for the site (no pressure):

1. One or two sentences about your experience (what you ordered and who it was for)
2. Whether we may publish your first name + quote on starmapco.com (yes/no)
3. Optional: a photo of the print in your space (only if you're comfortable — we'll ask before using any image)

We never invent reviews or ratings — we only publish what buyers approve in writing.

No pressure at all. Either way, thank you for supporting the project.

— David
StarMapCo
${supportEmail}`;
}

function resolveSupportEmail() {
  return (process.env.PROMOTION_EMAIL_FROM || "hello@starmapco.com").replace(/^.*<([^>]+)>.*$/, "$1").trim();
}

function resolveFirstName() {
  const idx = process.argv.indexOf("--first-name");
  if (idx === -1 || idx + 1 >= process.argv.length) return "there";
  return process.argv[idx + 1].trim() || "there";
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("testimonial-request-email.mjs") ||
    process.argv[1].endsWith("testimonial-request-email"));

if (isMain) {
  loadDotenv();
  const firstName = resolveFirstName();
  const supportEmail = resolveSupportEmail();
  const subject = buildTestimonialRequestSubject();
  const body = buildTestimonialRequestEmailBody(firstName, supportEmail);
  console.log(`Subject: ${subject}\n`);
  console.log(body);
}
