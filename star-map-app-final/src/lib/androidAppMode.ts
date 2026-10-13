/**
 * Android app mode (Google Play TWA).
 *
 * The Play Store app launches https://starmapco.com/?source=android-app. Google Play's
 * payments policy does not allow selling, or linking to the purchase of, digital goods
 * (HD downloads, packs, unlimited subscription, digital add-ons) outside Play Billing.
 * Physical goods (framed/unframed prints, cards, merch) are allowed.
 *
 * When the flag is seen we set a *session* cookie (no Max-Age, so it ends with the app
 * session) plus sessionStorage, mark <html data-app-mode="android">, and:
 *   - the UI hides digital-only offers (CSS in globals.css + PaywallModal),
 *   - /api/checkout rejects digital orders and strips digital add-ons (server-enforced).
 */
export const ANDROID_APP_SOURCE = "android-app";
export const ANDROID_APP_COOKIE = "smc_app_mode";
export const ANDROID_APP_COOKIE_VALUE = "android";
export const ANDROID_APP_STORAGE_KEY = "smc_app_mode";

/** Inline, render-blocking bootstrap so the attribute is set before first paint. */
export const ANDROID_APP_MODE_BOOTSTRAP = `(function(){try{var on=false;var p=new URLSearchParams(location.search);if(p.get("source")==="${ANDROID_APP_SOURCE}"){on=true;}else if(sessionStorage.getItem("${ANDROID_APP_STORAGE_KEY}")==="${ANDROID_APP_COOKIE_VALUE}"){on=true;}else if(document.cookie.indexOf("${ANDROID_APP_COOKIE}=${ANDROID_APP_COOKIE_VALUE}")!==-1){on=true;}else if(document.referrer.indexOf("android-app://app.starmapco.com")===0){on=true;}if(on){sessionStorage.setItem("${ANDROID_APP_STORAGE_KEY}","${ANDROID_APP_COOKIE_VALUE}");document.cookie="${ANDROID_APP_COOKIE}=${ANDROID_APP_COOKIE_VALUE}; Path=/; Secure; SameSite=Lax";document.documentElement.setAttribute("data-app-mode","android");}}catch(e){}})();`;

/** Client-side check (safe during SSR: returns false). */
export function isAndroidAppModeClient(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-app-mode") === "android";
}

type CookieReader = { get(name: string): { value: string } | undefined };

/** Server-side check for route handlers. */
export function isAndroidAppModeRequest(req: { cookies: CookieReader; nextUrl?: URL }): boolean {
  if (req.cookies.get(ANDROID_APP_COOKIE)?.value === ANDROID_APP_COOKIE_VALUE) return true;
  return req.nextUrl?.searchParams.get("source") === ANDROID_APP_SOURCE;
}

/** Pure policy helper: may this checkout be created in app mode? */
export function androidAppCheckoutDecision(input: {
  orderType: "digital" | "print";
  hasMerch: boolean;
  includeDigitalAddOn: boolean;
}): { allowed: boolean; includeDigitalAddOn: boolean } {
  const physical = input.orderType === "print" || input.hasMerch;
  return { allowed: physical, includeDigitalAddOn: false };
}
