"use client";

import { useEffect } from "react";

/**
 * Registers the minimal service worker in public/sw.js (PWA/TWA
 * readiness + immutable-asset caching). Production only: the worker is
 * network-first for pages and never intercepts /api, checkout, or
 * download routes. Registration is best-effort progressive enhancement —
 * the site works identically without it.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // ignore registration failures; no user-facing impact
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
