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
  node scripts/customer-order-lookup.mjs --session <checkout_session_id>
  node scripts/customer-order-lookup.mjs --receipt <receipt_number> [--days 120]
  node scripts/customer-order-lookup.mjs --email <customer_email> [--days 120]
  node scripts/customer-order-lookup.mjs --receipt <receipt_number> --name <customer_name>

Options:
  --session <id>     Stripe Checkout Session ID (cs_...)
  --receipt <num>    Stripe receipt number (example: 1384-7338)
  --email <email>    Customer email to find recent sessions
  --name <name>      Optional customer name for reply template
  --days <n>         Search window for receipt/email lookup (default: 120)
  --json             Print JSON only

Examples:
  npm run support:order-lookup -- --receipt 1384-7338
  npm run support:order-lookup -- --receipt 1384-7338 --name Christie
  npm run support:order-lookup -- --session cs_live_...
`);
}

function shellQuote(value) {
  if (typeof value !== "string") return "''";
  const escaped = value.replace(/'/g, `'\\''`);
  return `'${escaped}'`;
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

function formatAmount(cents, currency) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  const normalizedCurrency = (currency || "usd").toUpperCase();
  return `${(cents / 100).toFixed(2)} ${normalizedCurrency}`;
}

function normalizeCustomerName(rawName) {
  if (!rawName || typeof rawName !== "string") return null;
  const cleaned = rawName
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, "");
  if (!cleaned) return null;
  const firstToken = cleaned.split(" ")[0];
  if (!firstToken) return null;
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1);
}

function isSessionPaid(session) {
  const paymentStatus = String(session?.payment_status || "");
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

async function findChargeByReceipt(stripe, receiptNumber, days) {
  const since = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  let startingAfter = undefined;

  for (;;) {
    const page = await stripe.charges.list({
      limit: 100,
      created: { gte: since },
      starting_after: startingAfter,
    });

    const match = page.data.find((charge) => charge.receipt_number === receiptNumber);
    if (match) {
      return stripe.charges.retrieve(match.id, { expand: ["refunds"] });
    }
    if (!page.has_more) return null;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) return null;
  }
}

async function findLatestSessionByEmail(stripe, email, days) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const since = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  let startingAfter = undefined;
  let latestAny = null;
  let latestPaid = null;

  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: since },
      starting_after: startingAfter,
    });

    for (const session of page.data) {
      const sessionEmail = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
      if (!sessionEmail || sessionEmail !== normalized) continue;
      if (!latestAny || session.created > latestAny.created) {
        latestAny = session;
      }
      if (isSessionPaid(session) && (!latestPaid || session.created > latestPaid.created)) {
        latestPaid = session;
      }
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return latestPaid ?? latestAny;
}

async function loadChargeForSession(stripe, session) {
  if (!session || typeof session.payment_intent !== "string") return null;
  const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
    expand: ["latest_charge"],
  });
  if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge === "object") {
    return stripe.charges.retrieve(paymentIntent.latest_charge.id, { expand: ["refunds"] });
  }
  if (typeof paymentIntent.latest_charge === "string") {
    return stripe.charges.retrieve(paymentIntent.latest_charge, { expand: ["refunds"] });
  }
  return null;
}

