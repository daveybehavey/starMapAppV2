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
            downloads and optional physical prints fulfilled through our print partner). We collect minimal personal data.
            There are no traditional accounts or passwords—checkout does not require signup. After purchase, you may use{" "}
            <a className="font-semibold text-midnight underline" href="/my-downloads">
              My Downloads
            </a>{" "}
            with a one-time magic link sent to your checkout email (optional account-lite browser session, about 30 days).
            Editor drafts and premium unlock status may also store locally in your browser.
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
                subscriptions) and physical print orders, Stripe processes payment details (card info, billing address if
                provided). For physical print Checkout, Stripe may also collect a phone number and shipping address needed
                for delivery. We do not store or access full payment card data—Stripe handles it securely under their
                privacy policy. Shipping details and, when provided, phone number are retained only as needed to fulfill
                the print order (see Data Storage and Security).
              </li>
              <li>
                <strong>Voluntary Email Submissions:</strong> If you submit your email for updates or promotions, we store
                your email address and send a welcome email plus occasional follow-ups (e.g., printing tips). You can
                unsubscribe at any time.
              </li>
              <li>
                <strong>Post-Purchase Access (account-lite):</strong> When you pay, we associate your checkout email with
                purchase records so you can open My Downloads via magic link or recovery email. We use hashed identifiers in
                some server records; session cookies for the hub expire automatically. We do not require a password.
              </li>
              <li>
                <strong>Local Browser Storage:</strong> Draft inputs (localStorage) and premium unlock status (cookies for
                functionality, e.g., auto-save previews and download access). Stored on your device; only transmitted when
                needed for checkout or download.
              </li>
              <li>
                <strong>Cookies:</strong> Essential cookies for site function (e.g., premium status, cookie consent
                banner). Analytics cookies via Posthog (anonymous). No marketing/third-party advertising cookies.
              </li>
            </ul>
            <p>
              We collect direct contact details (such as checkout email, and for physical prints a shipping address and
              phone number when provided at Checkout) only as needed to complete your order, fulfill physical prints,
              send purchase/access emails you request, or when you voluntarily submit an email for updates.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">2. How We Use Information</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Provide and improve the service (generate accurate star maps using astronomy libraries).</li>
              <li>Process payments securely via Stripe.</li>
              <li>
                Fulfill physical print orders (pass shipping address and, when available, phone number to our print
                fulfillment partner so carriers can deliver the order).
              </li>
              <li>Analyze anonymous usage (Posthog) to fix bugs, optimize performance, and understand features.</li>
              <li>Comply with legal obligations.</li>
            </ul>
            <p>No data sold or shared for marketing.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-midnight">3. Third-Party Services</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Stripe:</strong> Processes payments and Checkout collection (including shipping address and phone
                for physical print orders). Subject to Stripe's Privacy Policy. We receive transaction confirmation and
                order delivery details needed for fulfillment (no full card details).
              </li>
              <li>
                <strong>Printful:</strong> Print and shipping fulfillment processor for physical orders. When you buy a
                print, we share the shipping recipient details required to produce and deliver the order (name, address,
                email when available, and phone when provided at Checkout). Subject to Printful's privacy terms.
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
              <li>
                Purchase and access records (email-linked sessions, magic-link tokens) are stored in edge KV with TTLs;
                we do not operate a traditional profile database with passwords.
              </li>
              <li>
                Physical print-order records (including shipping details and checkout phone when provided) are stored in
                edge KV with a bounded retention window aligned to fulfillment and short-term support (default 60 days,
                then automatically expire). Phone numbers are used only for Printful/carrier delivery and are not exposed
                in ordinary operator status/retry log output.
              </li>
              <li>LocalStorage/cookies are device-specific.</li>
              <li>
                Retention: Analytics anonymized/retained as needed for improvement (up to 12 months); payment records per
                legal requirements; print-order fulfillment records per the bounded KV TTL above.
              </li>
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
