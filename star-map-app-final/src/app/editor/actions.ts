"use server";

import { cookies } from "next/headers";
import { META_CHECKOUT_COOKIE_NAME } from "@/lib/metaCheckout";

export async function clearEditorMetaCheckoutCarry() {
  (await cookies()).delete(META_CHECKOUT_COOKIE_NAME);
}
