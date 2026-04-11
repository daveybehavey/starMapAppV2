import { expect, test } from "@playwright/test";
import { isQaTaggedSessionLike, normalizeQaSource, resolveQaRequestContext } from "../src/lib/qaSession";

test.describe("qa session helpers", () => {
  test("normalizes QA sources to safe tokens", () => {
    expect(normalizeQaSource(" Promo Link Readiness ")).toBe("promo_link_readiness");
    expect(normalizeQaSource("")).toBe("");
  });

  test("requires a valid admin token before honoring QA headers", () => {
    const headers = new Headers({
      "x-admin-token": "wrong",
      "x-qa-run": "true",
      "x-qa-source": "promo_link_readiness",
    });

    expect(resolveQaRequestContext(headers, "expected-token")).toEqual({
      enabled: false,
      source: null,
    });
  });

  test("enables QA context when the admin token is valid", () => {
    const headers = new Headers({
      "x-admin-token": "expected-token",
      "x-qa-run": "true",
      "x-qa-source": "promo_link_readiness",
    });

    expect(resolveQaRequestContext(headers, "expected-token")).toEqual({
      enabled: true,
      source: "promo_link_readiness",
    });
  });

  test("detects QA-tagged sessions from metadata", () => {
    expect(
      isQaTaggedSessionLike({
        metadata: {
          qa_run: "true",
        },
      }),
    ).toBe(true);

    expect(
      isQaTaggedSessionLike({
        metadata: {
          promotion_code: "EMAIL50",
        },
      }),
    ).toBe(false);
  });
});
