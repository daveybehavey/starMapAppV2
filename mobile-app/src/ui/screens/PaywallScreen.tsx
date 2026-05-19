import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

type PaywallScreenProps = {
  billingStatus: string;
  purchaseStatus: string;
  canUseRevenueCat: boolean;
  isConnecting: boolean;
  isPurchasing: boolean;
  isRestoring: boolean;
  isPresentingPaywall: boolean;
  availablePackages: PurchasesPackage[];
  billingInfo: {
    appUserId?: string;
    activeEntitlements?: string[];
    offeringCount?: number;
  } | null;
  hasPremiumAccess: boolean;
  onConnectBilling: () => void;
  onPurchasePackage: (pkg: PurchasesPackage) => void;
  onRestorePurchases: () => void;
  onPresentDashboardPaywall: () => void;
  isPresentingCustomerCenter: boolean;
  onOpenCustomerCenter: () => void;
};

export function PaywallScreen({
  billingStatus,
  purchaseStatus,
  canUseRevenueCat,
  isConnecting,
  isPurchasing,
  isRestoring,
  isPresentingPaywall,
  isPresentingCustomerCenter,
  availablePackages,
  billingInfo,
  hasPremiumAccess,
  onConnectBilling,
  onPurchasePackage,
  onRestorePurchases,
  onPresentDashboardPaywall,
  onOpenCustomerCenter,
}: PaywallScreenProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{hasPremiumAccess ? "Manage Plan" : "Upgrade to Premium"}</Text>
      <Text style={styles.body}>
        {hasPremiumAccess
          ? "Premium is active. You can still switch packages or restore purchases."
          : "Unlock premium generation and higher usage limits."}
      </Text>
      <Text style={styles.meta}>RevenueCat status: {billingStatus}</Text>

      <Text style={styles.help}>
        Dashboard paywall: create a paywall on your current offering in the RevenueCat dashboard, then use a
        development build (native module; not Expo Go).
      </Text>
      <Pressable
        style={[styles.button, styles.buttonSecondary]}
        onPress={onPresentDashboardPaywall}
        disabled={!canUseRevenueCat || isPresentingPaywall}
      >
        <Text style={styles.buttonText}>
          {isPresentingPaywall ? "Opening paywall…" : "Open RevenueCat paywall"}
        </Text>
      </Pressable>

      <Text style={styles.help}>
        Customer Center: enable and configure in the RevenueCat dashboard (subscription management for subscribers).
      </Text>
      <Pressable
        style={[styles.button, styles.buttonSecondary]}
        onPress={onOpenCustomerCenter}
        disabled={!canUseRevenueCat || isPresentingCustomerCenter}
      >
        <Text style={styles.buttonText}>
          {isPresentingCustomerCenter ? "Opening…" : "Open Customer Center"}
        </Text>
      </Pressable>

      <Text style={styles.meta}>Last billing action: {purchaseStatus}</Text>

      <Pressable style={styles.button} onPress={onConnectBilling} disabled={isConnecting}>
        <Text style={styles.buttonText}>{isConnecting ? "Connecting..." : "Connect billing account"}</Text>
      </Pressable>

      {billingInfo ? (
        <View style={styles.detailBlock}>
          <Text style={styles.meta}>App user id: {billingInfo.appUserId}</Text>
          <Text style={styles.meta}>
            Active entitlements: {billingInfo.activeEntitlements?.join(", ") || "none"}
          </Text>
          <Text style={styles.meta}>Offerings available: {billingInfo.offeringCount ?? 0}</Text>
        </View>
      ) : null}

      {availablePackages.length ? (
        <View style={styles.detailBlock}>
          <Text style={styles.meta}>Packages</Text>
          {availablePackages.map((pkg) => (
            <Pressable
              key={pkg.identifier}
              style={[styles.button, styles.purchaseButton]}
              onPress={() => onPurchasePackage(pkg)}
              disabled={isPurchasing}
            >
              <Text style={styles.buttonText}>
                {isPurchasing ? "Processing..." : `Buy ${pkg.identifier} (${pkg.product.priceString})`}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.button, styles.buttonSecondary, styles.purchaseButton]}
            onPress={onRestorePurchases}
            disabled={isRestoring}
          >
            <Text style={styles.buttonText}>{isRestoring ? "Restoring..." : "Restore purchases"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#11192a",
    borderColor: "#273554",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  title: {
    color: "#f3f7ff",
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    color: "#b8c7e4",
    lineHeight: 21,
  },
  meta: {
    color: "#94a8cd",
    fontSize: 13,
  },
  detailBlock: {
    borderTopWidth: 1,
    borderTopColor: "#273554",
    paddingTop: 10,
    gap: 8,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#2a4a8e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  purchaseButton: {
    marginTop: 4,
  },
  buttonSecondary: {
    backgroundColor: "#32415f",
  },
  buttonText: {
    color: "#f3f7ff",
    fontWeight: "600",
  },
  help: {
    color: "#7a8fb8",
    fontSize: 12,
    lineHeight: 18,
  },
});
