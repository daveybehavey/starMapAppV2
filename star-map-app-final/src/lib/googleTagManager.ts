const GTM_SCRIPT_ID = "google-tag-manager-script";

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function getGtmContainerId() {
  return process.env.NEXT_PUBLIC_GTM_ID?.trim() || "";
}

export function ensureGoogleTagManagerLoaded(containerId: string) {
  if (typeof window === "undefined" || !containerId) return;
  if (document.getElementById(GTM_SCRIPT_ID)) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.id = GTM_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.appendChild(script);
}

export function pushDataLayer(payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}
