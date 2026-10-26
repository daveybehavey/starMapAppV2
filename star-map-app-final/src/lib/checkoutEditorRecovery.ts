/**
 * Build an editor URL that reloads the buyer's map and reopens checkout so a fresh
 * browser handoff token can be issued (used after missing/expired checkout_handoff).
 */
export function buildCheckoutEditorRecoveryUrl(input: {
  siteOrigin: string;
  mapId?: string | null;
  orderType?: "digital" | "print" | null;
  plan?: string | null;
  printVariant?: string | null;
  shippingCountry?: string | null;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  includeSecondCopy?: boolean;
  source?: string;
}): string {
  const origin = input.siteOrigin.replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set("mode", "quick");
  params.set("source", input.source ?? "checkout-handoff-recovery");
  if (input.mapId) params.set("map_id", input.mapId);
  if (input.orderType === "print") {
    params.set("checkout", "print");
    if (input.printVariant) params.set("print_variant", input.printVariant);
    if (input.shippingCountry) params.set("shipping_country", input.shippingCountry.toUpperCase());
    if (input.includeDigitalAddOn) params.set("include_digital_addon", "1");
    if (input.includeCardAddOn) params.set("include_card_addon", "1");
    if (input.includeSecondCopy) params.set("include_second_copy", "1");
  } else {
    params.set("checkout", "digital");
    if (input.plan && ["single", "pack3", "subscription"].includes(input.plan)) {
      params.set("plan", input.plan);
    }
  }
  return `${origin}/editor?${params.toString()}`;
}

/** Cancel URL that returns print buyers to the editor with checkout + country control open. */
export function buildCheckoutCancelUrl(input: {
  siteOrigin: string;
  mapId?: string | null;
  orderType?: "digital" | "print" | null;
  plan?: string | null;
  printVariant?: string | null;
  shippingCountry?: string | null;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  includeSecondCopy?: boolean;
}): string {
  return buildCheckoutEditorRecoveryUrl({
    ...input,
    source: input.orderType === "print" ? "checkout-cancel-change-country" : "checkout-cancel",
  });
}
