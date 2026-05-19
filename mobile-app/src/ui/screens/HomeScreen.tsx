import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { env } from "@/config/env";
import {
  useAccountState,
  useClaimMagicToken,
  useGoogleMobileSignIn,
  useLinkRevenueCatUser,
  useLogoutMobileSession,
  useRequestMagicLink,
} from "@/features/account/useAccountAuth";
import { useApiHealth } from "@/features/health/useApiHealth";
import {
  canUseRevenueCat,
  connectRevenueCatUser,
  fetchRevenueCatCustomerInfo,
  fetchRevenueCatOfferings,
  getAvailablePackages,
  presentRevenueCatCustomerCenter,
  presentRevenueCatPaywall,
  purchaseRevenueCatPackage,
  resolveRevenueCatAppUserId,
  restoreRevenueCatPurchases,
} from "@/lib/billing/revenueCat";
import { formatRevenueCatError } from "@/lib/billing/revenueCatErrors";
import {
  canUseGoogleSignIn,
  configureGoogleSignIn,
  getGoogleIdTokenForBackend,
  signOutGoogle,
} from "@/lib/auth/googleSignIn";
import {
  clearMobileSessionToken,
  readLastEmail,
  readMobileSessionToken,
  saveLastEmail,
  saveMobileSessionToken,
} from "@/lib/storage/preferences";
import { Screen } from "@/ui/components/Screen";
import { GenerateScreen } from "@/ui/screens/GenerateScreen";
import { PaywallScreen } from "@/ui/screens/PaywallScreen";

type AppTab = "generate" | "upgrade" | "account";

