import type { Metadata } from "next";
import EditorPageClient from "./EditorPageClient";
import { cookies } from "next/headers";
import { META_CHECKOUT_COOKIE_NAME } from "@/lib/metaCheckout";
import { readMetaCheckoutCarry } from "@/lib/metaCheckoutCookie";

export const metadata: Metadata = {
  title: "Star Map Editor | StarMapCo",
  description: "Create and customize your personalized star map with our interactive editor — constellation labels, the Moon's true phase, the visible planets, and 15 fonts.",
  robots: { index: false, follow: false },
};

type EditorPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const metaCarry = readMetaCheckoutCarry((await cookies()).get(META_CHECKOUT_COOKIE_NAME)?.value);
  const resolvedSearchParams = (await searchParams) ?? {};
  const promoRaw = resolvedSearchParams.promo;
  const codeRaw = resolvedSearchParams.code;
  const promoStatus = Array.isArray(promoRaw) ? promoRaw[0] : promoRaw;
  const promoCode = Array.isArray(codeRaw) ? codeRaw[0] : codeRaw;

  return (
    <>
      {resolvedSearchParams.source === "meta_shop" && metaCarry.couponDropped ? (
        <div role="status" className="mx-auto my-4 max-w-4xl rounded-2xl border border-amber-200/60 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
          That discount code could not be applied to this item, so the price shown is the full price.
        </div>
      ) : null}
      <EditorPageClient promoStatus={promoStatus} promoCode={promoCode} metaCarry={metaCarry} />
    </>
  );
}
