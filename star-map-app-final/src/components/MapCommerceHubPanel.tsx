"use client";

import Link from "next/link";
import { listMapCommerceOffers, type MapCommerceOffer } from "@/lib/mapCommerceLinks";
import { getPrintShippingDisclosure } from "@/lib/printCheckoutConfig";

type Props = {
  mapId: string;
  className?: string;
};

function offerButtonClasses(offer: MapCommerceOffer): string {
  const base =
    "inline-flex w-full flex-col items-start rounded-xl border px-4 py-3 text-left transition hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70";

  if (offer.recommended) {
    return `${base} border-amber-300/50 bg-amber-400/15 hover:bg-amber-400/20`;
  }
  if (offer.kind === "edit") {
    return `${base} border-white/15 bg-white/5 hover:bg-white/10`;
  }
  return `${base} border-white/15 bg-white/[0.07] hover:border-amber-200/30 hover:bg-white/10`;
}

export default function MapCommerceHubPanel({ mapId, className = "" }: Props) {
  const offers = listMapCommerceOffers(mapId);
  const purchasable = offers.filter((offer) => offer.kind !== "edit");
  const editOffer = offers.find((offer) => offer.kind === "edit");
  const shippingNote = getPrintShippingDisclosure();

  if (!purchasable.length) return null;

  return (
    <section
      id="shop-this-map"
      className={`rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-50/10 to-amber-100/10 p-6 backdrop-blur ${className}`}
      aria-labelledby="shop-this-map-heading"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Shop this map</p>
      <h2 id="shop-this-map-heading" className="mt-2 text-lg font-semibold text-white">
        Order from this exact design
      </h2>
      <p className="mt-2 text-sm text-neutral-200">
        Same stars, same message — pick digital HD, a printed gift, or a small merch keepsake.
        {shippingNote ? ` ${shippingNote}` : ""}
      </p>

      <ul className="mt-4 space-y-2">
        {purchasable.map((offer) => (
          <li key={offer.id}>
            <Link href={offer.href} className={offerButtonClasses(offer)}>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{offer.label}</span>
                <span className="shrink-0 text-xs font-semibold text-amber-200">{offer.priceLine}</span>
              </span>
              <span className="mt-1 text-xs text-neutral-300">{offer.detail}</span>
              {offer.badge ? (
                <span className="mt-2 inline-flex rounded-full border border-amber-200/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  {offer.badge}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {editOffer ? (
        <Link
          href={editOffer.href}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/35 hover:bg-white/15"
        >
          {editOffer.label} →
        </Link>
      ) : null}
    </section>
  );
}
