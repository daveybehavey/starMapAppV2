"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const HeroEditorIsland = dynamic(() => import("./HeroEditorIsland"), { ssr: false });

const IDLE_TIMEOUT_MS = 2000;

function HeroEditorFallback() {
  return (
    <div className="flex flex-col gap-7 md:flex-row md:gap-6 lg:gap-8">
      <div className="relative flex-1">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/15 bg-[#070b1b] shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
          <Image
            src="/examples/example-wedding-cinematic-heart.webp"
            alt="Sample star map preview"
            fill
            priority
            sizes="(min-width: 1280px) 45vw, (min-width: 1024px) 55vw, (min-width: 768px) 70vw, 100vw"
            className="object-cover"
            quality={70}
          />
        </div>
        <div className="absolute inset-0 flex items-end justify-center pb-10">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 rounded-b-2xl bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="relative z-10 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 px-8 py-4 text-base font-bold text-[#0b1433] opacity-70 shadow-[0_0_30px_rgba(251,191,36,0.5)] max-[374px]:px-6 max-[374px]:py-3.5 max-[374px]:text-sm"
          >
            ✨ Make it yours
          </button>
        </div>
      </div>

      <div className="min-w-0 flex flex-col gap-5 lg:w-[380px] xl:w-[420px]">
        <div className="glass-panel min-w-0 rounded-2xl p-5 sm:p-6">
          <h3 className="mb-5 text-xl font-semibold text-white max-[374px]:text-lg">Customize your moment</h3>
          <div className="mb-4 min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-amber-100/80">When was it?</label>
            <input
              type="date"
              disabled
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white/60 placeholder:text-white/40 opacity-60"
            />
          </div>
          <div className="mb-6 min-w-0">
            <label className="mb-1.5 block text-sm font-medium text-amber-100/80">Where was it?</label>
            <input
              type="text"
              disabled
              placeholder="Search city, landmark, or address"
              className="input-glow ios-form-control min-w-0 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-3 text-base text-white/60 placeholder:text-white/40 opacity-60"
            />
          </div>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="w-full rounded-full bg-amber-400 px-4 py-3 text-sm font-semibold text-[#0b1433] opacity-70 shadow-sm"
          >
            Start customizing
          </button>
          <p className="mt-3 text-xs text-amber-100/60">
            Loading the live editor…
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HeroEditorDeferred() {
  const [ready, setReady] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (ready || typeof window === "undefined") return;

    let settled = false;
    const activate = () => {
      if (settled) return;
      settled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      setReady(true);
    };

    const onUserIntent = () => activate();

    const idleCallback = (window as Window & { requestIdleCallback?: IdleCallback }).requestIdleCallback;
    const cancelIdleCallback = (window as Window & { cancelIdleCallback?: (handle: number) => void })
      .cancelIdleCallback;
    const idleHandle = idleCallback
      ? idleCallback(activate, { timeout: IDLE_TIMEOUT_MS })
      : window.setTimeout(activate, IDLE_TIMEOUT_MS);

    window.addEventListener("pointerdown", onUserIntent, { passive: true });
    window.addEventListener("keydown", onUserIntent);
    window.addEventListener("scroll", onUserIntent, { passive: true });

    cleanupRef.current = () => {
      if (idleCallback && cancelIdleCallback) {
        cancelIdleCallback(idleHandle as number);
      } else {
        window.clearTimeout(idleHandle as number);
      }
      window.removeEventListener("pointerdown", onUserIntent);
      window.removeEventListener("keydown", onUserIntent);
      window.removeEventListener("scroll", onUserIntent);
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [ready]);

  if (!ready) {
    return <HeroEditorFallback />;
  }

  return <HeroEditorIsland />;
}
