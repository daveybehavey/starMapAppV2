"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Code redemption form. On success the server has already granted the
 * tier and minted a claim token; the recipient continues to the
 * download page, which sets their access from the token — the same
 * entry the post-purchase email link uses.
 */
export default function RedeemClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeemedLabel, setRedeemedLabel] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/gift-certificates/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; claimToken?: string; tierLabel?: string; error?: string }
        | null;
      if (!response.ok || !data?.ok || !data.claimToken) {
        throw new Error(data?.error || "We couldn't redeem that code. Check the code and try again.");
      }
      setRedeemedLabel(data.tierLabel ?? "HD download");
      router.push(`/download?token=${encodeURIComponent(data.claimToken)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't redeem that code. Check the code and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-white/15 bg-white/5 p-6"
      >
        <label className="block text-sm font-semibold text-white">
          Gift certificate code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-2 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-3 font-mono text-base tracking-[0.15em] text-white uppercase placeholder:text-neutral-500"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {redeemedLabel ? (
          <p className="text-sm text-emerald-300">
            {redeemedLabel} added — taking you to your download…
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="text-midnight inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-200 transition hover:-translate-y-[1px] hover:shadow-xl focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-none disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? "Redeeming…" : "Redeem and create my star map"}
        </button>
        <p className="text-xs leading-relaxed text-neutral-400">
          No account needed. The code can be redeemed once, within 12 calendar months of purchase —
          and once it is redeemed, your download does not expire.
        </p>
      </form>
    </div>
  );
}
