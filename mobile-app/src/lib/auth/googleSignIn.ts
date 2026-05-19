import { Platform } from "react-native";
import { GoogleSignin, isCancelledResponse } from "@react-native-google-signin/google-signin";
import { env } from "@/config/env";

let configured = false;

export function canUseGoogleSignIn() {
  return Platform.OS === "android" && Boolean(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim());
}

export function configureGoogleSignIn() {
  if (!canUseGoogleSignIn() || configured) return;
  GoogleSignin.configure({
    webClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!.trim(),
    offlineAccess: false,
  });
  configured = true;
}

export async function getGoogleIdTokenForBackend(): Promise<string> {
  configureGoogleSignIn();
  if (!canUseGoogleSignIn()) {
    throw new Error("Google Sign-In is not configured for this build.");
  }
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const signInResult = await GoogleSignin.signIn();
  if (isCancelledResponse(signInResult)) {
    throw new Error("Sign-in was cancelled.");
  }
  const tokens = await GoogleSignin.getTokens();
  if (!tokens.idToken) {
    throw new Error("Google did not return an ID token. Check Web client ID and SHA-1 in Google Cloud Console.");
  }
  return tokens.idToken;
}

export async function signOutGoogle() {
  if (!canUseGoogleSignIn()) return;
  try {
    configureGoogleSignIn();
    await GoogleSignin.signOut();
  } catch {
    // ignore — user may not have used Google this session
  }
}
