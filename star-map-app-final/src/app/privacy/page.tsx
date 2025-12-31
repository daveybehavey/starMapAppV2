"use client";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | StarMapCo",
  description: "Learn how StarMapCo handles data privacy for custom star maps.",
};

export default function PrivacyPage() {
  return (
    <main className="bg-[#050915] px-4 py-12 text-white sm:py-16">
      <div className="mx-auto max-w-4xl rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.92)] p-6 text-midnight shadow-2xl sm:p-8">
        <p className="text-sm uppercase tracking-[0.25em] text-amber-700">Privacy</p>
        <h1 className="mt-2 text-3xl font-bold text-midnight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-neutral-700">Last Updated: December 31, 2025</p>

        <div className="mt-6 space-y-6 text-neutral-900 sm:text-lg">
          <p>
            This Privacy Policy explains how StarMapCo ("we," "us," or "our") collects, uses, discloses, and protects
            information when you visit our website (starmapco.com) or use our custom star map generator service (digital
            product with optional premium unlock via payment). We collect minimal personal data. No user accounts or
            logins exist; premium unlocks store locally in your browser.
          </p>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">1. Information We Collect</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Automatically Collected (via Analytics):</strong> Usage data like IP address, browser type,
                device info, pages viewed, time spent, referral sources, and interactions (e.g., inputs for previews).
                Collected via Posthog (self-hosted/open-source analytics) and Vercel Analytics for site improvement and
                performance monitoring. No personally identifiable information (PII) tied to individuals unless
                anonymized.
              </li>
              <li>
                <strong>Payment Data (via Stripe):</strong> For premium unlocks ($9.99 one-time), Stripe processes
                payment details (card info, billing address if provided). We do not store or access full payment
                data—Stripe handles it securely under their privacy policy.
              </li>
              <li>
                <strong>Local Browser Storage:</strong> Draft inputs, premium unlock status (localStorage/cookies for
                functionality, e.g., auto-save previews). Stored only on your device; not transmitted to us.
              </li>
              <li>
                <strong>Cookies:</strong> Essential cookies for site function (e.g., premium status, cookie consent
                banner). Analytics cookies via Posthog/Vercel (anonymous). No marketing/third-party advertising cookies.
              </li>
            </ul>
            <p>We do not collect names, emails, or other direct PII unless voluntarily provided (none currently requested).</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">2. How We Use Information</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Provide and improve the service (generate accurate star maps using astronomy libraries).</li>
              <li>Process payments securely via Stripe.</li>
              <li>Analyze anonymous usage (Posthog/Vercel) to fix bugs, optimize performance, and understand features.</li>
              <li>Comply with legal obligations.</li>
            </ul>
            <p>No data sold or shared for marketing.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">3. Third-Party Services</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Stripe:</strong> Processes payments. Subject to Stripe's Privacy Policy. We receive only
                transaction confirmation (no full card details).
              </li>
              <li>
                <strong>Posthog:</strong> Analytics tool configured for anonymized data; no PII collected. See Posthog
                privacy.
              </li>
              <li>
                <strong>Vercel/Cloudflare:</strong> Hosting/analytics. Anonymous metrics only.
              </li>
              <li>
                <strong>Astronomy Libraries:</strong> Client-side processing (no data sent).
              </li>
            </ul>
            <p>These providers act as processors; we ensure compliance via agreements.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">4. Data Storage and Security</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Data processed at the edge (Cloudflare Workers) with TLS encryption.</li>
              <li>No central user database; minimal/no PII stored server-side.</li>
              <li>LocalStorage/cookies are device-specific.</li>
              <li>Retention: Analytics anonymized/retained as needed for improvement (up to 12 months); payment records per legal requirements.</li>
            </ul>
            <p>We implement reasonable security (encryption, access controls) but no system is fully secure.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">5. Your Rights (GDPR/CCPA/Others)</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Access, correct, delete data: Contact support@starmapco.com.</li>
              <li>Opt-out analytics: Clear browser cookies/storage or use Do Not Track (honored where possible).</li>
              <li>CCPA: No sale of personal information.</li>
              <li>GDPR lawful basis: legitimate interests (analytics/service), contract (payments). International transfers via adequacy/standard clauses.</li>
              <li>Children under 13: Service not directed; no knowing collection.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">6. Cookies and Tracking</h2>
            <p>Essential for function; analytics optional (consent via banner). Manage via browser settings.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">7. Changes to Policy</h2>
            <p>We may update; changes posted here with a new date. Continued use constitutes acceptance.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">8. Contact Us</h2>
            <p>
              Questions: <a className="underline" href="mailto:support@starmapco.com">support@starmapco.com</a>
            </p>
          </section>

          <p className="text-sm text-neutral-700">
            This policy complies with GDPR (minimal processing, transparency), CCPA (no sales), and third-party requirements
            (Stripe/Posthog disclosures). Not legal advice—consult a professional if needed.
          </p>
        </div>
      </div>
    </main>
  );
}
