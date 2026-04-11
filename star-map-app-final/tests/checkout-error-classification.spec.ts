import { expect, test } from "@playwright/test";
import {
  classifyUnexpectedCheckoutError,
  describeCheckoutErrorForLog,
} from "../src/lib/checkoutErrorClassification";

test.describe("checkout error classification", () => {
  test("maps common Stripe error types into stable diagnostic reasons", () => {
    expect(classifyUnexpectedCheckoutError({ type: "StripeInvalidRequestError" })).toBe(
      "stripe_invalid_request_error",
    );
    expect(classifyUnexpectedCheckoutError({ type: "StripeRateLimitError" })).toBe(
      "stripe_rate_limit_error",
    );
  });

  test("falls back to Stripe code when no typed error is available", () => {
    expect(classifyUnexpectedCheckoutError({ code: "resource_missing" })).toBe(
      "stripe_code_resource_missing",
    );
  });

  test("returns generic unknown bucket when nothing usable is present", () => {
    expect(classifyUnexpectedCheckoutError(new Error("something bad happened"))).toBe("unknown_error");
    expect(classifyUnexpectedCheckoutError(null)).toBe("unknown_error");
  });

  test("builds a structured safe log payload", () => {
    expect(
      describeCheckoutErrorForLog({
        type: "StripeCardError",
        code: "card_declined",
        decline_code: "generic_decline",
        statusCode: 402,
        message: "Your card was declined.",
      }),
    ).toMatchObject({
      reason: "stripe_card_error",
      type: "stripe_card_error",
      code: "card_declined",
      declineCode: "generic_decline",
      statusCode: 402,
      message: "Your card was declined.",
    });
  });
});
