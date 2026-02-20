"use client";

import Link from "next/link";

type EditorErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function EditorError({ error, reset }: EditorErrorProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-white">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-lg shadow-black/30 backdrop-blur">
        <p className="text-xs font-semibold tracking-[0.2em] text-amber-200 uppercase">Editor unavailable</p>
        <h1 className="mt-2 text-2xl font-semibold">We could not load the editor</h1>
        <p className="mt-3 text-sm text-neutral-200">
          Please retry. If it still fails, go back to the homepage and reopen the editor.
        </p>
        {process.env.NODE_ENV !== "production" ? (
          <p className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-xs text-amber-100">
            {error.message}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full border border-amber-300 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-midnight shadow-md transition hover:-translate-y-[1px] hover:shadow-lg"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/15"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

