/**
 * Centralized API service layer for typed, consistent API calls.
 *
 * Benefits:
 * - Type-safe request/response handling
 * - Centralized error handling
 * - Consistent caching/request options
 * - Easier to mock for testing
 */

import type { CheckoutPlan } from "./pricing";
import type { MapRecipe } from "./renderSky";

// ============================================================================
// Types
// ============================================================================

/** Response from /api/premium */
export interface PremiumStatusResponse {
  paid: boolean;
  plan?: CheckoutPlan | null;
  creditsRemaining?: number | null;
  subscriptionActive?: boolean | null;
}

/** Response from /api/entitlements/consume */
export interface ConsumeCreditsResponse {
  success?: boolean;
  creditsRemaining?: number | null;
  plan?: CheckoutPlan | null;
}

/** Response from /api/entitlements/claim */
export interface ClaimEntitlementsResponse {
  success?: boolean;
  creditsRemaining?: number | null;
  plan?: CheckoutPlan | null;
}

/** Response from /api/entitlements/link */
export interface LinkEntitlementsResponse {
  success?: boolean;
  error?: string;
}

/** Response from /api/geocode */
export interface GeocodeResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  type?: string;
  countryCode?: string;
  state?: string;
}

/** Response from /api/maps GET */
export interface GetMapResponse {
  recipe?: MapRecipe;
  error?: string;
}

/** Response from /api/maps POST */
export interface SaveMapResponse {
  id?: string;
  error?: string;
}

/** Response from /api/checkout */
export interface CheckoutResponse {
  url?: string;
  error?: string;
}

/** Response from /api/stripe/verify */
export interface StripeVerifyResponse {
  paid?: boolean;
  plan?: CheckoutPlan;
  error?: string;
}

/** API error */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `API error: ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) errorMessage = data.error;
    } catch {
      // Ignore JSON parse errors
    }
    throw new ApiError(errorMessage, res.status);
  }
  return res.json() as Promise<T>;
}

// ============================================================================
// API Methods
// ============================================================================

export const api = {
  /**
   * Check premium status for current session
   */
  premium: {
    async check(signal?: AbortSignal): Promise<PremiumStatusResponse> {
      const res = await fetch("/api/premium", {
        cache: "no-store",
        signal,
      });
      return handleResponse<PremiumStatusResponse>(res);
    },
  },

  /**
   * Entitlements management (credits, claims, linking)
   */
  entitlements: {
    /**
     * Consume one HD credit
     */
    async consume(signal?: AbortSignal): Promise<ConsumeCreditsResponse> {
      const token =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const res = await fetch("/api/entitlements/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal,
      });
      return handleResponse<ConsumeCreditsResponse>(res);
    },

    /**
     * Claim entitlements from a shared link token
     */
    async claim(token: string, signal?: AbortSignal): Promise<ClaimEntitlementsResponse> {
      const res = await fetch(`/api/entitlements/claim?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
        signal,
      });
      return handleResponse<ClaimEntitlementsResponse>(res);
    },

    /**
     * Link entitlements to current session
     */
    async link(mapId: string, signal?: AbortSignal): Promise<LinkEntitlementsResponse> {
      const res = await fetch("/api/entitlements/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapId }),
        signal,
      });
      return handleResponse<LinkEntitlementsResponse>(res);
    },
  },

  /**
   * Geocoding / location search
   */
  geocode: {
    /**
     * Search for locations by query string
     */
    async search(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
      if (!query || query.length < 2) {
        return [];
      }
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
        signal,
      });
      return handleResponse<GeocodeResult[]>(res);
    },
  },

  /**
   * Map recipes (save/load)
   */
  maps: {
    /**
     * Get a map recipe by ID
     */
    async get(id: string, accessKey?: string, signal?: AbortSignal): Promise<GetMapResponse> {
      const params = new URLSearchParams({ id });
      if (accessKey) params.set("accessKey", accessKey);

      const res = await fetch(`/api/maps?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      return handleResponse<GetMapResponse>(res);
    },

    /**
     * Save a map recipe and get a shareable ID
     */
    async save(recipe: MapRecipe, signal?: AbortSignal): Promise<SaveMapResponse> {
      const res = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
        signal,
      });
      return handleResponse<SaveMapResponse>(res);
    },
  },

  /**
   * Checkout / payment
   */
  checkout: {
    /**
     * Create a checkout session
     */
    async create(
      options: {
        plan: CheckoutPlan;
        recipeId: string;
        accessKey: string;
      },
      signal?: AbortSignal
    ): Promise<CheckoutResponse> {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
        signal,
      });
      return handleResponse<CheckoutResponse>(res);
    },
  },

  /**
   * Stripe verification
   */
  stripe: {
    /**
     * Verify a Stripe checkout session
     */
    async verify(sessionId: string, signal?: AbortSignal): Promise<StripeVerifyResponse> {
      const res = await fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
        signal,
      });
      return handleResponse<StripeVerifyResponse>(res);
    },
  },
};

export default api;
