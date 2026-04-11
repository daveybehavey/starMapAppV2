"use client";

import { useEffect, useMemo, useState } from "react";
import { PromotionForm } from "@/components/PromotionForm";
import { track } from "@/lib/analytics";
import { getPromotionOfferName, getPromotionTargetLabel } from "@/lib/promotionOffer";
import { readStoredPromoCode } from "@/lib/promotionCapture";

type EditorPromotionInviteProps = {
  promoStatus?: string;
  promoCode?: string;
};

const DISMISS_KEY = "promotion-editor-invite-dismissed-until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const SUCCESS_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

function readDismissedUntil() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const parsed = Number(raw || "0");
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function storeDismissedUntil(msFromNow: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + msFromNow));
  } catch {
    // ignore storage errors
  }
}

export default function EditorPromotionInvite({ promoStatus, promoCode }: EditorPromotionInviteProps) {
  const promotionOfferName = getPromotionOfferName();
  const promotionTargetLabel = getPromotionTargetLabel();
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const hasImmediatePromo = useMemo(
    () => promoStatus === "success" || Boolean(promoCode?.trim()),
    [promoCode, promoStatus],
  );

  useEffect(() => {
    if (hasImmediatePromo) {
      setIsReady(true);
      setIsVisible(false);
      return;
    }

    const storedPromo = readStoredPromoCode();
    const dismissedUntil = readDismissedUntil();
    const shouldShow = !storedPromo && dismissedUntil <= Date.now();
    setIsVisible(shouldShow);
    setIsReady(true);

    if (shouldShow) {
      track("promotion_capture_seen", {
        surface: "editor_inline",
        source: "promotion_editor_inline",
      });
    }
  }, [hasImmediatePromo]);

  if (!isReady || !isVisible) return null;

  return (
    <section className="mb-5 w-full max-w-4xl rounded-[28px] border border-amber-200/65 bg-[linear-gradient(135deg,rgba(255,248,230,0.98),rgba(247,241,227,0.95),rgba(255,255,255,0.92))] px-5 py-5 text-midnight shadow-[0_20px_60px_rgba(0,0,0,0.14)] sm:px-6 sm:py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="max-w-2xl space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-600">Lower-cost first order</p>
          <h2 className="text-2xl font-semibold leading-tight text-midnight sm:text-[2rem]">
            Want a lower-cost first checkout?
          </h2>
          <p className="text-sm leading-6 text-neutral-800 sm:text-[15px]">
            Get a one-time 50% off code for {promotionTargetLabel}. We&apos;ll email it to you and save it in this browser so you can keep building without losing the offer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            storeDismissedUntil(DISMISS_MS);
            setIsVisible(false);
            track("promotion_capture_dismissed", {
              surface: "editor_inline",
              source: "promotion_editor_inline",
            });
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/80 bg-white/70 text-lg font-semibold text-neutral-700 transition hover:bg-white"
          aria-label="Dismiss offer"
        >
          ×
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200/70 bg-white/75 p-4 shadow-sm shadow-black/5">
        <PromotionForm
          source="promotion_editor_inline"
          inputVariant="light"
          hideDisclaimer
          buttonLabel={`Get ${promotionOfferName}`}
          onSuccess={() => {
            storeDismissedUntil(SUCCESS_DISMISS_MS);
            setIsVisible(false);
            track("promotion_capture_converted", {
              surface: "editor_inline",
              source: "promotion_editor_inline",
            });
          }}
        />
        <p className="mt-3 text-xs text-neutral-700">
          One-time code only. Best if you use the same email you plan to use at checkout.
        </p>
      </div>
    </section>
  );
}
