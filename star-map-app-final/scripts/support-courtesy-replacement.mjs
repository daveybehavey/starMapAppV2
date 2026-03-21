#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Stripe from "stripe";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    i += 1;
  }
  return result;
}

function usage() {
  console.log(`Usage:
  node scripts/support-courtesy-replacement.mjs --session <checkout_session_id>
  node scripts/support-courtesy-replacement.mjs --receipt <receipt_number>
  node scripts/support-courtesy-replacement.mjs --email <customer_email>

Options:
  --session <id>     Source Stripe Checkout Session ID (cs_...)
  --receipt <num>    Source Stripe receipt number (example: 1384-7338)
  --email <email>    Use most recent checkout session for this email
  --plan <plan>      single or pack3 (default: pack3)
  --days <n>         Search window for receipt/email lookups (default: 120)
  --reason <text>    Operator note stored in metadata
  --json             Print JSON only

Examples:
  npm run support:courtesy-replacement -- --receipt 1384-7338
  npm run support:courtesy-replacement -- --session cs_live_...
`);
}

function parsePlan(raw) {
  if (raw === "single" || raw === "pack3") return raw;
  return "pack3";
}

function parseDays(raw) {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 120;
  return Math.min(365, parsed);
}

function planCredits(plan) {
  return plan === "single" ? 1 : 3;
}

function makeCourtesyCode() {
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `COURTESY${ts}${rand}`.slice(0, 20);
}

async function findChargeByReceipt(stripe, receiptNumber, days) {
  const since = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  let startingAfter;

  for (;;) {
    const page = await stripe.charges.list({
      limit: 100,
      created: { gte: since },
      starting_after: startingAfter,
    });
    const match = page.data.find((charge) => charge.receipt_number === receiptNumber);
    if (match) return match;
    if (!page.has_more) return null;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) return null;
  }
}

async function findLatestSessionByEmail(stripe, email, days) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const since = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  let startingAfter;
  let best = null;

  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: since },
      starting_after: startingAfter,
    });

    for (const session of page.data) {
      const sessionEmail = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
      if (!sessionEmail || sessionEmail !== normalized) continue;
      if (!best || session.created > best.created) {
        best = session;
      }
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return best;
}

