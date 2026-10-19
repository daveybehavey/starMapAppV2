"use client";

import { useId, useState } from "react";

import type { MerchFamily } from "@/lib/merchCatalog";
import { getMerchSizeGuide, type MerchSizeGuideRow } from "@/lib/merchSizeGuide";

type GuideUnit = "in" | "cm";

function formatMeasure(valueIn: number, valueCm: number, unit: GuideUnit): string {
  return unit === "in" ? `${valueIn}″` : `${valueCm} cm`;
}

function formatRange(
  minIn: number,
  maxIn: number,
  minCm: number,
  maxCm: number,
  unit: GuideUnit
): string {
  return unit === "in" ? `${minIn}–${maxIn}″` : `${minCm}–${maxCm} cm`;
}

/**
 * "Size guide" disclosure rendered at the merch size-pick step for the
 * apparel families (tee / hoodie). Renders nothing for families without
 * a guide. Measurements come from src/lib/merchSizeGuide.ts, which is
 * transcribed verbatim from Printful (see the citation there) — apparel
 * is made to order and wrong-size orders are not refundable, so the
 * guide sits here to prevent wrong-size orders.
 */
export default function MerchSizeGuidePanel({ family }: { family: MerchFamily }) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<GuideUnit>("in");
  const regionId = useId();
  const guide = getMerchSizeGuide(family.id);
  if (!guide) return null;

  const hasSleeve = guide.rows.some((row) => row.sleeveLengthIn !== undefined);
  const unitWord = unit === "in" ? "inches" : "centimetres";

  const garmentCell = (row: MerchSizeGuideRow, kind: "length" | "width" | "sleeve") => {
    if (kind === "length") return formatMeasure(row.lengthIn, row.lengthCm, unit);
    if (kind === "width") return formatMeasure(row.chestWidthIn, row.chestWidthCm, unit);
    if (row.sleeveLengthIn === undefined || row.sleeveLengthCm === undefined) return "—";
    return formatMeasure(row.sleeveLengthIn, row.sleeveLengthCm, unit);
  };

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
        className="text-[11px] font-semibold text-amber-100 underline decoration-amber-300/60 underline-offset-2 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1a30]"
      >
        {open ? "Hide size guide" : "Size guide"}
      </button>
      {open ? (
        <div
          id={regionId}
          className="text-midnight mt-2 rounded-lg border border-amber-200/70 bg-amber-50 p-3 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-playfair text-sm font-semibold">
              Size guide <span className="text-xs font-normal">— {guide.blankLabel}</span>
            </p>
            <div
              role="group"
              aria-label="Measurement units"
              className="inline-flex overflow-hidden rounded-full border border-amber-300/70 text-[10px] font-semibold"
            >
              <button
                type="button"
                aria-pressed={unit === "in"}
                onClick={() => setUnit("in")}
                className={
                  unit === "in"
                    ? "bg-[#0b1a30] px-2.5 py-1 text-amber-50"
                    : "bg-white/60 px-2.5 py-1 text-amber-900 transition hover:bg-white"
                }
              >
                Inches
              </button>
              <button
                type="button"
                aria-pressed={unit === "cm"}
                onClick={() => setUnit("cm")}
                className={
                  unit === "cm"
                    ? "bg-[#0b1a30] px-2.5 py-1 text-amber-50"
                    : "bg-white/60 px-2.5 py-1 text-amber-900 transition hover:bg-white"
                }
              >
                CM
              </button>
            </div>
          </div>

          <p className="mt-2 text-[10px] font-semibold tracking-wide text-amber-900 uppercase">
            Garment measurements ({unitWord}, laid flat)
          </p>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[240px] border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-amber-900/20 text-left">
                  <th scope="col" className="py-1 pr-2 font-semibold">Size</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">Length</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">Chest width</th>
                  {hasSleeve ? (
                    <th scope="col" className="py-1 font-semibold">Sleeve length</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {guide.rows.map((row) => (
                  <tr key={row.size} className="border-b border-amber-900/10 last:border-0">
                    <th scope="row" className="py-1 pr-2 font-semibold">{row.size}</th>
                    <td className="py-1 pr-2">{garmentCell(row, "length")}</td>
                    <td className="py-1 pr-2">{garmentCell(row, "width")}</td>
                    {hasSleeve ? <td className="py-1">{garmentCell(row, "sleeve")}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[10px] font-semibold tracking-wide text-amber-900 uppercase">
            Fits chest ({unitWord}) — measure yourself
          </p>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[200px] border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-amber-900/20 text-left">
                  <th scope="col" className="py-1 pr-2 font-semibold">Size</th>
                  <th scope="col" className="py-1 font-semibold">Chest</th>
                </tr>
              </thead>
              <tbody>
                {guide.rows.map((row) => (
                  <tr key={row.size} className="border-b border-amber-900/10 last:border-0">
                    <th scope="row" className="py-1 pr-2 font-semibold">{row.size}</th>
                    <td className="py-1">
                      {formatRange(row.fitsChestMinIn, row.fitsChestMaxIn, row.fitsChestMinCm, row.fitsChestMaxCm, unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-amber-950/80">
            Length is measured from the high point of the shoulder to the hem; chest width is
            the garment measured across the chest, laid flat. Measurements are Printful&apos;s
            for the {guide.blankLabel}; product measurements may vary by up to 2″ (5 cm).
            Apparel is made to order in your chosen size — please check the guide before
            ordering, as wrong-size apparel can&apos;t be refunded or exchanged.
          </p>
        </div>
      ) : null}
    </div>
  );
}
