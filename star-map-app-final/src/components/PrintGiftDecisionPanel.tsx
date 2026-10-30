"use client";

import type { PrintVariant } from "@/lib/printCatalog";
import { SECOND_COPY_OFFER_COPY } from "@/components/SecondCopyOfferNote";
import {
  getPrintDeliveryEtaLine,
  getPrintProductionEtaLine,
  getPrintSizingLine,
  PRINT_GIFT_TIER_STEPS,
} from "@/lib/printGiftDecisionCopy";

type Props = {
  printShippingCountry?: string | null;
  sizingVariant?: PrintVariant;
  compact?: boolean;
  showGiftLadder?: boolean;
  tone?: "dark" | "light";
  /**
   * Lever A presentation permission (S55-7), tied to the ACTUAL
   * selected variant. Default off, and no caller passes it yet: this
   * panel's callers are client components (editor, paywall, mobile),
   * which cannot resolve the server second-copy flag — the permission
   * must arrive as a server-resolved prop through those mounts before
   * any caller may enable it. A caller must also only pass it when
   * `sizingVariant` is the shopper's selected variant and that variant
   * is second-copy eligible.
   */
  showSecondCopyOffer?: boolean;
};

export function PrintGiftDecisionPanel({
  printShippingCountry,
  sizingVariant = "poster_framed",
  compact = false,
  showGiftLadder = true,
  tone = "dark",
  showSecondCopyOffer = false,
}: Props) {
  const deliveryLine = getPrintDeliveryEtaLine(printShippingCountry, sizingVariant);
  const isDark = tone === "dark";
  const boxClass = isDark
    ? "rounded-lg border border-amber-200/25 bg-black/15 px-3 py-2 text-[11px] text-amber-50/95"
    : "rounded-lg border border-amber-200/70 bg-white/80 px-3 py-2 text-[11px] text-neutral-700";

  return (
    <div className={compact ? "mt-2 space-y-2" : "mt-3 space-y-2"}>
      <div className={boxClass}>
        <p className="font-semibold text-inherit">Sizing</p>
        <p className="mt-1">{getPrintSizingLine(sizingVariant)}</p>
        <p className="mt-1">{getPrintProductionEtaLine()}</p>
        {deliveryLine ? <p className="mt-1">{deliveryLine}</p> : null}
      </div>
      {showSecondCopyOffer ? (
        <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-100/85" : "text-neutral-600"}`}>
          {SECOND_COPY_OFFER_COPY}
        </p>
      ) : null}
      {showGiftLadder ? (
        <div className={boxClass}>
          <p className="font-semibold text-inherit">Gift format ladder</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            {PRINT_GIFT_TIER_STEPS.map((step) => (
              <li
                key={step.id}
                data-digital-offer={step.id === "digital" || step.id === "framed_hd" ? true : undefined}
              >
                <span className="font-semibold">{step.label}</span> — {step.detail}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
