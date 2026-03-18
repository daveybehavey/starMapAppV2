"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, type InputVariant } from "@/components/ui/Input";
import { track } from "@/lib/analytics";
import { getPromotionOfferName, getPromotionTargetLabel } from "@/lib/promotionOffer";

type SubmissionStatus = "idle" | "loading" | "success" | "error";

type SubscribeSuccessResponse = {
  ok: true;
  couponCode?: string;
  isNewSubscriber?: boolean;
  emailDelivered?: boolean;
  deliveryProvider?: string;
};

const friendlyErrorMessage = (error?: string) => {
  if (!error) return "Something went wrong. Please try again in a moment.";
  switch (error) {
    case "invalid_email":
      return "Please enter a valid email address.";
    case "invalid_json":
      return "We could not read your submission. Please try again.";
    default:
      return "Something went wrong. Please try again in a few moments.";
  }
};

const successMessageFor = (payload: SubscribeSuccessResponse) => {
  const promotionOfferName = getPromotionOfferName();
  const promotionTargetLabel = getPromotionTargetLabel();
  const coupon = typeof payload.couponCode === "string" ? payload.couponCode : undefined;
  if (!coupon) return `You're on the list. Watch your inbox for your 50% off ${promotionOfferName} and future drops.`;
  if (payload.isNewSubscriber === false) {
    return `You're already on the list. Use code ${coupon} on ${promotionTargetLabel}.`;
  }
  if (payload.emailDelivered) {
    return `Done. Code ${coupon} was emailed to you for ${promotionTargetLabel}.`;
  }
  return `You're in. Use code ${coupon} on ${promotionTargetLabel}, and we'll email the details soon.`;
};

type PromotionSuccessPayload = {
  couponCode?: string;
  isNewSubscriber: boolean;
  emailDelivered: boolean;
  deliveryProvider?: string;
};

export interface PromotionFormProps {
  buttonLabel?: string;
  inputVariant?: InputVariant;
  hideDisclaimer?: boolean;
  source?: string;
  onSuccess?: (payload: PromotionSuccessPayload) => void;
}

export function PromotionForm({
  buttonLabel,
  inputVariant = "light",
  hideDisclaimer = false,
  source = "homepage_inline",
  onSuccess,
}: PromotionFormProps) {
  const promotionOfferName = getPromotionOfferName();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [responseMessage, setResponseMessage] = useState("");
  const [successCoupon, setSuccessCoupon] = useState<string | null>(null);
  const [couponCopied, setCouponCopied] = useState(false);
  const [website, setWebsite] = useState("");

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
    if (status !== "idle" && responseMessage) {
      setStatus("idle");
      setResponseMessage("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "loading") return;

    const trimmed = email.trim();
    if (!trimmed) {
      setStatus("error");
      setResponseMessage("Please enter your email address to join the list.");
      return;
    }

    setStatus("loading");
    setResponseMessage("");
    setSuccessCoupon(null);
    setCouponCopied(false);
    track("promotion_signup_submitted", { source });

    try {
      const res = await fetch("/api/promotions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, website, source }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        const friendly = friendlyErrorMessage(json?.error);
        track("promotion_signup_failed", { source, reason: json?.error ?? "http_error" });
        setStatus("error");
        setResponseMessage(friendly);
        return;
      }

      const json = (await res.json().catch(() => null)) as SubscribeSuccessResponse | null;
      const coupon = typeof json?.couponCode === "string" ? json.couponCode : undefined;
      const isNewSubscriber =
        typeof json?.isNewSubscriber === "boolean" ? json.isNewSubscriber : true;
      const emailDelivered = Boolean(json?.emailDelivered);
      const deliveryProvider =
        typeof json?.deliveryProvider === "string" ? json.deliveryProvider : undefined;
      setStatus("success");
      setResponseMessage(successMessageFor(json ?? { ok: true }));
      setSuccessCoupon(coupon ?? null);
      setEmail("");
      track("promotion_signup_succeeded", {
        source,
        emailDelivered,
        isNewSubscriber,
        deliveryProvider,
      });
      onSuccess?.({ couponCode: coupon, isNewSubscriber, emailDelivered, deliveryProvider });
    } catch (error) {
      console.error("PromotionForm error", error);
      track("promotion_signup_failed", { source, reason: "network_error" });
      setStatus("error");
      setResponseMessage("We hit a snag. Please try again in a minute.");
    }
  };

  const handleCopyCoupon = async () => {
    if (!successCoupon) return;
    try {
      await navigator.clipboard.writeText(successCoupon);
      setCouponCopied(true);
      track("promotion_coupon_copied", { source, couponCode: successCoupon });
    } catch {
      track("promotion_coupon_copy_failed", { source, couponCode: successCoupon });
    }
  };

  const resolvedButtonLabel = buttonLabel ?? `Get ${promotionOfferName}`;

  return (
    <>
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        onSubmit={handleSubmit}
        aria-live="polite"
      >
        <Input
          variant={inputVariant}
          type="email"
          name="email"
          placeholder="you@email.com"
          value={email}
          onChange={handleInputChange}
          autoComplete="email"
          aria-label="Email address"
        />
        <input
          type="text"
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="pointer-events-none absolute left-[-9999px] top-auto h-px w-px opacity-0"
        />
        <Button variant="cta" size="lg" type="submit" fullWidth isLoading={status === "loading"}>
          {resolvedButtonLabel}
        </Button>
      </form>

      {responseMessage && (
        <p
          className={`mt-3 text-sm font-medium ${
            status === "success" ? "text-emerald-600" : "text-rose-500"
          }`}
        >
          {responseMessage}
        </p>
      )}
      {status === "success" && successCoupon && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={handleCopyCoupon}
            className="rounded-full border border-amber-300/70 bg-amber-100/40 px-3 py-1 font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100/70"
          >
            {couponCopied ? "Code copied" : `Copy code ${successCoupon}`}
          </button>
          <a
            href={`/editor?mode=quick&code=${encodeURIComponent(successCoupon)}&source=promo-signup`}
            onClick={() => track("promotion_coupon_editor_clicked", { source, couponCode: successCoupon })}
            className="rounded-full border border-neutral-300 bg-white/70 px-3 py-1 font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
          >
            Use it in editor
          </a>
        </div>
      )}

      {!hideDisclaimer && (
        <p className="mt-4 text-xs text-neutral-700">
          No spam—just occasional updates about new looks, sales, and restocks. You can unsubscribe at any time.
        </p>
      )}
    </>
  );
}
