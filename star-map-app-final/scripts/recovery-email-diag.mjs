#!/usr/bin/env node
/**
 * recovery-email-diag.mjs
 *
 * Diagnostic for the checkout abandonment recovery email system.
 *
 * Checks:
 *  1. Stripe webhook registration (does checkout.session.expired fire?)
 *  2. Email sender env var availability
 *  3. Recent expired sessions from Stripe (last 48h) with recovery email status
 *
 * Usage:
 *   node scripts/recovery-email-diag.mjs
 *
 * Env required (same as .env.local):
 *   STRIPE_SECRET_KEY
 *   RESEND_API_KEY or SENDGRID_API_KEY
 *   CHECKOUT_RECOVERY_EMAIL_FROM or PROMOTION_EMAIL_FROM or PRINT_ORDER_ALERT_FROM
 */

import "dotenv/config";
import Stripe from "stripe";

const sk = process.env.STRIPE_SECRET_KEY;
if (!sk) {
  console.error("❌ STRIPE_SECRET_KEY not set");
  process.exit(1);
}

const stripe = new Stripe(sk, { apiVersion: "2024-06-20" });

// ── 1. Stripe webhook check ───────────────────────────────────────────────────
console.log("\n=== 1. Stripe webhook events ===");
const hooks = await stripe.webhookEndpoints.list({ limit: 20 });
const prodHook = hooks.data.find((h) => h.url?.includes("starmapco.com"));
if (!prodHook) {
  console.log("❌ No starmapco.com webhook endpoint found");
} else {
  const events = prodHook.enabled_events ?? [];
  const hasExpired = events.includes("checkout.session.expired");
  const hasCompleted = events.includes("checkout.session.completed");
  console.log(`Endpoint: ${prodHook.url}`);
  console.log(`Status:   ${prodHook.status}`);
  console.log(
    `checkout.session.expired:   ${hasExpired ? "✅ registered" : "❌ MISSING — recovery emails will NOT fire"}`
  );
  console.log(`checkout.session.completed: ${hasCompleted ? "✅ registered" : "❌ MISSING"}`);
  console.log(`All events: ${events.join(", ")}`);
}

// ── 2. Email sender config ────────────────────────────────────────────────────
console.log("\n=== 2. Email sender config ===");
const resendKey = process.env.RESEND_API_KEY?.trim();
const sendgridKey = process.env.SENDGRID_API_KEY?.trim();
const fromAddr =
  process.env.CHECKOUT_RECOVERY_EMAIL_FROM?.trim() ||
  process.env.PROMOTION_EMAIL_FROM?.trim() ||
  process.env.PRINT_ORDER_ALERT_FROM?.trim();

console.log(
  `RESEND_API_KEY:          ${resendKey ? "✅ set" : "— not set (required for checkout recovery)"}`
);
console.log(
  `SENDGRID_API_KEY:        ${sendgridKey ? "✅ set (unused for checkout recovery; Resend-only)" : "— not set"}`
);
console.log(
  `From address:            ${fromAddr ? `✅ ${fromAddr}` : "❌ MISSING — set CHECKOUT_RECOVERY_EMAIL_FROM or PROMOTION_EMAIL_FROM"}`
);

if (!resendKey) {
  console.log(
    "❌ RESEND_API_KEY is not configured — checkout recovery emails will not send (Resend-only; no SendGrid fallback)"
  );
} else if (!fromAddr) {
  console.log("❌ No FROM address configured — recovery emails will be silently dropped");
} else {
  console.log("✅ Email delivery is configured");
}

// ── 3. Recent expired sessions ───────────────────────────────────────────────
console.log("\n=== 3. Recent expired sessions (last 48h, print only) ===");
const cutoff = Math.floor(Date.now() / 1000) - 48 * 60 * 60;
let printExpired = 0;
let withEmail = 0;
let withRecoveryUrl = 0;
let printSample = [];

try {
  const sessions = await stripe.checkout.sessions.list({
    status: "expired",
    limit: 100,
    created: { gte: cutoff },
  });

  for (const s of sessions.data) {
    if (s.metadata?.order_type !== "print") continue;
    printExpired++;
    const email = s.customer_details?.email || s.customer_email;
    const recoveryUrl = s.after_expiration?.recovery?.url;
    if (email) withEmail++;
    if (recoveryUrl) withRecoveryUrl++;
    if (printSample.length < 5) {
      printSample.push({
        id: s.id,
        created: new Date(s.created * 1000).toISOString(),
        email: email ? "✅" : "—",
        recoveryUrl: recoveryUrl ? "✅" : "—",
        printVariant: s.metadata?.print_variant ?? "unknown",
        amountTotal: s.amount_total
          ? `${(s.amount_total / 100).toFixed(2)} ${s.currency?.toUpperCase()}`
          : "—",
      });
    }
  }

  console.log(`Print checkout sessions expired in last 48h: ${printExpired}`);
  console.log(`  With customer email captured: ${withEmail}`);
  console.log(`  With Stripe recovery URL:     ${withRecoveryUrl}`);
  console.log(`  Estimated recovery-email-eligible: ${Math.min(withEmail, withRecoveryUrl)}`);

  if (printSample.length > 0) {
    console.log("\nSample (up to 5):");
    for (const s of printSample) {
      console.log(
        `  ${s.id} | ${s.created} | email:${s.email} | recovery:${s.recoveryUrl} | ${s.printVariant} | ${s.amountTotal}`
      );
    }
  }
} catch (err) {
  console.log(`Error querying sessions: ${err.message}`);
}

console.log("\n=== Summary ===");
console.log("If checkout.session.expired is registered AND email is configured,");
console.log("recovery emails will fire automatically on next session expiry (~30min after abandonment).");
console.log("No code changes or deploys required — the webhook handler is already live.");
console.log("");
