import type { Metadata } from "next";
import PolicyShell from "@/components/policy/PolicyShell";
import { getBusinessProfile } from "@/lib/businessProfile";
import { buildPolicyLastUpdatedLine } from "@/lib/policyMeta";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

export const metadata: Metadata = {
  title: "Privacy Policy | StarMapCo",
  description: "Learn how StarMapCo handles data privacy for custom star maps.",
  alternates: { canonical: `${siteUrl}/privacy` },
};

export default function PrivacyPage() {
  const profile = getBusinessProfile();

  return (
    <PolicyShell
      variant="dark"
      eyebrow="Privacy"
      title="Privacy Policy"
      lastUpdatedLabel={buildPolicyLastUpdatedLine("privacy")}
      maxWidthClass="max-w-4xl"
    >
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
                Collected via Posthog (self-hosted/open-source analytics) for site improvement and performance monitoring.
                No personally identifiable information (PII) tied to individuals unless anonymized.
              </li>
              <li>
                <strong>Anonymous Conversion Counters (Essential):</strong> We record aggregated funnel steps (for
                example landing view, checkout start, payment verification) to monitor checkout reliability and detect
                regressions. These counters are not used for ad targeting and do not store map content.
              </li>
              <li>
                <strong>Payment Data (via Stripe):</strong> For premium unlocks (single downloads, bundles, or
                subscriptions), Stripe processes payment details (card info, billing address if provided). We do not
                store or access full payment data—Stripe handles it securely under their privacy policy.
              </li>
              <li>
                <strong>Voluntary Email Submissions:</strong> If you submit your email for a discount or updates, we store
                your email address and send a welcome email plus occasional follow-ups (e.g., printing tips). You can
                unsubscribe at any time.
              </li>
              <li>
                <strong>Local Browser Storage:</strong> Draft inputs (localStorage) and premium unlock status (cookie for
                functionality, e.g., auto-save previews). Stored only on your device; not transmitted to us.
              </li>
              <li>
                <strong>Cookies:</strong> Essential cookies for site function (e.g., premium status, cookie consent
                banner). Analytics cookies via Posthog (anonymous). No marketing/third-party advertising cookies.
              </li>
            </ul>
            <p>
              We only collect direct PII (like email addresses) when you voluntarily provide it for promotions or updates.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">2. How We Use Information</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Provide and improve the service (generate accurate star maps using astronomy libraries).</li>
              <li>Process payments securely via Stripe.</li>
              <li>Analyze anonymous usage (Posthog) to fix bugs, optimize performance, and understand features.</li>
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
                <strong>Cloudflare:</strong> Hosting and edge infrastructure.
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
              <li>
                Access, correct, delete data: Contact{" "}
                <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
                  {profile.email}
                </a>
                .
              </li>
              <li>Opt-out analytics: Clear browser cookies/storage or use Do Not Track (honored where possible).</li>
              <li>CCPA: No sale of personal information.</li>
              <li>GDPR lawful basis: legitimate interests (analytics/service), contract (payments). International transfers via adequacy/standard clauses.</li>
              <li>Children under 13: Service not directed; no knowing collection.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">6. Cookies and Tracking</h2>
            <p>
              Essential cookies and anonymous funnel counters are used for core service operation. Optional third-party
              analytics (GA4/PostHog product analytics) only run after consent via banner. Manage via browser settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">7. Changes to Policy</h2>
            <p>We may update; changes posted here with a new date. Continued use constitutes acceptance.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">8. Contact Us</h2>
            <p>
              Questions:{" "}
              <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
                {profile.email}
              </a>
            </p>
          </section>

          <p className="text-sm text-neutral-700">
            This policy complies with GDPR (minimal processing, transparency), CCPA (no sales), and third-party requirements
            (Stripe/Posthog disclosures). Not legal advice—consult a professional if needed.
          </p>
      </div>
    </PolicyShell>
  );
}