function buildSummary(session, charge, input, siteUrl) {
  const sessionId = session?.id ?? null;
  const mapId = session?.metadata?.map_id ?? null;
  const plan = session?.metadata?.plan ?? null;
  const credits = session?.metadata?.credits ?? null;
  const orderType = session?.metadata?.order_type ?? "digital";
  const refunded = Boolean(charge?.refunded);
  const amountRefunded = charge?.amount_refunded ?? 0;
  const paymentStatus = session?.payment_status ?? null;
  const paid = paymentStatus === "paid" || paymentStatus === "no_payment_required";
  const recommendation = refunded
    ? "REFUNDED_CREATE_COURTESY_CHECKOUT"
    : paid
      ? "SEND_SUCCESS_LINK"
      : "PAYMENT_NOT_COMPLETE";
  const customerName = normalizeCustomerName(input.customerName);
  const greeting = customerName ? `Hi ${customerName},` : "Hi there,";
  const fallbackCredits =
    plan === "pack3" ? 3 : plan === "single" ? 1 : null;
  const numericCredits = Number.parseInt(String(credits ?? ""), 10);
  const totalCredits = Number.isFinite(numericCredits) && numericCredits > 0 ? numericCredits : fallbackCredits;
  const deliverableLine =
    totalCredits && totalCredits > 1
      ? `Your purchase includes ${totalCredits} HD export credits, so you can generate and download multiple maps.`
      : "Your purchase includes HD export access for your map.";
  const creationHint = mapId
    ? ""
    : "\nIf you haven't created your map yet, open the editor first, generate a preview, then return to this link.";
  const activeAccessLink = sessionId
    ? `${siteUrl}/success?session_id=${encodeURIComponent(sessionId)}`
    : mapId
      ? `${siteUrl}/download?map_id=${encodeURIComponent(mapId)}`
      : null;
  const canCreateCourtesy = Boolean(sessionId);
  const courtesyCommandBase = canCreateCourtesy
    ? `npm run support:courtesy-replacement -- --session ${sessionId} --reason ${shellQuote("lost_files_recovery")}`
    : null;
  const lookupBySessionCommand = sessionId
    ? `npm run support:order-lookup -- --session ${sessionId}`
    : null;

  return {
    input,
    customer: {
      emailMasked: maskEmail(session?.customer_details?.email || session?.customer_email || charge?.billing_details?.email || null),
    },
    order: {
      sessionId,
      receiptNumber: charge?.receipt_number ?? null,
      createdAt: session?.created ? new Date(session.created * 1000).toISOString() : null,
      amount: formatAmount(session?.amount_total ?? charge?.amount ?? null, session?.currency ?? charge?.currency ?? "usd"),
      paymentStatus,
      checkoutStatus: session?.status ?? null,
      paid,
      refunded,
      amountRefunded: formatAmount(amountRefunded, charge?.currency ?? session?.currency ?? "usd"),
      refundId: charge?.refunds?.data?.[0]?.id ?? null,
      refundAt:
        charge?.refunds?.data?.[0]?.created != null
          ? new Date(charge.refunds.data[0].created * 1000).toISOString()
          : null,
      plan,
      credits,
      orderType,
      mapId,
    },
    links: {
      success: sessionId ? `${siteUrl}/success?session_id=${encodeURIComponent(sessionId)}` : null,
      download: mapId ? `${siteUrl}/download?map_id=${encodeURIComponent(mapId)}` : null,
      myDownloads: `${siteUrl}/my-downloads`,
    },
    recommendation,
    triage: {
      nextAction:
        recommendation === "REFUNDED_CREATE_COURTESY_CHECKOUT"
          ? "Run courtesy replacement dry-run first, then confirm after review."
          : recommendation === "SEND_SUCCESS_LINK"
            ? "Send success access link and my-downloads fallback."
            : "Ask customer to complete/redo checkout before restoring files.",
      canCreateCourtesy,
      commands: {
        lookupBySession: lookupBySessionCommand,
        courtesyReplacementDryRun:
          recommendation === "REFUNDED_CREATE_COURTESY_CHECKOUT" ? courtesyCommandBase : null,
        courtesyReplacementConfirm:
          recommendation === "REFUNDED_CREATE_COURTESY_CHECKOUT" && courtesyCommandBase
            ? `${courtesyCommandBase} --confirm`
            : null,
      },
    },
    templates: {
      activeAccess: activeAccessLink && !refunded
          ? `${greeting}\n\nThanks for your message — I restored your access.\n\nPlease open this secure link:\n${activeAccessLink}\n\n${deliverableLine}${creationHint}\nThen tap “Download HD file” from your download page.\nIf that link expires, open ${siteUrl}/my-downloads and request a new sign-in link.\nOn iPhone, downloads are in Files app → Browse → Downloads (not Photos), and the file name starts with starmap-.\n\nBest,\nStarMapCo Support`
          : null,
      refunded:
        refunded
          ? `${greeting}\n\nThanks for reaching out. I checked your order and it has already been refunded, which removes download access.\n\nI can issue a one-time courtesy replacement checkout to restore your files immediately.\n\nBest,\nStarMapCo Support`
          : null,
      paymentPending:
        !refunded && !paid
          ? `${greeting}\n\nThanks for reaching out. I checked the order and payment is not marked complete yet, so files are not unlocked.\n\nPlease complete checkout again using the latest link from the editor. Once paid, files appear on the success/download page immediately.\n\nBest,\nStarMapCo Support`
          : null,
    },
  };
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));

  const args = parseArgs(process.argv.slice(2));
  if (args.h === "true" || args.help === "true") {
    usage();
    process.exit(0);
  }
  const sessionId = typeof args.session === "string" ? args.session.trim() : "";
  const receiptNumber = typeof args.receipt === "string" ? args.receipt.trim() : "";
  const email = typeof args.email === "string" ? args.email.trim() : "";
  const customerName = typeof args.name === "string" ? args.name.trim() : "";
  const daysRaw = typeof args.days === "string" ? Number.parseInt(args.days, 10) : 120;
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(365, daysRaw) : 120;
  const outputJson = args.json === "true";

  if (!sessionId && !receiptNumber && !email) {
    usage();
    process.exit(1);
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecret) {
    console.error("Missing STRIPE_SECRET_KEY in environment.");
    process.exit(1);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com";
  const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

  let session = null;
  let charge = null;
  let input = {};

  if (sessionId) {
    session = await stripe.checkout.sessions.retrieve(sessionId);
    charge = await loadChargeForSession(stripe, session);
    input = { type: "session", value: sessionId, customerName };
  } else if (receiptNumber) {
    charge = await findChargeByReceipt(stripe, receiptNumber, days);
    if (!charge) {
      throw new Error(`No charge found for receipt ${receiptNumber} in last ${days} days.`);
    }
    if (typeof charge.payment_intent === "string") {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: charge.payment_intent,
        limit: 10,
      });
      session = sessions.data[0] ?? null;
    }
    input = { type: "receipt", value: receiptNumber, days, customerName };
  } else {
    session = await findLatestSessionByEmail(stripe, email, days);
    if (!session) {
      throw new Error(`No checkout session found for ${email} in last ${days} days.`);
    }
    charge = await loadChargeForSession(stripe, session);
    input = { type: "email", value: email, days, customerName };
  }

  if (!session && !charge) {
    throw new Error("Lookup did not find a matching order.");
  }

  const summary = buildSummary(session, charge, input, siteUrl);

  if (outputJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("Customer order lookup");
  console.log("=====================");
  console.log(`Input: ${summary.input.type}=${summary.input.value}`);
  console.log(`Email: ${summary.customer.emailMasked ?? "unknown"}`);
  console.log(`Session: ${summary.order.sessionId ?? "not found"}`);
  console.log(`Receipt: ${summary.order.receiptNumber ?? "not found"}`);
  console.log(`Amount: ${summary.order.amount ?? "unknown"}`);
  console.log(`Payment status: ${summary.order.paymentStatus ?? "unknown"}`);
  console.log(`Checkout status: ${summary.order.checkoutStatus ?? "unknown"}`);
  console.log(`Paid: ${summary.order.paid ? "yes" : "no"}`);
  console.log(`Refunded: ${summary.order.refunded ? "yes" : "no"}`);
  if (summary.order.refunded) {
    console.log(`Refund amount: ${summary.order.amountRefunded ?? "unknown"}`);
    console.log(`Refund at: ${summary.order.refundAt ?? "unknown"}`);
  }
  console.log(`Plan: ${summary.order.plan ?? "unknown"}  Credits: ${summary.order.credits ?? "unknown"}`);
  console.log(`Map ID: ${summary.order.mapId ?? "unknown"}`);
  console.log(`Success link: ${summary.links.success ?? "n/a"}`);
  console.log(`My Downloads: ${summary.links.myDownloads}`);
  console.log(`Recommendation: ${summary.recommendation}`);
  console.log(`Next action: ${summary.triage.nextAction}`);
  if (summary.triage.commands.lookupBySession) {
    console.log(`Verify command: ${summary.triage.commands.lookupBySession}`);
  }
  if (summary.triage.commands.courtesyReplacementDryRun) {
    console.log(`Courtesy dry-run: ${summary.triage.commands.courtesyReplacementDryRun}`);
  }
  if (summary.triage.commands.courtesyReplacementConfirm) {
    console.log(`Courtesy confirm: ${summary.triage.commands.courtesyReplacementConfirm}`);
  }

  if (summary.templates.activeAccess) {
    console.log("\nSuggested customer reply (active access):");
    console.log("----------------------------------------");
    console.log(summary.templates.activeAccess);
  }
  if (summary.templates.refunded) {
    console.log("\nSuggested customer reply (refunded):");
    console.log("------------------------------------");
    console.log(summary.templates.refunded);
  }
  if (summary.templates.paymentPending) {
    console.log("\nSuggested customer reply (payment not complete):");
    console.log("------------------------------------------------");
    console.log(summary.templates.paymentPending);
  }
}

main().catch((error) => {
  console.error(`customer-order-lookup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
