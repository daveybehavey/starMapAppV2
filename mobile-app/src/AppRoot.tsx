import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { initRevenueCatOnStartup } from "@/lib/billing/revenueCat";
import { HomeScreen } from "@/ui/screens/HomeScreen";
import { queryClient } from "@/state/queryClient";

export function AppRoot() {
  useEffect(() => {
    void initRevenueCatOnStartup();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <HomeScreen />
    </QueryClientProvider>
  );
}
