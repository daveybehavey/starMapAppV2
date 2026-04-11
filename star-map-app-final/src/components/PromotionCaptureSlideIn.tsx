"use client";

import { useEffect, useRef, useState } from "react";
import { PromotionForm } from "@/components/PromotionForm";
import { track } from "@/lib/analytics";
import { getPromotionOfferName, getPromotionTargetLabel } from "@/lib/promotionOffer";
import { readStoredPromoCode } from "@/lib/promotionCapture";

const DISMISS_KEY = "promotion-slidein-dismissed-until";
const SESSION_SEEN_KEY = "promotion-slidein-seen";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
const SUCCESS_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const SHOW_AFTER_MS = 45000;
const SHOW_SCROLL_RATIO = 0.35;

const BLOCKED_PREFIXES = [
  "/editor",
  "/download",
  "/success",
  "/my-downloads",
  "/unsubscribe",
  "/bulk-event-orders",
  "/funnel",
];

const BLOCKED_EXACT = new Set(["/contact", "/privacy", "/terms", "/returns", "/shipping"]);

function readTimestamp(key: string) {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = Number(raw || "0");
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeTimestamp(key: string, msFromNow: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(Date.now() + msFromNow));
  } catch {
    // ignore storage failures
  }
}

function readSessionFlag(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // ignore storage failures
  }
}

function isBlockedPath(pathname: string) {
  if (BLOCKED_EXACT.has(pathname)) return true;
  return BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getSourceForPath(pathname: string) {
  if (pathname === "/") return "promotion_slidein_home";
  if (pathname.startsWith("/blog")) return "promotion_slidein_blog";
  return "promotion_slidein_marketing";
}

export default function PromotionCaptureSlideIn() {
  const promotionOfferName = getPromotionOfferName();
  const promotionTargetLabel = getPromotionTargetLabel();
  const [pathname, setPathname] = useState<string>("/");
  const [source, setSource] = useState("promotion_slidein_marketing");
  const [eligible, setEligible] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const hasTrackedView = useRef(false);

  useEffect(() => {
    hasTrackedView.current = false;
    setIsVisible(false);
    setEligible(false);

    if (typeof window === "undefined") {
      return;
    }

    const nextPathname = window.location.pathname || "/";
    setPathname(nextPathname);
    setSource(getSourceForPath(nextPathname));

    if (!nextPathname || isBlockedPath(nextPathname)) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hasImmediatePromo = Boolean(params?.get("promo") || params?.get("code"));
    const storedPromo = readStoredPromoCode();
    const dismissedUntil = readTimestamp(DISMISS_KEY);
    const alreadySeenThisSession = readSessionFlag(`${SESSION_SEEN_KEY}:${nextPathname}`);
    setEligible(
      !hasImmediatePromo &&
        !storedPromo &&
        dismissedUntil <= Date.now() &&
        !alreadySeenThisSession,
    );
  }, []);

  useEffect(() => {
    if (!eligible) return;

    const timerId = window.setTimeout(showPanel, SHOW_AFTER_MS);
    let frameId = 0;

    function showPanel() {
      setIsVisible(true);
      writeSessionFlag(`${SESSION_SEEN_KEY}:${pathname}`);
      if (!hasTrackedView.current) {
        hasTrackedView.current = true;
        track("promotion_capture_seen", {
          surface: "slidein",
          source,
          path: pathname,
        });
      }
    }

    function updateFromScroll() {
      frameId = 0;
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const viewport = window.innerHeight || 0;
      const documentHeight = document.documentElement.scrollHeight || 0;
      const maxScrollable = Math.max(documentHeight - viewport, 1);
      if (scrollTop / maxScrollable >= SHOW_SCROLL_RATIO) {
        window.clearTimeout(timerId);
        window.removeEventListener("scroll", onScroll);
        showPanel();
      }
    }

    function onScroll() {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(updateFromScroll);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    updateFromScroll();

    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener("scroll", onScroll);
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [eligible, pathname, source]);

  return (
    <div data-promotion-slidein-root="true">
      {eligible && isVisible ? (
        <div
          data-promotion-slidein="true"
          className="pointer-events-none fixed inset-x-0 bottom-3 z-40 px-3 sm:bottom-5 sm:right-5 sm:left-auto sm:max-w-md sm:px-0"
        >
          <section className="pointer-events-auto overflow-hidden rounded-[26px] border border-amber-200/70 bg-[linear-gradient(160deg,rgba(255,249,235,0.98),rgba(246,239,224,0.96),rgba(255,255,255,0.94))] text-midnight shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur">
            <div className="flex items-start justify-between gap-3 border-b border-amber-200/70 px-4 py-4 sm:px-5">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-600">Lower-cost first order</p>
                <h2 className="text-lg font-semibold leading-tight sm:text-xl">
                  Get 50% off your first HD digital map
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  writeTimestamp(DISMISS_KEY, DISMISS_MS);
                  setIsVisible(false);
                  track("promotion_capture_dismissed", {
                    surface: "slidein",
                    source,
                    path: pathname,
                  });
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/80 bg-white/70 text-lg font-semibold text-neutral-700 transition hover:bg-white"
                aria-label="Dismiss offer"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-sm leading-6 text-neutral-800">
                If you want to start lower-cost, we&apos;ll email a one-time 50% off code for {promotionTargetLabel} and save it in this browser.
              </p>
              <PromotionForm
                source={source}
                inputVariant="light"
                hideDisclaimer
                buttonLabel={`Get ${promotionOfferName}`}
                onSuccess={() => {
                  writeTimestamp(DISMISS_KEY, SUCCESS_DISMISS_MS);
                  setIsVisible(false);
                  track("promotion_capture_converted", {
                    surface: "slidein",
                    source,
                    path: pathname,
                  });
                }}
              />
              <p className="text-[11px] leading-5 text-neutral-700">
                One-time code only. Occasional offers only. Unsubscribe anytime.
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
