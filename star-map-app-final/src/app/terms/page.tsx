import type { Metadata } from "next";
import PolicyShell from "@/components/policy/PolicyShell";
import { getBusinessPhoneHref, getBusinessProfile } from "@/lib/businessProfile";
import { buildPolicyLastUpdatedLine } from "@/lib/policyMeta";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";

export const metadata: Metadata = {
  title: "Terms of Service | StarMapCo",
  description: "Terms of service for StarMapCo digital star maps and print add-ons.",
  alternates: { canonical: `${siteUrl}/terms` },
};

export default function TermsPage() {
  const profile = getBusinessProfile();
  const phoneHref = getBusinessPhoneHref();

  return (
    <PolicyShell
      variant="cosmic"
      eyebrow="Terms"
      title="Terms of Service"
      lastUpdatedLabel={buildPolicyLastUpdatedLine("terms")}
    >
      <div className="mt-6 space-y-6 text-neutral-900 sm:text-lg">
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">1. Service Overview</h2>
            <p>
              StarMapCo provides personalized star map previews and paid HD digital downloads, with optional physical
              print add-ons. Digital purchases unlock immediate download access after payment confirmation.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">2. Pricing and Payment</h2>
            <p>
              Prices are shown before checkout and may include local taxes where required. Payments are processed by
              Stripe; we do not store full payment details.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">3. Digital Delivery</h2>
            <p>
              HD downloads become available immediately after payment verification. Please keep a backup of your download
              files for future use.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">4. Print Add-ons</h2>
            <p>
              Physical prints are produced on demand from the design approved in preview. Shipping costs and delivery
              estimates are shown at checkout. Production may be paused for manual review before fulfillment.
            </p>
            <p>
              Physical print orders are fulfilled by third-party production and delivery partners on behalf of
              StarMapCo. Delivery estimates are not guaranteed and may be affected by customs clearance, carrier
              delays, weather, or destination-country conditions.
            </p>
            <p>
              Some destinations may apply import duties, VAT, customs, or brokerage fees. Unless those charges are
              explicitly collected at checkout, they remain the customer&apos;s responsibility.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">5. Refunds and Returns</h2>
            <p>
              Custom digital items are generally non-refundable once unlocked or downloaded, except for technical errors
              or unprocessed payments. Print issues (damage or defects) are handled according to the shipping and returns
              policy listed on the site.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-midnight">6. Contact</h2>
            <p>
              Questions or support requests can be directed to{" "}
              <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
                {profile.email}
              </a>
              .
            </p>
            {profile.phone ? (
              <p>
                Phone:{" "}
                <a className="font-semibold text-midnight underline" href={`tel:${phoneHref}`}>
                  {profile.phone}
                </a>
              </p>
            ) : null}
            {profile.hours ? <p>Support hours: {profile.hours}</p> : null}
            {profile.address ? <p>Business address: {profile.address}</p> : null}
          </section>
      </div>
    </PolicyShell>
  );
}
