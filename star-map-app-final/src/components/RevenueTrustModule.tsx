import Link from "next/link";

type RevenueTrustModuleProps = {
  heading?: string;
  intro?: string;
};

const printSpecs = [
  { size: "8x10 in", useCase: "Desk or shelf gift", frame: "11x14 with mat" },
  { size: "11x14 in", useCase: "Most popular wall size", frame: "16x20 with mat" },
  { size: "16x20 in", useCase: "Statement wall piece", frame: "20x24 or 24x30" },
];

export default function RevenueTrustModule({
  heading = "Confidence before checkout",
  intro = "Everything below is designed to remove guesswork before you buy.",
}: RevenueTrustModuleProps) {
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );

  return (
    <section className="content-visibility-auto mt-6 space-y-4 rounded-3xl border border-black/5 bg-white/90 p-6 shadow-xl shadow-black/10">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-midnight">{heading}</h2>
        <p className="text-sm text-neutral-800 sm:text-base">{intro}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4">
          <p className="text-sm font-semibold text-midnight">Secure payment</p>
          <p className="mt-1 text-xs text-neutral-700">Stripe checkout with card security and explicit terms confirmation.</p>
        </div>
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4">
          <p className="text-sm font-semibold text-midnight">
            {printCheckoutEnabled ? "Digital + physical options" : "Instant digital delivery"}
          </p>
          <p className="mt-1 text-xs text-neutral-700">
            {printCheckoutEnabled
              ? "Unlock HD instantly, or choose unframed/framed physical print checkout from the editor."
              : "HD file unlocks immediately after successful payment verification."}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4">
          <p className="text-sm font-semibold text-midnight">Print-ready quality</p>
          <p className="mt-1 text-xs text-neutral-700">
            Exports up to 6000x6000 PNG so stars and text stay sharp in print, including large poster sizes.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4">
          <p className="text-sm font-semibold text-midnight">Clear policy + support</p>
          <p className="mt-1 text-xs text-neutral-700">Returns policy is public and support is available at support@starmapco.com.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <h3 className="text-sm font-semibold text-midnight sm:text-base">Print planning quick guide</h3>
        <p className="mt-1 text-xs text-neutral-700 sm:text-sm">
          Choose your print size first, then pick a frame size with or without matting.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-black/10 text-neutral-700">
                <th className="px-2 py-1.5 font-semibold">Print size</th>
                <th className="px-2 py-1.5 font-semibold">Best for</th>
                <th className="px-2 py-1.5 font-semibold">Frame suggestion</th>
              </tr>
            </thead>
            <tbody>
              {printSpecs.map((item) => (
                <tr key={item.size} className="border-b border-black/5">
                  <td className="px-2 py-1.5 font-semibold text-midnight">{item.size}</td>
                  <td className="px-2 py-1.5 text-neutral-700">{item.useCase}</td>
                  <td className="px-2 py-1.5 text-neutral-700">{item.frame}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <h3 className="text-sm font-semibold text-midnight sm:text-base">Before you buy checklist</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-neutral-700 sm:text-sm">
          <li>Verify your date and location one last time in preview.</li>
          <li>Check title, subtitle, and dedication spelling.</li>
          <li>Confirm your preferred style and shape before checkout.</li>
          {printCheckoutEnabled && <li>If ordering physical print, choose unframed vs framed before payment.</li>}
          {printCheckoutEnabled && <li>Review shipping cost and delivery estimate shown in checkout before paying.</li>}
          {printCheckoutEnabled && <li>If a print arrives damaged, contact support@starmapco.com for replacement support.</li>}
          <li>Use the print guide if you need framing confidence.</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/how-to-print-star-map" className="text-amber-700 underline hover:text-amber-800">
          Full print and frame guide
        </Link>
        <Link href="/returns" className="text-amber-700 underline hover:text-amber-800">
          Returns and refunds policy
        </Link>
      </div>
    </section>
  );
}
