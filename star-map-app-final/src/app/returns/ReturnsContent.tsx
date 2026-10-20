import PolicyShell from "@/components/policy/PolicyShell";
import { getBusinessProfile } from "@/lib/businessProfile";
import { LOVE_IT_GUARANTEE_LINE } from "@/lib/loveItGuarantee";
import { buildPolicyLastUpdatedLine } from "@/lib/policyMeta";

export default function ReturnsContent() {
  const profile = getBusinessProfile();

  return (
    <PolicyShell
      variant="cosmic"
      title="Returns & Refunds Policy"
      lastUpdatedLabel={buildPolicyLastUpdatedLine("returns")}
    >
      <div className="mt-6 space-y-5 text-neutral-900 sm:text-lg">
        <section>
          <h2 className="text-xl font-semibold text-midnight">Custom-order policy</h2>
          <p className="mt-2">
            StarMapCo sells personalized products. Every star map is generated from the date, time, location, and design
            choices entered by the customer, so digital downloads and physical prints are treated differently from
            off-the-shelf goods.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-midnight">Digital downloads</h2>
          <p className="mt-2">
            Free preview is available before purchase. Once an HD download has been unlocked or downloaded, it is
            generally non-refundable. Exceptions may be made for duplicate charges, failed delivery caused by a
            technical issue on our side, or other billing errors that prevented the order from being fulfilled
            correctly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-midnight">Physical prints</h2>
          <p className="mt-2">
            Physical prints are custom-made after checkout, so change-of-mind returns are not accepted once production
            has started. If a print arrives damaged, defective, or materially different from the approved order, contact{" "}
            <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
              {profile.email}
            </a>{" "}
            within 30 days of delivery with photos and order details. {LOVE_IT_GUARANTEE_LINE}
          </p>
          <p className="mt-2">
            Return shipping costs are not covered for change-of-mind returns. For damage or misprint claims approved
            by StarMapCo, we will arrange the free reprint promised by the Love-It Guarantee above; if a reprint
            cannot resolve the issue, we will coordinate the next step with you.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-midnight">Merch (stickers, magnets, pins, apparel, and mugs)</h2>
          <p className="mt-2">
            Merch items — kiss-cut stickers, die-cut magnets, pin buttons, tees, hoodies, and star map mugs — are
            made to order after checkout, just like prints. If a merch item arrives defective, damaged, or
            different from what you ordered, contact{" "}
            <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
              {profile.email}
            </a>{" "}
            within 30 days of delivery with photos and order details, and we will replace it free.
          </p>
          <p className="mt-2">
            Because every merch item is made for the person who ordered it, change-of-mind returns are not
            accepted on merch. For tees and hoodies we also cannot offer refunds or exchanges for size: the size
            you order is the size that gets made, so please double-check the size you select before ordering.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-midnight">International shipping charges</h2>
          <p className="mt-2">
            Import duties, customs fees, VAT, brokerage charges, or other destination-country fees are not refunded by
            default unless they were charged incorrectly by StarMapCo. If a package is delayed, held, or returned because
            local import charges were not paid or the delivery information was incorrect, contact{" "}
            <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
              {profile.email}
            </a>{" "}
            so we can review the next step with you.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-midnight">How to request help</h2>
          <p className="mt-2">
            Email{" "}
            <a className="font-semibold text-midnight underline" href={`mailto:${profile.email}`}>
              {profile.email}
            </a>{" "}
            with your order email, order number if available, and a short description of the issue. For print problems,
            include clear photos of the packaging and the product.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-midnight">Refund timing</h2>
          <p className="mt-2">
            When a refund is approved, it is sent back to the original payment method. Bank processing times vary, but
            most refunds appear within 5-10 business days.
          </p>
        </section>
      </div>
    </PolicyShell>
  );
}
