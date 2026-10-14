type CheckoutLegalNoticeProps = {
  className?: string;
  tone?: "light" | "dark";
};

/**
 * Non-blocking purchase agreement copy shown near pay CTAs (replaces Stripe ToS checkbox).
 */
export function CheckoutLegalNotice({ className = "", tone = "light" }: CheckoutLegalNoticeProps) {
  const linkClass =
    tone === "dark"
      ? "underline underline-offset-2 text-amber-100 hover:text-white"
      : "underline underline-offset-2 text-neutral-800 hover:text-neutral-950";
  const textClass =
    tone === "dark" ? "text-[10px] leading-relaxed text-amber-100/75" : "text-[10px] leading-relaxed text-neutral-600";

  return (
    <p className={`${textClass} ${className}`.trim()} data-testid="checkout-legal-notice">
      By completing your purchase you agree to our{" "}
      <a href="/terms" target="_blank" rel="noopener noreferrer" className={linkClass}>
        Terms of Service
      </a>{" "}
      and{" "}
      <a href="/privacy" target="_blank" rel="noopener noreferrer" className={linkClass}>
        Privacy Policy
      </a>
      .
    </p>
  );
}
