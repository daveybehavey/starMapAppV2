"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GiftCertificateCard from "@/components/GiftCertificateCard";

type CertificateState =
  | { status: "loading" }
  | { status: "pending" }
  | {
      status: "issued" | "redeemed";
      tierLabel: string;
      amountLabel: string;
      code: string | null;
      expiresAt: number;
    }
  | { status: "error" };

/**
 * Certificate confirmation page: polls the certificate API until the
 * webhook has minted the code, then shows the printable certificate.
 * The Stripe session id in the URL is the credential, as on /success.
 */
export default function GiftCardSuccessClient({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<CertificateState>({ status: "loading" });

  useEffect(() => {
    if (!sessionId) {
      setState({ status: "error" });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/gift-certificates/certificate?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => null)) as
          | {
              status?: string;
              tierLabel?: string;
              amountLabel?: string;
              code?: string | null;
              expiresAt?: number;
            }
          | null;
        if (cancelled) return;
        if (data?.status === "issued" || data?.status === "redeemed") {
          setState({
            status: data.status,
            tierLabel: data.tierLabel ?? "HD download",
            amountLabel: data.amountLabel ?? "",
            code: data.code ?? null,
            expiresAt: data.expiresAt ?? 0,
          });
          return;
        }
        setState({ status: "pending" });
      } catch {
        if (!cancelled) setState({ status: "pending" });
      }
      if (!cancelled) timer = setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  if (state.status === "loading" || state.status === "pending") {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white">Preparing your gift certificate…</h1>
        <p className="text-sm text-neutral-300">
          Your payment is confirmed. The certificate and its redeem code appear here as soon as they
          are ready — this usually takes a few seconds. A copy is also on its way to your checkout
          email.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white">We couldn't find that purchase</h1>
        <p className="text-sm text-neutral-300">
          If you just checked out, your certificate email is on its way to the email address you used
          at checkout. For help, contact support with that email address.
        </p>
      </div>
    );
  }

  if (state.status === "redeemed" || !state.code) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white">This certificate has been redeemed</h1>
        <p className="text-sm text-neutral-300">
          The {state.tierLabel} from this purchase is already in the recipient's hands. Thank you for
          gifting with StarMapCo.
        </p>
        <Link
          href="/gift-card"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Buy another gift certificate
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-white">Your gift certificate is ready</h1>
        <p className="text-sm text-neutral-300">
          {state.tierLabel} · {state.amountLabel}. Print it below, save it as a PDF, or forward the
          certificate email — the code is what matters.
        </p>
      </div>
      <GiftCertificateCard
        tierLabel={state.tierLabel}
        code={state.code}
        expiresAt={state.expiresAt}
        redeemUrl="starmapco.com/redeem"
      />
    </div>
  );
}
