import { z } from "zod";

const envSchema = z.object({
  EXPO_PUBLIC_API_BASE_URL: z.url().default("http://10.0.2.2:3000/api"),
  EXPO_PUBLIC_APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: z.string().trim().optional(),
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: z.string().trim().optional(),
  /** RevenueCat entitlement identifier from the dashboard (for strict entitlement checks / paywall-if-needed). */
  EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: z.string().trim().optional(),
  /**
   * When "1", never calls Purchases.configure on startup (Play Store screenshot / Maestro runs on emulator).
   * RevenueCat shows a blocking "Wrong API Key" dialog for test keys on simulated billing — use a dedicated
   * internal build with this flag, or a production key + Play billing, for full UI capture.
   */
  EXPO_PUBLIC_SKIP_REVENUECAT_STARTUP: z.enum(["0", "1"]).default("0"),
  /** Web client ID from Google Cloud Console (OAuth 2.0). Required for Google Sign-In ID tokens on Android. */
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().trim().optional(),
});

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID,
  EXPO_PUBLIC_SKIP_REVENUECAT_STARTUP: process.env.EXPO_PUBLIC_SKIP_REVENUECAT_STARTUP,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

if (!parsed.success) {
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid mobile app env config: ${message}`);
}

export const env = parsed.data;
