import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "StarMap",
  slug: "starmap-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  scheme: "starmap",
  // Use SDK-based runtime version so we don't require expo-updates for appVersion policy.
  runtimeVersion: {
    policy: "sdkVersion",
  },
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#060b14",
  },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.starmapco.mobile",
  },
  android: {
    package: "app.starmapco.com",
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#060b14",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-dev-client", "expo-secure-store", "@react-native-google-signin/google-signin"],
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "72ff222f-443d-4c00-9149-78c1a200cd92",
    },
  },
};

export default config;
