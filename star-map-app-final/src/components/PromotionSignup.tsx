import { getPromotionOfferName, getPromotionTargetLabel } from "@/lib/promotionOffer";

type PromotionSignupProps = {
  promoStatus?: "success" | "error";
  promoCode?: string;
};

export default function PromotionSignup({ promoStatus, promoCode }: PromotionSignupProps) {
  const promotionOfferName = getPromotionOfferName();
  const promotionTargetLabel = getPromotionTargetLabel();
  const showSuccess = promoStatus === "success";
  const showError = promoStatus === "error";
  const successMessage = promoCode
    ? `You're on the list. Use code ${promoCode} on ${promotionTargetLabel}.`
    : `You're on the list. Watch your inbox for your 50% off ${promotionOfferName}.`;

  return (
    <div className="cosmic-panel-enhanced cosmic-panel w-full rounded-[28px] border border-amber-200/60 bg-gradient-to-br from-white/85 to-amber-50/90 p-6 shadow-2xl shadow-black/30 sm:p-10">
      <div className="space-y-3 text-midnight">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-500">Lower-cost first order</p>
        <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold leading-tight text-midnight sm:text-4xl">
          Want a lighter way to start?
        </h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Framed and unframed prints are the main gift routes. If you want the lowest-cost first purchase, join the
          insiders list for a one-time 50% off code on {promotionTargetLabel}.
        </p>
      </div>

      <div className="mt-6">
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          method="POST"
          action="/api/promotions/subscribe?redirect=editor"
        >
          <label className="sr-only" htmlFor="promo-email">
            Email address
          </label>
          <input
            id="promo-email"
            name="email"
            type="email"
            required
            placeholder="you@email.com"
            autoComplete="email"
            className="w-full rounded-lg border border-amber-200/60 bg-white/80 px-3 py-2 text-sm text-midnight shadow-inner shadow-black/5 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
          />
          <input type="hidden" name="source" value="promotion_signup_static" />
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="pointer-events-none absolute left-[-9999px] top-auto h-px w-px opacity-0"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold text-midnight shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-amber-50"
          >
            {`Get ${promotionOfferName}`}
          </button>
        </form>

        {showSuccess && (
          <p className="mt-3 text-sm font-medium text-emerald-700">{successMessage}</p>
        )}
        {showError && (
          <p className="mt-3 text-sm font-medium text-rose-600">
            That email didn’t look right. Please try again.
          </p>
        )}

        <p className="mt-4 text-xs text-neutral-700">
          No spam—just occasional updates about new looks, sales, and restocks. You can unsubscribe at any time.
          <span className="ml-2">
            <a href="/privacy" className="underline text-amber-700 hover:text-amber-900">
              Privacy Policy
            </a>
          </span>
        </p>
      </div>
    </div>
  );
}
