import * as SecureStore from "expo-secure-store";

const LAST_EMAIL_KEY = "starmap.lastEmail";
const MOBILE_TOKEN_KEY = "starmap.mobileSessionToken";

export async function saveLastEmail(email: string) {
  await SecureStore.setItemAsync(LAST_EMAIL_KEY, email.trim().toLowerCase());
}

export async function readLastEmail() {
  return SecureStore.getItemAsync(LAST_EMAIL_KEY);
}

export async function saveMobileSessionToken(token: string) {
  await SecureStore.setItemAsync(MOBILE_TOKEN_KEY, token);
}

export async function readMobileSessionToken() {
  return SecureStore.getItemAsync(MOBILE_TOKEN_KEY);
}

export async function clearMobileSessionToken() {
  await SecureStore.deleteItemAsync(MOBILE_TOKEN_KEY);
}
