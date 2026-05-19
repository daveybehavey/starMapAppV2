import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api/apiClient";

const okSchema = z.object({
  ok: z.boolean(),
});

const magicRequestSchema = okSchema.extend({
  message: z.string().optional(),
  error: z.string().optional(),
});

const claimMobileSchema = okSchema.extend({
  mobileToken: z.string(),
  expiresIn: z.number().int().positive(),
});

const googleMobileSchema = claimMobileSchema.extend({
  email: z.string().email().optional(),
});

const revenueCatLinkSchema = okSchema.extend({
  appUserId: z.string(),
  sessionId: z.string(),
});

const authSessionItemSchema = z.object({
  sessionId: z.string(),
  createdAt: z.number(),
  label: z.string(),
  orderType: z.enum(["digital", "print"]),
  printVariant: z.string().nullable(),
  plan: z.enum(["single", "pack3", "subscription"]).nullable(),
  hasMapId: z.boolean(),
  downloadUrl: z.string().nullable(),
  creditsRemaining: z.number().nullable(),
  subscriptionActive: z.boolean(),
});

const premiumStatusSchema = z.object({
  paid: z.boolean(),
  plan: z.enum(["single", "pack3", "subscription"]).nullable().optional(),
  orderType: z.enum(["digital", "print"]).optional(),
  creditsRemaining: z.number().nullable().optional(),
  subscriptionActive: z.boolean().nullable().optional(),
});

const mobileStateSchema = okSchema.extend({
  sessions: z.array(authSessionItemSchema),
  premium: premiumStatusSchema,
});

export type AuthSessionItem = z.infer<typeof authSessionItemSchema>;
export type PremiumStatus = z.infer<typeof premiumStatusSchema>;

export async function requestMagicLink(email: string) {
  const result = await apiFetch<unknown>("/account/mobile/request", {
    method: "POST",
    body: { email },
  });
  return magicRequestSchema.parse(result);
}

export async function claimMagicToken(token: string) {
  const result = await apiFetch<unknown>("/account/mobile/claim", {
    method: "POST",
    body: { token },
  });
  return claimMobileSchema.parse(result);
}

function googleSignInErrorMessage(code: unknown): string | null {
  if (typeof code !== "string") return null;
  switch (code) {
    case "google_signin_not_configured":
      return "Server is not configured for Google sign-in (set GOOGLE_SIGNIN_ALLOWED_CLIENT_IDS or GOOGLE_SIGNIN_WEB_CLIENT_ID).";
    case "invalid_google_token":
      return "Google could not verify the sign-in. Try again.";
    case "invalid_google_audience":
      return "App client ID does not match the server. Check EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and backend env.";
    case "google_email_not_verified":
      return "Your Google account email is not verified.";
    case "google_token_expired":
      return "Google sign-in expired. Try again.";
    case "invalid_google_email":
      return "Google did not return a valid email.";
    case "no_account_orders":
      return "No StarMapCo purchases are linked to this Google account yet.";
    default:
      return code;
  }
}

export async function signInWithGoogleMobile(idToken: string) {
  try {
    const result = await apiFetch<unknown>("/account/mobile/google", {
      method: "POST",
      body: { idToken },
    });
    return googleMobileSchema.parse(result);
  } catch (error) {
    if (error instanceof ApiError) {
      const payload = error.payload as { error?: unknown } | undefined;
      const message = googleSignInErrorMessage(payload?.error);
      if (message) {
        throw new Error(message);
      }
    }
    throw error;
  }
}

export async function fetchMobileState(mobileToken: string) {
  const result = await apiFetch<unknown>("/account/mobile/state", {
    headers: {
      Authorization: `Bearer ${mobileToken}`,
    },
  });
  return mobileStateSchema.parse(result);
}

export async function logoutMobileSession(mobileToken: string) {
  const result = await apiFetch<unknown>("/account/mobile/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mobileToken}`,
    },
  });
  return okSchema.parse(result);
}

export async function linkRevenueCatUser(input: { mobileToken: string; appUserId: string; sessionId?: string }) {
  const result = await apiFetch<unknown>("/account/mobile/revenuecat/link", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.mobileToken}`,
    },
    body: {
      appUserId: input.appUserId,
      sessionId: input.sessionId,
    },
  });
  return revenueCatLinkSchema.parse(result);
}
