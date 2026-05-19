import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  claimMagicToken,
  fetchMobileState,
  linkRevenueCatUser,
  logoutMobileSession,
  requestMagicLink,
  signInWithGoogleMobile,
} from "@/lib/api/auth";

export function useRequestMagicLink() {
  return useMutation({
    mutationFn: requestMagicLink,
  });
}

export function useClaimMagicToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: claimMagicToken,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["account", "state", result.mobileToken] });
    },
  });
}

export function useGoogleMobileSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (idToken: string) => signInWithGoogleMobile(idToken),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["account", "state", result.mobileToken] });
    },
  });
}

export function useAccountState(mobileToken: string | null) {
  return useQuery({
    queryKey: ["account", "state", mobileToken],
    queryFn: () => fetchMobileState(mobileToken as string),
    enabled: Boolean(mobileToken),
  });
}

export function useLogoutMobileSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutMobileSession,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });
}

export function useLinkRevenueCatUser() {
  return useMutation({
    mutationFn: linkRevenueCatUser,
  });
}
