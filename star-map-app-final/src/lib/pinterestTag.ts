const PINTEREST_SCRIPT_ID = "pinterest-tag-script";

declare global {
  interface Window {
    pintr?: PintrFunction;
  }
}

type PintrFunction = {
  (command: "load", tagId: string, options?: Record<string, unknown>): void;
  (command: "page"): void;
  (command: "track", eventName: string, data?: Record<string, unknown>): void;
  queue: unknown[][];
  version?: string;
};

function bootstrapPintrQueue() {
  if (typeof window === "undefined" || window.pintr) return;
  const queue: unknown[][] = [];
  const pintr = function pintr(...args: unknown[]) {
    queue.push(args);
  } as PintrFunction;
  pintr.queue = queue;
  pintr.version = "3.0";
  window.pintr = pintr;
}

export function getPinterestTagId() {
  return process.env.NEXT_PUBLIC_PINTEREST_TAG_ID?.trim() || "";
}

export function ensurePinterestTagLoaded(tagId: string) {
  if (typeof window === "undefined" || !tagId) return;

  bootstrapPintrQueue();

  if (!document.getElementById(PINTEREST_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = PINTEREST_SCRIPT_ID;
    script.async = true;
    script.src = "https://s.pinimg.com/ct/core.js";
    document.head.appendChild(script);
  }

  window.pintr?.("load", tagId);
}

export function trackPinterestPageView() {
  window.pintr?.("page");
}

/** User started checkout (Pinterest add-to-cart style signal). */
export function trackPinterestAddToCart(input: { value: number; currency: string }) {
  window.pintr?.("track", "addtocart", {
    value: input.value,
    currency: input.currency,
    order_quantity: 1,
  });
}

/** Completed purchase. */
export function trackPinterestCheckout(input: {
  value: number;
  currency: string;
  orderId?: string;
}) {
  window.pintr?.("track", "checkout", {
    value: input.value,
    currency: input.currency,
    order_quantity: 1,
    order_id: input.orderId,
  });
}
