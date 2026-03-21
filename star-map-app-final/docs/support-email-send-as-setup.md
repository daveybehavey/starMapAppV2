# Support Email Outbound Setup (`support@starmapco.com`)

Goal: keep Cloudflare Email Routing for inbound mail, and enable reliable outbound replies as `support@starmapco.com` from Gmail.

## Current baseline

- Inbound: Cloudflare Email Routing forwards `support@starmapco.com` to `davidiheslop@gmail.com`.
- Outbound: not yet configured (Gmail currently sends as personal address unless manually overridden).

## Recommended free/low-cost path

Use Gmail "Send mail as" with an SMTP relay provider (free tier).

Provider examples:

- Brevo SMTP (free tier)
- SMTP2GO (free tier)

## Step-by-step

1. Create SMTP relay account

- Create account with your chosen SMTP provider.
- Create SMTP credentials (username/password).

2. Add sender domain auth (DNS)

- In provider dashboard, add sender domain: `starmapco.com`.
- Add the provider's required DNS records in Cloudflare:
  - SPF TXT update (or include mechanism)
  - DKIM CNAME/TXT records
  - DMARC TXT if missing (recommended minimum: `v=DMARC1; p=none; rua=mailto:support@starmapco.com`)

3. Verify DNS/auth in provider dashboard

- Wait until provider shows SPF + DKIM verified.

4. Configure Gmail "Send mail as"

- In Gmail: Settings -> Accounts and Import -> Send mail as -> Add another email address.
- Name: `StarMapCo Support`
- Email: `support@starmapco.com`
- Choose: send through SMTP server.
- SMTP host/port/TLS: use provider values.
- Username/password: SMTP credentials from step 1.
- Verify with confirmation code sent to `support@starmapco.com` (forwarded into your Gmail inbox).

5. Make `support@starmapco.com` default sender

- In Gmail send-as settings, set default "From" to `support@starmapco.com`.
- Enable "Reply from the same address the message was sent to."

6. Production checks (required)

- Send test to Gmail + Outlook + iCloud.
- Confirm headers show:
  - SPF: pass
  - DKIM: pass
  - DMARC: pass or aligned
- Confirm replies return to `support@starmapco.com` and still route into your Gmail inbox.

## StarMapCo-specific follow-ups

1. Stripe support identity

- In Stripe Dashboard, update public support email to `support@starmapco.com` so receipts no longer show personal Gmail.

2. Site copy consistency sweep

- Ensure `/contact`, footer, transactional copy, and support templates all use `support@starmapco.com`.

3. Optional next hardening

- Add a shared inbox/helpdesk later (e.g. Help Scout, Front, Zoho Desk, Freshdesk) once volume grows.