export function HomeScreen() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [mobileToken, setMobileToken] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useApiHealth();
  const requestMagic = useRequestMagicLink();
  const claimMagic = useClaimMagicToken();
  const googleSignIn = useGoogleMobileSignIn();
  const logoutMobile = useLogoutMobileSession();
  const linkRevenueCat = useLinkRevenueCatUser();
  const accountStateQuery = useAccountState(mobileToken);
  const [billingStatus, setBillingStatus] = useState("Not connected");
  const [billingInfo, setBillingInfo] = useState<{
    appUserId?: string;
    activeEntitlements?: string[];
    offeringCount?: number;
  } | null>(null);
  const [availablePackages, setAvailablePackages] = useState<PurchasesPackage[]>([]);
  const [purchaseStatus, setPurchaseStatus] = useState("Not purchased in this session");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPresentingPaywall, setIsPresentingPaywall] = useState(false);
  const [isPresentingCustomerCenter, setIsPresentingCustomerCenter] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("generate");
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  useEffect(() => {
    Promise.all([readLastEmail(), readMobileSessionToken()]).then(([storedEmail, storedToken]) => {
      if (storedEmail) setEmail(storedEmail);
      if (storedToken) setMobileToken(storedToken);
    });
  }, []);

  const authStatusText = useMemo(() => {
    if (!mobileToken) return "Sign in to load account sessions.";
    if (accountStateQuery.isLoading) return "Loading account data...";
    if (accountStateQuery.error) return "Session invalid or expired. Please claim a new token.";
    return "Signed in with mobile session token.";
  }, [mobileToken, accountStateQuery.error, accountStateQuery.isLoading]);

  const hasPremiumAccess = useMemo(() => {
    const backendPaid = Boolean(accountStateQuery.data?.premium?.paid);
    const activeEntitlements = billingInfo?.activeEntitlements ?? [];
    return backendPaid || activeEntitlements.length > 0;
  }, [accountStateQuery.data?.premium?.paid, billingInfo?.activeEntitlements]);

  const attachMobileMapAuth = useMemo(() => {
    if (!mobileToken || !accountStateQuery.data) return false;
    const { premium, sessions } = accountStateQuery.data;
    if (premium.paid) return true;
    return sessions.some(
      (s) =>
        s.subscriptionActive ||
        (typeof s.creditsRemaining === "number" && s.creditsRemaining > 0),
    );
  }, [mobileToken, accountStateQuery.data]);

  async function onRequestMagicLink() {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    await requestMagic.mutateAsync(normalized);
    await saveLastEmail(normalized);
  }

  async function onClaimToken() {
    const trimmedToken = token.trim();
    if (!trimmedToken) return;
    const result = await claimMagic.mutateAsync(trimmedToken);
    setMobileToken(result.mobileToken);
    await saveMobileSessionToken(result.mobileToken);
    await accountStateQuery.refetch();
  }

  async function onGoogleSignIn() {
    setGoogleError(null);
    try {
      const idToken = await getGoogleIdTokenForBackend();
      const result = await googleSignIn.mutateAsync(idToken);
      setMobileToken(result.mobileToken);
      await saveMobileSessionToken(result.mobileToken);
      const normalized = result.email?.trim().toLowerCase();
      if (normalized) {
        setEmail(normalized);
        await saveLastEmail(normalized);
      }
      await accountStateQuery.refetch();
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }

  async function onLogout() {
    if (!mobileToken) return;
    try {
      await logoutMobile.mutateAsync(mobileToken);
    } finally {
      setMobileToken(null);
      await clearMobileSessionToken();
      await signOutGoogle();
    }
  }

  async function onConnectBilling() {
    if (!mobileToken || !accountStateQuery.data?.sessions.length) {
      setBillingStatus("Sign in first to connect billing.");
      return;
    }
    if (!canUseRevenueCat()) {
      setBillingStatus("Missing RevenueCat public API key for this platform (EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY or EXPO_PUBLIC_REVENUECAT_IOS_API_KEY).");
      return;
    }

    const selectedSession = accountStateQuery.data.sessions[0];
    if (!selectedSession) {
      setBillingStatus("No valid session found to link billing.");
      return;
    }
    const appUserId = await resolveRevenueCatAppUserId(selectedSession.sessionId);
    setBillingStatus("Connecting RevenueCat...");

    try {
      await connectRevenueCatUser(appUserId);
      await linkRevenueCat.mutateAsync({
        mobileToken,
        appUserId,
        sessionId: selectedSession.sessionId,
      });
      await refreshBillingSnapshot(appUserId);
      setBillingStatus("RevenueCat connected and linked.");
    } catch {
      setBillingStatus("RevenueCat connect/link failed. Check API key and backend webhook auth.");
    }
  }

  async function refreshBillingSnapshot(appUserId?: string) {
    const [customerInfo, offerings] = await Promise.all([
      fetchRevenueCatCustomerInfo(),
      fetchRevenueCatOfferings(),
    ]);
    const packages = getAvailablePackages(offerings);
    const activeEntitlements = Object.keys(customerInfo.entitlements.active ?? {});
    const offeringCount = Object.keys(offerings.all ?? {}).length;
    setAvailablePackages(packages);
    setBillingInfo((prev) => ({
      appUserId: appUserId ?? prev?.appUserId,
      activeEntitlements,
      offeringCount,
    }));
  }

  async function onPurchasePackage(selectedPackage: PurchasesPackage) {
    if (!mobileToken || !billingInfo?.appUserId) {
      setPurchaseStatus("Connect billing first.");
      return;
    }
    setIsPurchasing(true);
    setPurchaseStatus(`Purchasing ${selectedPackage.identifier}...`);
    try {
      const customerInfo = await purchaseRevenueCatPackage(selectedPackage);
      await accountStateQuery.refetch();
      const activeEntitlements = Object.keys(customerInfo.entitlements.active ?? {});
      setBillingInfo((prev) => (prev ? { ...prev, activeEntitlements } : { activeEntitlements }));
      await refreshBillingSnapshot();
      setPurchaseStatus(
        activeEntitlements.length
          ? `Purchase complete. Active: ${activeEntitlements.join(", ")}`
          : "Purchase completed, waiting for entitlement activation.",
      );
    } catch (err) {
      setPurchaseStatus(formatRevenueCatError(err, "Purchase failed or canceled."));
    } finally {
      setIsPurchasing(false);
    }
  }

  async function onRestorePurchases() {
    setIsRestoring(true);
    setPurchaseStatus("Restoring purchases...");
    try {
      const customerInfo = await restoreRevenueCatPurchases();
      const activeEntitlements = Object.keys(customerInfo.entitlements.active ?? {});
      await accountStateQuery.refetch();
      await refreshBillingSnapshot();
      setPurchaseStatus(
        activeEntitlements.length
          ? `Restore complete. Active: ${activeEntitlements.join(", ")}`
          : "No active subscriptions were found to restore.",
      );
    } catch (err) {
      setPurchaseStatus(formatRevenueCatError(err, "Restore failed. Try again from the same store account."));
    } finally {
      setIsRestoring(false);
    }
  }

  async function onPresentDashboardPaywall() {
    if (!canUseRevenueCat()) {
      setPurchaseStatus("Add RevenueCat public API key for this platform in .env.local.");
      return;
    }
    setIsPresentingPaywall(true);
    setPurchaseStatus("Opening RevenueCat paywall...");
    try {
      const unlocked = await presentRevenueCatPaywall();
      await accountStateQuery.refetch();
      await refreshBillingSnapshot();
      setPurchaseStatus(
        unlocked
          ? "Paywall closed after purchase or restore."
          : "Paywall dismissed, canceled, or not shown. Configure a paywall on the current offering in RevenueCat if you see a blank flow.",
      );
    } catch (err) {
      setPurchaseStatus(formatRevenueCatError(err, "Paywall failed. Use a dev build and configure Customer Center / paywall in RevenueCat."));
    } finally {
      setIsPresentingPaywall(false);
    }
  }

  async function onOpenCustomerCenter() {
    if (!canUseRevenueCat()) {
      setPurchaseStatus("Add RevenueCat public API key for this platform in .env.local.");
      return;
    }
    setIsPresentingCustomerCenter(true);
    setPurchaseStatus("Opening subscription management…");
    try {
      await presentRevenueCatCustomerCenter();
      await accountStateQuery.refetch();
      await refreshBillingSnapshot();
      setPurchaseStatus("Customer Center closed.");
    } catch (err) {
      setPurchaseStatus(formatRevenueCatError(err, "Could not open Customer Center. Enable it in the RevenueCat dashboard."));
    } finally {
      setIsPresentingCustomerCenter(false);
    }
  }

  return (
    <Screen>
      <ScrollView testID="store-home-scroll" contentContainerStyle={styles.scrollContent}>
        <Text style={styles.kicker}>StarMap Mobile</Text>
        <Text style={styles.title}>Android-first app foundation is live</Text>
        <Text style={styles.subtitle}>
          Sign in with Google (Android) or email magic link. Sessions load from your backend the same way for
          both.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account sign in</Text>
          {Platform.OS === "android" ? (
            <>
              <Text style={styles.meta}>Google (Play-friendly)</Text>
              {canUseGoogleSignIn() ? (
                <Pressable
                  style={styles.button}
                  onPress={() => {
                    void onGoogleSignIn();
                  }}
                  disabled={googleSignIn.isPending}
                >
                  <Text style={styles.buttonText}>
                    {googleSignIn.isPending ? "Signing in…" : "Continue with Google"}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.help}>
                  Add <Text style={styles.monoInline}>EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID</Text> to enable Google
                  sign-in.
                </Text>
              )}
              {googleError ? <Text style={styles.error}>{googleError}</Text> : null}
              <Text style={styles.dividerMeta}>or use email link</Text>
            </>
          ) : null}
          <Text style={styles.meta}>1) Request magic link</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#6f86b2"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <Pressable
            style={styles.button}
            onPress={() => {
              void onRequestMagicLink();
            }}
            disabled={requestMagic.isPending}
          >
            <Text style={styles.buttonText}>
              {requestMagic.isPending ? "Sending..." : "Send sign-in link"}
            </Text>
          </Pressable>
          <Text style={styles.help}>
            Current backend emails a web link with a token. Copy token value from that link and paste below.
          </Text>
          <Text style={styles.meta}>2) Claim token</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="paste token from email link"
            placeholderTextColor="#6f86b2"
            style={styles.input}
            value={token}
            onChangeText={setToken}
          />
          <Pressable
            style={styles.button}
            onPress={() => {
              void onClaimToken();
            }}
            disabled={claimMagic.isPending}
          >
            <Text style={styles.buttonText}>{claimMagic.isPending ? "Claiming..." : "Claim token"}</Text>
          </Pressable>
          {mobileToken ? (
            <Pressable
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => {
                void onLogout();
              }}
              disabled={logoutMobile.isPending}
            >
              <Text style={styles.buttonText}>{logoutMobile.isPending ? "Signing out..." : "Sign out"}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.ok}>{authStatusText}</Text>
          {requestMagic.error ? (
            <Text style={styles.error}>Could not send link. Check backend email sender configuration.</Text>
          ) : null}
          {claimMagic.error ? (
            <Text style={styles.error}>Token claim failed. Confirm token and backend reachability.</Text>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          <Pressable
            testID="tab-generate"
            style={[styles.tabButton, activeTab === "generate" && styles.tabButtonActive]}
            onPress={() => setActiveTab("generate")}
          >
            <Text style={[styles.tabText, activeTab === "generate" && styles.tabTextActive]}>Generate</Text>
          </Pressable>
          <Pressable
            testID="tab-upgrade"
            style={[styles.tabButton, activeTab === "upgrade" && styles.tabButtonActive]}
            onPress={() => setActiveTab("upgrade")}
          >
            <Text style={[styles.tabText, activeTab === "upgrade" && styles.tabTextActive]}>Upgrade</Text>
          </Pressable>
          <Pressable
            testID="tab-account"
            style={[styles.tabButton, activeTab === "account" && styles.tabButtonActive]}
            onPress={() => setActiveTab("account")}
          >
            <Text style={[styles.tabText, activeTab === "account" && styles.tabTextActive]}>Account</Text>
          </Pressable>
        </View>

        {activeTab === "generate" ? (
          <GenerateScreen
            mobileToken={mobileToken}
            attachMobileMapAuth={attachMobileMapAuth}
            hasPremiumAccess={hasPremiumAccess}
            onOpenPaywall={() => setActiveTab("upgrade")}
          />
        ) : null}

        {activeTab === "upgrade" ? (
          <PaywallScreen
            billingStatus={billingStatus}
            purchaseStatus={purchaseStatus}
            canUseRevenueCat={canUseRevenueCat()}
            isConnecting={linkRevenueCat.isPending}
            isPurchasing={isPurchasing}
            isRestoring={isRestoring}
            isPresentingPaywall={isPresentingPaywall}
            isPresentingCustomerCenter={isPresentingCustomerCenter}
            availablePackages={availablePackages}
            billingInfo={billingInfo}
            hasPremiumAccess={hasPremiumAccess}
            onConnectBilling={() => {
              void onConnectBilling();
            }}
            onPurchasePackage={(pkg) => {
              void onPurchasePackage(pkg);
            }}
            onRestorePurchases={() => {
              void onRestorePurchases();
            }}
            onPresentDashboardPaywall={() => {
              void onPresentDashboardPaywall();
            }}
            onOpenCustomerCenter={() => {
              void onOpenCustomerCenter();
            }}
          />
        ) : null}

        {activeTab === "account" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>API health check</Text>
              <Text style={styles.meta}>Base URL: {env.EXPO_PUBLIC_API_BASE_URL}</Text>
              {isLoading ? <ActivityIndicator color="#9cc7ff" /> : null}
              {error ? (
                <Text style={styles.error}>
                  Could not reach API. Confirm EXPO_PUBLIC_API_BASE_URL in your local env file.
                </Text>
              ) : (
                <Text style={styles.ok}>
                  {typeof data?.paid === "boolean"
                    ? `Connected (premium endpoint reachable, paid=${String(data.paid)})`
                    : "Not connected yet"}
                </Text>
              )}
              <Pressable style={styles.button} onPress={() => refetch()}>
                <Text style={styles.buttonText}>{isFetching ? "Checking..." : "Re-check API"}</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Account and entitlement snapshot</Text>
              <Text style={styles.meta}>
                Premium:{" "}
                {accountStateQuery.data?.premium?.paid
                  ? `paid (${accountStateQuery.data.premium.plan ?? "unknown"})`
                  : "not paid / unavailable"}
              </Text>
              <Text style={styles.meta}>Sessions found: {accountStateQuery.data?.sessions.length ?? 0}</Text>
              {accountStateQuery.data?.sessions.slice(0, 3).map((session) => (
                <View key={session.sessionId} style={styles.sessionRow}>
                  <Text style={styles.sessionLabel}>{session.label}</Text>
                  <Text style={styles.sessionMeta}>
                    {session.plan ?? "no-plan"} | {session.orderType} |{" "}
                    {session.creditsRemaining === null ? "subscription" : `${session.creditsRemaining} credits`}
                  </Text>
                </View>
              ))}
              {accountStateQuery.isFetching ? <ActivityIndicator color="#9cc7ff" /> : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    color: "#9cc7ff",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontSize: 12,
    marginBottom: 8,
  },
  title: {
    color: "#f3f7ff",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 36,
    marginBottom: 10,
  },
  subtitle: {
    color: "#becbe4",
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 20,
  },
  scrollContent: {
    paddingBottom: 36,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  tabButton: {
    backgroundColor: "#1b2640",
    borderColor: "#32466f",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tabButtonActive: {
    backgroundColor: "#365ea8",
    borderColor: "#4f7bce",
  },
  tabText: {
    color: "#b9c9e8",
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#f3f7ff",
  },
  card: {
    backgroundColor: "#11192a",
    borderColor: "#273554",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  cardTitle: {
    color: "#f3f7ff",
    fontSize: 18,
    fontWeight: "600",
  },
  meta: {
    color: "#94a8cd",
    fontSize: 13,
  },
  ok: {
    color: "#7ef5b0",
  },
  error: {
    color: "#ff9fa3",
    lineHeight: 20,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#2a4a8e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  buttonText: {
    color: "#f3f7ff",
    fontWeight: "600",
  },
  buttonSecondary: {
    backgroundColor: "#32415f",
  },
  purchaseButton: {
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#273554",
    backgroundColor: "#0b1222",
    borderRadius: 10,
    color: "#f3f7ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  help: {
    color: "#95a8cd",
    lineHeight: 20,
    fontSize: 13,
  },
  monoInline: {
    fontFamily: "monospace",
    color: "#dbe7ff",
  },
  dividerMeta: {
    color: "#6f86b2",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
  },
  listItem: {
    color: "#c3cee6",
    lineHeight: 21,
  },
  sessionRow: {
    borderTopWidth: 1,
    borderTopColor: "#273554",
    paddingTop: 10,
  },
  sessionLabel: {
    color: "#eaf0ff",
    fontWeight: "600",
  },
  sessionMeta: {
    color: "#a6b7d9",
    marginTop: 4,
  },
});
