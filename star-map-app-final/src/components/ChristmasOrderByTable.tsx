import { getChristmasOrderByTableRows } from "@/lib/christmasCampaign";

/**
 * Product × region Christmas order-by table for the Christmas landing page.
 * Dates come from CHRISTMAS_ORDER_BY_DATES via getChristmasOrderByTableRows —
 * never hardcode cutoffs here. Markup follows the /shipping country table,
 * including the census D04 mobile treatment: min-width inside an
 * overflow-x-auto wrapper plus a right-edge fade cue on small screens.
 */
export default function ChristmasOrderByTable() {
  const rows = getChristmasOrderByTableRows();

  return (
    <div>
      <div className="relative">
        <div className="overflow-x-auto rounded-2xl border border-amber-200/80 bg-white/85">
          <table
            className="min-w-[540px] text-left text-xs text-neutral-900 sm:min-w-full sm:text-sm"
            data-testid="christmas-order-by-table"
          >
            <thead className="bg-amber-100/80 text-[11px] tracking-wide text-midnight uppercase sm:text-xs">
              <tr>
                <th className="px-3 py-2 font-semibold">Product</th>
                <th className="px-3 py-2 font-semibold">Canada — order by</th>
                <th className="px-3 py-2 font-semibold">US — order by</th>
                <th className="px-3 py-2 font-semibold">Rest of world — order by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.product} className="border-t border-amber-100/80">
                  <td className="px-3 py-2 font-semibold">{row.product}</td>
                  {row.instantNote ? (
                    <td colSpan={3} className="px-3 py-2">
                      {row.instantNote}
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2">{row.canada}</td>
                      <td className="px-3 py-2">{row.unitedStates}</td>
                      <td className="px-3 py-2">{row.restOfWorld}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Census D04: right-edge fade cue that the table scrolls
            sideways on small screens; hidden at sm+ where the table
            fits at full width. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-2xl bg-gradient-to-l from-white/95 to-transparent sm:hidden"
        />
      </div>
      <p className="mt-2 text-xs text-neutral-700">
        Buffered estimates for standard shipping — not guarantees.
      </p>
    </div>
  );
}