async function resolveSourceSession(stripe, args, days) {
  if (args.session) {
    const session = await stripe.checkout.sessions.retrieve(args.session.trim());
    return { sourceType: "session", sourceValue: args.session.trim(), session };
  }

  if (args.receipt) {
    const receipt = args.receipt.trim();
    const charge = await findChargeByReceipt(stripe, receipt, days);
    if (!charge) throw new Error(`No charge found for receipt ${receipt} in last ${days} days.`);
    if (!charge.payment_intent || typeof charge.payment_intent !== "string") {
      throw new Error(`Charge ${charge.id} has no payment_intent to map back to checkout session.`);
    }
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: charge.payment_intent,
      limit: 10,
    });
    const session = sessions.data[0] ?? null;
    if (!session) throw new Error(`No checkout session found for receipt ${receipt}.`);
    return { sourceType: "receipt", sourceValue: receipt, session };
  }

  if (args.email) {
    const email = args.email.trim();
    const session = await findLatestSessionByEmail(stripe, email, days);
    if (!session) throw new Error(`No checkout session found for ${email} in last ${days} days.`);
    return { sourceType: "email", sourceValue: email, session };
  }

  throw new Error("Missing source lookup. Use --session, --receipt, or --email.");
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));

  const args = parseArgs(process.argv.slice(2));
  if (!args.session && !args.receipt && !args.email) {
    usage();
    process.exit(1);
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecret) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  const plan = parsePlan(typeof args.plan === "string" ? args.plan.trim().toLowerCase() : undefined);
  const days = parseDays(typeof args.days === "string" ? args.days.trim() : undefined);
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  const outputJson = args.json === "true";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com").replace(/\/+$/, "");
  const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

  const prices = {
    single: process.env.STRIPE_PRICE_ID_SINGLE?.trim() || "",
    pack3: process.env.STRIPE_PRICE_ID_PACK3?.trim() || "",
  };

  const priceId = plan === "single" ? prices.single : prices.pack3;
  if (!priceId) {
    throw new Error(`Missing Stripe price ID for plan=${plan}`);
  }

  const resolved = await resolveSourceSession(stripe, args, days);
  const sourceSession = resolved.session;

  const customerEmail = sourceSession.customer_details?.email || sourceSession.customer_email || "";
  const mapId =
    typeof sourceSession.metadata?.map_id === "string" && sourceSession.metadata.map_id.trim()
      ? sourceSession.metadata.map_id.trim()
      : "";

  const courtesyCode = makeCourtesyCode();
  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: "once",
    max_redemptions: 1,
    name: `Courtesy replacement (${plan})`,
    metadata: {
      source_type: resolved.sourceType,
      source_value: resolved.sourceValue,
      ...(reason ? { reason } : {}),
    },
  });

  const promotionCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: courtesyCode,
    max_redemptions: 1,
    restrictions: { first_time_transaction: false },
  });

  const credits = String(planCredits(plan));
  const courtesySession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    discounts: [{ promotion_code: promotionCode.id }],
    success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/editor?mode=quick&source=support-courtesy-cancel`,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    metadata: {
      plan,
      credits,
      order_type: "digital",
      source: "support_courtesy_replacement",
      source_session_id: sourceSession.id,
      source_lookup_type: resolved.sourceType,
      source_lookup_value: resolved.sourceValue,
      ...(mapId ? { map_id: mapId } : {}),
      ...(reason ? { support_reason: reason } : {}),
    },
    payment_intent_data: {
      metadata: {
        plan,
        credits,
        order_type: "digital",
        source: "support_courtesy_replacement",
        source_session_id: sourceSession.id,
        ...(mapId ? { map_id: mapId } : {}),
      },
    },
  });

  const shortCheckoutUrl = `https://checkout.stripe.com/c/pay/${courtesySession.id}`;
  const summary = {
    source: {
      type: resolved.sourceType,
      value: resolved.sourceValue,
      sessionId: sourceSession.id,
      customerEmail: customerEmail || null,
      mapId: mapId || null,
    },
    courtesy: {
      plan,
      credits: Number.parseInt(credits, 10),
      couponId: coupon.id,
      promotionCodeId: promotionCode.id,
      promotionCode: promotionCode.code,
      checkoutSessionId: courtesySession.id,
      checkoutUrl: courtesySession.url,
      checkoutShortUrl: shortCheckoutUrl,
    },
    customerMessage:
      `Hi there,\n\n` +
      `I have already set up your complimentary replacement access (${credits} HD export credits).\n\n` +
      `Please use this secure link:\n${shortCheckoutUrl}\n\n` +
      `After checkout, you can download your files from the success/download page.\n` +
      `If you still need to create the map first, start here:\n${siteUrl}/editor?mode=quick\n\n` +
      `Best,\nStarMapCo Support`,
  };

  if (outputJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("Courtesy replacement created");
  console.log("===========================");
  console.log(`Source: ${resolved.sourceType}=${resolved.sourceValue}`);
  console.log(`Source session: ${sourceSession.id}`);
  console.log(`Customer: ${customerEmail || "unknown"}`);
  console.log(`Plan/credits: ${plan} / ${credits}`);
  console.log(`Promo code: ${promotionCode.code} (${promotionCode.id})`);
  console.log(`Checkout session: ${courtesySession.id}`);
  console.log(`Checkout URL: ${shortCheckoutUrl}`);
  console.log("");
  console.log("Suggested customer reply:");
  console.log("-------------------------");
  console.log(summary.customerMessage);
}

main().catch((error) => {
  console.error(
    `support-courtesy-replacement failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
