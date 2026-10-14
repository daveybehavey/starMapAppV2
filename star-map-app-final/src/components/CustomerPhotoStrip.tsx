import { isCustomerPhotoStripEnabled } from "@/lib/customerPhotoStrip";

/**
 * Reserved slot for real customer photos. Feature-flagged; never invents reviews or stock photos.
 */
export default function CustomerPhotoStrip() {
  if (!isCustomerPhotoStripEnabled()) return null;

  return (
    <section
      className="content-visibility-auto mt-6 rounded-3xl border border-dashed border-black/10 bg-white/60 px-4 py-6"
      aria-label="Customer photos"
      data-customer-photo-strip="placeholder"
    >
      <p className="text-center text-sm font-semibold text-midnight">Customer photos</p>
      <p className="mx-auto mt-1 max-w-md text-center text-xs text-neutral-600">
        Real customer photos will appear here once we have permission to share them. No placeholder
        reviews or stock images.
      </p>
      <div
        className="mx-auto mt-4 grid max-w-2xl grid-cols-3 gap-2 opacity-40"
        aria-hidden="true"
      >
        <div className="aspect-square rounded-xl bg-neutral-200/80" />
        <div className="aspect-square rounded-xl bg-neutral-200/80" />
        <div className="aspect-square rounded-xl bg-neutral-200/80" />
      </div>
    </section>
  );
}
