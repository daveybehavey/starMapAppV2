const IN_APP_BROWSER_PATTERNS = [
  /FBAN/i,
  /FBAV/i,
  /Instagram/i,
  /Line\//i,
  /TikTok/i,
  /Snapchat/i,
  /MicroMessenger/i,
  /GSA\//i,
  /Gmail\//i,
  /; wv\)/i,
];

function isIosUserAgent(userAgent: string) {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

function isAndroidUserAgent(userAgent: string) {
  return /Android/i.test(userAgent);
}

export function isLikelyInAppBrowser(userAgent: string) {
  const ua = userAgent.trim();
  if (!ua) return false;
  return IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.test(ua));
}

export function getInAppBrowserDownloadHint(userAgent: string) {
  if (!isLikelyInAppBrowser(userAgent)) return null;
  if (isIosUserAgent(userAgent)) {
    return "If this page opened inside an app (Gmail/Instagram/Facebook), use that app menu and choose Open in Safari before downloading.";
  }
  if (isAndroidUserAgent(userAgent)) {
    return "If this page opened inside an app (Gmail/Instagram/Facebook), use that app menu and choose Open in Chrome before downloading.";
  }
  return "If this page opened inside an app browser, switch to your main browser before downloading.";
}
