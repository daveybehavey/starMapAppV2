// Synthetic fixtures only. No Stripe SDK transport or live service is loaded.
export const state = { reject: false, calls: [], lookups: [], orderType: "print" };
export const promotionId = "promo_c14_fixture";
export const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_c14fixture";
export default class Stripe {
  static createFetchHttpClient() { return {}; }
  promotionCodes = {
    list: async (params) => {
      state.lookups.push(params);
      return { data: [{ id: promotionId, active: true, code: params.code,
        coupon: { id: "coupon_c14_fixture", valid: true, percent_off: 1,
          metadata: state.orderType === "digital" ? { digital_comp: "true" } : {} },
        restrictions: {} }] };
    },
  };
  checkout = { sessions: {
    create: async (params) => {
      state.calls.push(structuredClone(params));
      if (state.reject && params.discounts?.length) {
        throw Object.assign(new Error("Fixture promotion code rejected"), {
          code: "coupon_invalid", param: "discounts[0][promotion_code]",
        });
      }
      return { id: "cs_test_c14fixture", url: checkoutUrl, expires_at: params.expires_at };
    },
  } };
}
