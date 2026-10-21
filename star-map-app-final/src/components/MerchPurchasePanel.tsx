"use client";

import MerchSizeGuidePanel from "@/components/MerchSizeGuidePanel";
import { getMerchSizeGuide } from "@/lib/merchSizeGuide";
import { MERCH_POLICY_LINE } from "@/lib/loveItGuarantee";
import type { MerchFamily, MerchFamilyId } from "@/lib/merchCatalog";

/**
 * Shared merch purchase panel (family / colour / size pickers, size guide,
 * merch checkout button, policy line). Extracted from EditorExperience so
 * the desktop editor and MobileCreate render the exact same purchase path —
 * merch state stays owned by EditorExperience and flows in via props.
 */
export type MerchPurchasePanelProps = {
  families: readonly MerchFamily[];
  familyId: MerchFamilyId;
  size: string;
  color: string;
  onFamilyChange: (family: MerchFamilyId) => void;
  onSizeChange: (size: string) => void;
  onColorChange: (color: string) => void;
  onCheckout: (options: { family: MerchFamilyId; size?: string; color?: string }) => void;
  checkoutInFlight: boolean;
  shippingCountryMissing: boolean;
  checkoutError?: string | null;
};

export function MerchPurchasePanel({
  families,
  familyId,
  size,
  color,
  onFamilyChange,
  onSizeChange,
  onColorChange,
  onCheckout,
  checkoutInFlight,
  shippingCountryMissing,
  checkoutError,
}: MerchPurchasePanelProps) {
  const family = families.find((f) => f.id === familyId) ?? null;
  return (
    <div className="mt-4 rounded-xl border border-amber-200/25 bg-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-amber-100">Merch (beta)</p>
        <span className="rounded-full border border-amber-200/40 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-100 uppercase">
          New
        </span>
      </div>
      <p className="mt-1 text-[10px] text-amber-100/80">
        Choose a product and options. Shipping is shown in Stripe before payment.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-[10px] font-semibold text-amber-100/80">Product</label>
          <select
            value={familyId}
            onChange={(event) => {
              const next = event.target.value as MerchFamilyId;
              onFamilyChange(next);
              const nextFamily = families.find((f) => f.id === next);
              onSizeChange(nextFamily?.options.size?.[0] ?? "");
              onColorChange(nextFamily?.options.color?.[0] ?? "");
            }}
            className="print-country-select text-midnight mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-[11px]"
            style={{
              color: "#111827",
              WebkitTextFillColor: "#111827",
              colorScheme: "light",
            }}
          >
            {families.map((fam) => (
              <option key={fam.id} value={fam.id}>
                {fam.label}
              </option>
            ))}
          </select>
        </div>
        {family ? (
          <>
            {family.options.color?.length ? (
              <div>
                <label className="text-[10px] font-semibold text-amber-100/80">Color</label>
                <select
                  value={color || family.options.color[0] || ""}
                  onChange={(event) => onColorChange(event.target.value)}
                  className="print-country-select text-midnight mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-[11px]"
                  style={{
                    color: "#111827",
                    WebkitTextFillColor: "#111827",
                    colorScheme: "light",
                  }}
                >
                  <option value="">Select…</option>
                  {family.options.color.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {family.options.size?.length ? (
              <div className={family.options.color?.length ? "sm:col-span-2" : undefined}>
                <label className="text-[10px] font-semibold text-amber-100/80">Size</label>
                <select
                  value={size || family.options.size[0] || ""}
                  onChange={(event) => onSizeChange(event.target.value)}
                  className="print-country-select text-midnight mt-1 w-full rounded-lg border border-amber-200/50 bg-white px-3 py-2 text-[11px]"
                  style={{
                    color: "#111827",
                    WebkitTextFillColor: "#111827",
                    colorScheme: "light",
                  }}
                >
                  <option value="">Select…</option>
                  {family.options.size.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {getMerchSizeGuide(family.id) ? (
              <div className="sm:col-span-2">
                <MerchSizeGuidePanel family={family} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() =>
          onCheckout({
            family: familyId,
            size: size || families.find((f) => f.id === familyId)?.options.size?.[0] || undefined,
            color: color || families.find((f) => f.id === familyId)?.options.color?.[0] || undefined,
          })
        }
        disabled={checkoutInFlight || shippingCountryMissing}
        className="mt-3 w-full rounded-full border border-amber-200/70 bg-amber-400/25 px-4 py-2 text-xs font-semibold text-amber-50 transition hover:-translate-y-[1px] hover:bg-amber-400/35 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {checkoutInFlight ? "Opening secure checkout..." : "Checkout selected merch"}
      </button>
      {checkoutError ? (
        <p className="mt-2 text-[11px] font-semibold text-rose-200">{checkoutError}</p>
      ) : null}
      <p className="mt-2 text-[10px] leading-snug text-amber-100/75">{MERCH_POLICY_LINE}</p>
    </div>
  );
}
