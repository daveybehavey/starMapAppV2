"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, type InputVariant } from "@/components/ui/Input";
import { track } from "@/lib/analytics";

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
  const coupon = typeof payload.couponCode === "string" ? payload.couponCode : undefined;
  if (!coupon) return "You're on the list! Watch your inbox for 20% off and future drops.";
  if (payload.isNewSubscriber === false) {
    return `You're already on the list. Use code ${coupon} at checkout anytime.`;
  }
  if (payload.emailDelivered) {
    return `Done! Code ${coupon} was emailed to you. You can also use it right now at checkout.`;
  }
  return `You're in. Use code ${coupon} at checkout, and we'll email details soon.`;
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
  buttonLabel = "Join & save 20%",
  inputVariant = "light",
  hideDisclaimer = false,
  source = "homepage_inline",
  onSuccess,
}: PromotionFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [responseMessage, setResponseMessage] = useState("");

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
    track("promotion_signup_submitted", { source });

    try {
      const res = await fetch("/api/promotions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
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
      const deliveryProvider = typeof json?.deliveryProvider === "string" ? json.deliveryProvider : undefined;
      setStatus("success");
      setResponseMessage(successMessageFor(json ?? { ok: true }));
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
        <Button
          variant="cta"
          size="lg"
          type="submit"
          fullWidth
          isLoading={status === "loading"}
        >
          {buttonLabel}
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

      {!hideDisclaimer && (
        <p className="mt-4 text-xs text-neutral-600">
          No spam—just occasional updates about new looks, sales, and restocks. You can unsubscribe at any time.
        </p>
      )}
    </>
  );
}

export default function PromotionSignup() {
  return (
    <div className="cosmic-panel-enhanced cosmic-panel w-full rounded-[28px] border border-amber-200/60 bg-gradient-to-br from-white/85 to-amber-50/90 p-6 shadow-2xl shadow-black/30 sm:p-10">
      <div className="space-y-3 text-midnight">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-500">Stay in orbit</p>
        <h2 className="max-[374px]:text-[1.65rem] text-3xl font-semibold leading-tight text-midnight sm:text-4xl">
          Get 20% off your next star map
        </h2>
        <p className="text-sm text-neutral-700 sm:text-base">
          Join the insiders list for occasional updates, first dibs on limited releases, and a one-time 20% off code reserved for subscribers.
        </p>
      </div>

      <div className="mt-6">
        <PromotionForm source="homepage_inline" />
      </div>
    </div>
  );
}
