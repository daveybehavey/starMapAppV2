import * as Application from "expo-application";
import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { env } from "@/config/env";

export { PAYWALL_RESULT } from "react-native-purchases-ui";

function skipRevenueCatStartup(): boolean {
  return env.EXPO_PUBLIC_SKIP_REVENUECAT_STARTUP === "1";
}

/** Heuristic for Android emulators — avoids adding expo-device (native) just for this check. */
function isLikelyAndroidEmulator(): boolean {
  if (Platform.OS !== "android") return false;
  const c = Platform.constants as
    | { Brand?: string; Model?: string; Fingerprint?: string; Manufacturer?: string }
    | undefined;
  if (!c) return false;
  const hay = `${c.Brand ?? ""} ${c.Model ?? ""} ${c.Manufacturer ?? ""} ${c.Fingerprint ?? ""}`.toLowerCase();
  return (
    hay.includes("generic") ||
    hay.includes("google_sdk") ||
    hay.includes("emulator") ||
    hay.includes("simulator") ||
    hay.includes("ranchu") ||
    hay.includes("gphone") ||
    hay.includes("sdk_gphone")
  );
}

/** Release binary on emulator: skip configure to avoid RevenueCat's blocking test-key dialog (Maestro / screenshots). Debug (`__DEV__`) still configures so IAP can be exercised on emulators. */
function skipRevenueCatOnReleaseEmulator(): boolean {
  if (__DEV__) return false;
  return isLikelyAndroidEmulator();
}

let configured = false;

function getPlatformApiKey(): string | null {
  if (Platform.OS === "android") {
    const key = env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
    return key ? key : null;
  }
  if (Platform.OS === "ios") {
    const key = env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim();
    return key ? key : null;
  }
  return null;
}

export function canUseRevenueCat() {
  return Boolean(getPlatformApiKey());
}

export function getRevenueCatEntitlementId(): string | null {
  const id = env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim();
  return id ? id : null;
}

export async function configureRevenueCat() {
  const apiKey = getPlatformApiKey();
  if (!apiKey) {
    throw new Error(
      Platform.OS === "ios"
        ? "Missing EXPO_PUBLIC_REVENUECAT_IOS_API_KEY."
        : "Missing EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY.",
    );
  }
  if (configured) return;

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);
  await Purchases.configure({
    apiKey,
    appUserID: null,
  });
  configured = true;
}

/**
 * Call once on app mount so Purchases is ready before paywalls / package lists (matches RevenueCat “configure early” guidance).
 */
export async function initRevenueCatOnStartup(): Promise<void> {
  if (skipRevenueCatStartup()) return;
  if (skipRevenueCatOnReleaseEmulator()) return;
  if (!canUseRevenueCat()) return;
  try {
    await configureRevenueCat();
  } catch (err) {
    console.warn("RevenueCat startup init skipped:", err);
  }
}

export async function connectRevenueCatUser(appUserId: string) {
  await configureRevenueCat();
  const result = await Purchases.logIn(appUserId);
  return result.customerInfo;
}

export async function fetchRevenueCatCustomerInfo(): Promise<CustomerInfo> {
  await configureRevenueCat();
  return Purchases.getCustomerInfo();
}

export async function fetchRevenueCatOfferings(): Promise<PurchasesOfferings> {
  await configureRevenueCat();
  return Purchases.getOfferings();
}

export function getAvailablePackages(offerings: PurchasesOfferings): PurchasesPackage[] {
  return offerings.current?.availablePackages ?? [];
}

export async function purchaseRevenueCatPackage(selectedPackage: PurchasesPackage) {
  await configureRevenueCat();
  const result = await Purchases.purchasePackage(selectedPackage);
  return result.customerInfo;
}

export async function restoreRevenueCatPurchases() {
  await configureRevenueCat();
  return Purchases.restorePurchases();
}

export async function resolveRevenueCatAppUserId(sessionId: string): Promise<string> {
  let installId = "unknown-install";
  if (Platform.OS === "android") {
    installId = Application.getAndroidId() || installId;
  } else if (Platform.OS === "ios") {
    installId = (await Application.getIosIdForVendorAsync()) || installId;
  }
  return `starmap:${installId}:${sessionId}`;
}

export function hasActiveRevenueCatEntitlement(
  customerInfo: CustomerInfo,
  entitlementId: string | null = getRevenueCatEntitlementId(),
): boolean {
  if (!entitlementId) return false;
  return typeof customerInfo.entitlements.active[entitlementId] !== "undefined";
}

function paywallResultToUnlockedFromPresent(result: PAYWALL_RESULT): boolean {
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
    case PAYWALL_RESULT.RESTORED:
      return true;
    case PAYWALL_RESULT.NOT_PRESENTED:
    case PAYWALL_RESULT.ERROR:
    case PAYWALL_RESULT.CANCELLED:
    default:
      return false;
  }
}

function paywallResultToUnlockedFromIfNeeded(result: PAYWALL_RESULT): boolean {
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
    case PAYWALL_RESULT.RESTORED:
    case PAYWALL_RESULT.NOT_PRESENTED:
      return true;
    case PAYWALL_RESULT.ERROR:
    case PAYWALL_RESULT.CANCELLED:
    default:
      return false;
  }
}

/** Presents the paywall for the current offering (configure template/V2 paywall in the RevenueCat dashboard first). */
export async function presentRevenueCatPaywall(): Promise<boolean> {
  await configureRevenueCat();
  const paywallResult = await RevenueCatUI.presentPaywall();
  return paywallResultToUnlockedFromPresent(paywallResult);
}

/**
 * Presents a paywall only if the configured entitlement is not active.
 * Requires `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`.
 */
export async function presentRevenueCatPaywallIfNeeded(): Promise<boolean> {
  const entitlementId = getRevenueCatEntitlementId();
  if (!entitlementId) {
    throw new Error("Set EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID to use presentPaywallIfNeeded.");
  }
  await configureRevenueCat();
  const paywallResult = await RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: entitlementId });
  return paywallResultToUnlockedFromIfNeeded(paywallResult);
}

/**
 * Subscription management UI (manage, restore context, etc.). Configure Customer Center in the RevenueCat dashboard.
 * @see https://www.revenuecat.com/docs/tools/customer-center
 */
export async function presentRevenueCatCustomerCenter(): Promise<void> {
  await configureRevenueCat();
  await RevenueCatUI.presentCustomerCenter();
}
