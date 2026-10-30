/**
 * Lever A presentation note (S55-7 merchandising spec): the one place
 * the second-copy offer copy lives, so every surface that surfaces the
 * offer states it identically. The copy promises only what checkout
 * implements — a second copy of the SAME design (fulfilment is
 * quantity 2 on the order's single Printful item) at 10% off that copy
 * (round(effective variant price x 0.9) in both price books). It claims
 * no discount on the first copy, shipping, or add-ons, and no savings
 * amount.
 *
 * Render it only behind the server-resolved visibility from
 * `resolveSecondCopyOfferVisibility` (lib/secondCopyOffer.ts) plus the
 * surface's own eligibility check — never on a client-side flag read.
 */
export const SECOND_COPY_OFFER_COPY =
  "Add a second copy of the same design at checkout for 10% off that copy.";

type SecondCopyOfferNoteProps = {
  /** Colour context of the surrounding panel (typography is fixed). */
  className?: string;
};

export default function SecondCopyOfferNote({ className = "" }: SecondCopyOfferNoteProps) {
  return <p className={`mt-2 text-sm leading-5 ${className}`.trim()}>{SECOND_COPY_OFFER_COPY}</p>;
}
