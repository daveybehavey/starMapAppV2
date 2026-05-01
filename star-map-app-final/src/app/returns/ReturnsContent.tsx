"use client";

export default function ReturnsContent() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="cosmic-panel rounded-3xl border border-amber-200/70 bg-[rgba(247,241,227,0.9)] p-6 shadow-2xl sm:p-8">
        <h1 className="text-3xl font-semibold text-midnight sm:text-4xl">Returns & Refunds Policy</h1>

        <div className="mt-6 space-y-5 text-neutral-900 sm:text-lg">
          <section>
            <h2 className="text-xl font-semibold text-midnight">Custom-order policy</h2>
            <p className="mt-2">
              StarMapCo sells personalized products. Every star map is generated from the date, time, location, and
              design choices entered by the customer, so digital downloads and physical prints are treated differently
              from off-the-shelf goods.
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
              Physical prints are custom-made after checkout, so change-of-mind returns are not accepted once
              production has started. If a print arrives damaged, defective, or materially different from the approved
              order, contact support@starmapco.com within 7 days of delivery with photos and order details. Approved
              cases may be resolved with a replacement or refund.
            </p>
            <p className="mt-2">
              Return shipping costs are not covered for change-of-mind returns. For damage/defect claims approved by
              StarMapCo, we will coordinate the next step (replacement or refund) based on the case details.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-midnight">International shipping charges</h2>
            <p className="mt-2">
              Import duties, customs fees, VAT, brokerage charges, or other destination-country fees are not refunded
              by default unless they were charged incorrectly by StarMapCo. If a package is delayed, held, or returned
              because local import charges were not paid or the delivery information was incorrect, contact
              support@starmapco.com so we can review the next step with you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-midnight">How to request help</h2>
            <p className="mt-2">
              Email support@starmapco.com with your order email, order number if available, and a short description of
              the issue. For print problems, include clear photos of the packaging and the product.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-midnight">Refund timing</h2>
            <p className="mt-2">
              When a refund is approved, it is sent back to the original payment method. Bank processing times vary,
              but most refunds appear within 5-10 business days.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
