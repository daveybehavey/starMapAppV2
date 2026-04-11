#!/usr/bin/env node
import "dotenv/config";
import { createHmac } from "node:crypto";

function parseArgs(argv) {
  const args = {
    confirm: false,
    testTo: "",
    onlyEmail: "",
    excludeDomains: [],
    code: "EMAIL50",
    subject: "50% off your StarMapCo HD map",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--confirm") {
      args.confirm = true;
      continue;
    }
    if (token === "--test-to") {
      args.testTo = (argv[index + 1] || "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--only-email") {
      args.onlyEmail = (argv[index + 1] || "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--exclude-domain") {
      const domain = (argv[index + 1] || "").trim().toLowerCase();
      if (domain) args.excludeDomains.push(domain);
      index += 1;
      continue;
    }
    if (token === "--code") {
      const code = (argv[index + 1] || "").trim().toUpperCase();
      if (code) args.code = code;
      index += 1;
      continue;
    }
    if (token === "--subject") {
      const subject = (argv[index + 1] || "").trim();
      if (subject) args.subject = subject;
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function printHelp() {
  console.log(`Send a one-off promo broadcast to active StarMapCo promo subscribers.

Usage:
  node scripts/send-promotion-broadcast.mjs [options]

Options:
  --confirm                       Actually send email (default is dry-run)
  --test-to <email>               Send only to this test address
  --only-email <email>            Send only to one subscriber email
  --exclude-domain <domain>       Skip subscriber domains (repeatable)
  --code <PROMO_CODE>             Promo code to embed (default: EMAIL50)
  --subject <text>                Email subject line
  --help                          Show this help

Examples:
  node scripts/send-promotion-broadcast.mjs --exclude-domain checkyourform.xyz
  node scripts/send-promotion-broadcast.mjs --test-to support@starmapco.com --confirm
  node scripts/send-promotion-broadcast.mjs --exclude-domain checkyourform.xyz --confirm
`);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseFromEmail(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match ? match[1] : trimmed).trim().toLowerCase();
}

function isValidEmail(input) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function getSigningSecret() {
  const candidates = [
    process.env.PROMOTION_UNSUBSCRIBE_SECRET,
    process.env.REFERRAL_SIGNING_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_SECRET_KEY,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.length >= 16) return trimmed;
  }
  return null;
}

function createUnsubscribeUrl(email, siteUrl) {
  const secret = getSigningSecret();
  if (!secret) return null;
  const normalized = email.trim().toLowerCase();
  const token = createHmac("sha256", secret).update(normalized).digest("base64url");
  const params = new URLSearchParams({ email: normalized, token });
  return `${siteUrl.replace(/\/+$/, "")}/unsubscribe?${params.toString()}`;
}

function buildEditorLink(siteUrl, code) {
  return `${siteUrl.replace(/\/+$/, "")}/editor?mode=quick&code=${encodeURIComponent(code)}&utm_source=email&utm_medium=promo_blast&utm_campaign=apr2026_email_offer&utm_content=subscriber_reactivation_01`;
}

function buildCopy({ email, code, siteUrl, subject }) {
  const editorUrl = buildEditorLink(siteUrl, code);
  const unsubscribeUrl = createUnsubscribeUrl(email, siteUrl);

  const text = [
    "Hi,",
    "",
    "Quick note in case you still wanted to make your map.",
    "",
    "I set up a limited 50% off offer for the HD digital version, and I wanted to share it with early subscribers first.",
    "",
    `You can use it here: ${editorUrl}`,
    "",
    "The code will already be applied when you open the editor.",
    "If you already have a meaningful date in mind, that is the best place to start.",
    "",
    "Need help? Reply to this email.",
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : undefined,
    "",
    "Best,",
    "David",
    "StarMapCo",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <p>Hi,</p>
      <p>Quick note in case you still wanted to make your map.</p>
      <p>I set up a limited <strong>50% off</strong> offer for the HD digital version, and I wanted to share it with early subscribers first.</p>
      <p>
        <a href="${editorUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">
          Open the editor with your code applied
        </a>
      </p>
      <p style="font-size: 13px; color: #3f485b;">The code will already be applied when you open the editor.</p>
      <p style="font-size: 13px; color: #3f485b;">If you already have a meaningful date in mind, that is the best place to start.</p>
      <p style="font-size: 13px; color: #3f485b;">Need help? Reply to this email.</p>
      ${unsubscribeUrl ? `<p style="font-size: 12px; color: #6b7280;">No longer want updates? <a href="${unsubscribeUrl}" style="color: #6b7280;">Unsubscribe</a>.</p>` : ""}
      <p style="margin-top: 18px;">Best,<br />David<br />StarMapCo</p>
    </div>
  `;

  return { subject, text, html };
}

async function fetchSubscribers(siteUrl, adminToken) {
  const response = await fetch(`${siteUrl.replace(/\/+$/, "")}/api/promotions/subscribers?limit=500`, {
    headers: {
      "x-admin-token": adminToken,
    },
  });
  if (!response.ok) {
    throw new Error(`Subscriber fetch failed: ${response.status}`);
  }
  const payload = await response.json();
  if (!payload?.ok || !Array.isArray(payload.subscribers)) {
    throw new Error("Subscriber response was invalid");
  }
  return payload.subscribers;
}

async function sendViaSmtp2go({ apiKey, sender, to, subject, text, html, replyTo }) {
  const payload = {
    sender,
    to: [to],
    subject,
    text_body: text,
    html_body: html,
    custom_headers: replyTo
      ? [{ header: "Reply-To", value: replyTo }]
      : undefined,
  };

  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Smtp2go-Api-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`SMTP2GO request failed: ${response.status}`);
  }
  const failed = Number(body?.data?.failed || 0);
  if (failed > 0) {
    const firstFailure = Array.isArray(body?.data?.failures) ? body.data.failures[0] : null;
    throw new Error(firstFailure?.error || "SMTP2GO send failed");
  }
  return {
    requestId: body?.request_id || null,
    emailId: body?.data?.email_id || null,
  };
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  const adminToken = requireEnv("PRINT_ADMIN_TOKEN");
  const apiKey = requireEnv("SMTP2GO_KEY");
  const sender = parseFromEmail(requireEnv("PROMOTION_EMAIL_FROM"));
  const replyTo = parseFromEmail(process.env.PROMOTION_EMAIL_REPLY_TO || requireEnv("PROMOTION_EMAIL_FROM"));

  if (!isValidEmail(sender)) {
    throw new Error("PROMOTION_EMAIL_FROM must contain a valid sender email");
  }

  let recipients;
  if (args.testTo) {
    if (!isValidEmail(args.testTo)) throw new Error("Invalid --test-to email");
    recipients = [args.testTo];
  } else {
    const subscribers = await fetchSubscribers(siteUrl, adminToken);
    recipients = subscribers
      .map((row) => String(row.email || "").trim().toLowerCase())
      .filter((email) => isValidEmail(email))
      .filter((email) => {
        const domain = email.split("@")[1] || "";
        return !args.excludeDomains.includes(domain);
      });
    if (args.onlyEmail) {
      recipients = recipients.filter((email) => email === args.onlyEmail);
    }
  }

  const uniqueRecipients = Array.from(new Set(recipients));
  if (!uniqueRecipients.length) {
    console.log("No recipients matched the current filters.");
    return;
  }

  console.log(`Recipients matched: ${uniqueRecipients.length}`);
  for (const email of uniqueRecipients) {
    console.log(`- ${maskEmail(email)}`);
  }

  if (!args.confirm) {
    console.log("Dry run only. Re-run with --confirm to send.");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const email of uniqueRecipients) {
    const copy = buildCopy({
      email,
      code: args.code,
      siteUrl,
      subject: args.subject,
    });

    try {
      await sendViaSmtp2go({
        apiKey,
        sender,
        to: email,
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
        replyTo,
      });
      sent += 1;
      console.log(`sent ${maskEmail(email)}`);
    } catch (error) {
      failed += 1;
      console.error(`failed ${maskEmail(email)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done. sent=${sent} failed=${failed}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
