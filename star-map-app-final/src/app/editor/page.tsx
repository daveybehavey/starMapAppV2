import type { Metadata } from "next";
import EditorPageClient from "./EditorPageClient";

export const metadata: Metadata = {
  title: "Star Map Editor | StarMapCo",
  description: "Create and customize your personalized star map with our interactive editor.",
  robots: { index: false, follow: false },
};

type EditorPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const promoRaw = resolvedSearchParams.promo;
  const codeRaw = resolvedSearchParams.code;
  const promoStatus = Array.isArray(promoRaw) ? promoRaw[0] : promoRaw;
  const promoCode = Array.isArray(codeRaw) ? codeRaw[0] : codeRaw;

  return <EditorPageClient promoStatus={promoStatus} promoCode={promoCode} />;
}
