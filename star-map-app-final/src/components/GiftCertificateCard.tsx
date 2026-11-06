"use client";

import { useState } from "react";

/**
 * The printable gift certificate. The redeem code is rendered here
 * (buyer's confirmation view only); the To/From/note fields live only
 * in the buyer's browser, exactly like OurImprint's certificate — they
 * are never sent to the server or stored.
 */
export default function GiftCertificateCard({
  tierLabel,
  code,
  expiresAt,
  redeemUrl,
}: {
  tierLabel: string;
  code: string;
  expiresAt: number;
  redeemUrl: string;
}) {
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const expiryLabel = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(expiresAt));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-300/40 bg-[#0b1433] p-6 text-center shadow-xl print:border-amber-600 print:bg-white print:text-black">
        <p className="text-xs tracking-[0.3em] text-amber-300 uppercase print:text-amber-700">StarMapCo</p>
        <h2 className="mt-2 text-2xl font-bold text-white print:text-black">Gift Certificate</h2>
        <p className="mt-1 text-sm text-neutral-300 print:text-neutral-700">
          {tierLabel} — create your own personalized star map and download it in HD.
        </p>
        <div className="mx-auto mt-5 max-w-md space-y-2 text-left">
          <label className="block text-xs font-semibold tracking-wide text-neutral-300 uppercase print:text-neutral-600">
            To
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              maxLength={60}
              placeholder="Recipient's name"
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-normal text-white normal-case print:border-neutral-300 print:bg-white print:text-black"
            />
          </label>
          <label className="block text-xs font-semibold tracking-wide text-neutral-300 uppercase print:text-neutral-600">
            From
            <input
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              maxLength={60}
              placeholder="Your name"
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-normal text-white normal-case print:border-neutral-300 print:bg-white print:text-black"
            />
          </label>
          <label className="block text-xs font-semibold tracking-wide text-neutral-300 uppercase print:text-neutral-600">
            Note
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={140}
              placeholder="A short message (optional)"
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-normal text-white normal-case print:border-neutral-300 print:bg-white print:text-black"
            />
          </label>
        </div>
        <p className="mt-6 text-xs tracking-[0.25em] text-neutral-300 uppercase print:text-neutral-600">
          Redeem code
        </p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.15em] text-amber-200 print:text-black">
          {code}
        </p>
        <p className="mt-3 text-sm text-neutral-200 print:text-neutral-700">
          Redeem at {redeemUrl} by {expiryLabel}
        </p>
        <p className="mt-1 text-xs text-neutral-400 print:text-neutral-600">
          One redemption per code, within 12 calendar months of purchase. Once redeemed, the
          download does not expire.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#f1c27d] bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none"
        >
          Print or save as PDF
        </button>
      </div>
    </div>
  );
}
