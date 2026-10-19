import { getChristmasOrderByTableRows, type ChristmasOrderByTableRow } from "@/lib/christmasCampaign";

/**
 * Product × region Christmas order-by table for the Christmas landing page.
 * Dates come from CHRISTMAS_ORDER_BY_DATES via getChristmasOrderByTableRows —
 * never hardcode cutoffs here.
 *
 * Layout (persona sweep U05): at phone widths the previous treatment —
 * a 540px table inside a ~300px horizontal scroller — hid the entire US
 * column behind an undiscoverable sideways scroll and truncated the
 * instant-delivery cell. Small screens now get the same data stacked by
 * country: one block per region listing every product and its date, so
 * nothing sits off-screen and nothing truncates. The full product ×
 * region table renders at sm+ where it fits at full width.
 */

const STACKED_REGIONS: ReadonlyArray<{
  key: "canada" | "unitedStates" | "restOfWorld";
  heading: string;
}> = [
  { key: "canada", heading: "Canada — order by" },
  { key: "unitedStates", heading: "United States — order by" },
  { key: "restOfWorld", heading: "Rest of world — order by" },
];

function StackedRegionBlock({
  heading,
  regionKey,
  rows,
}: {
  heading: string;
  regionKey: (typeof STACKED_REGIONS)[number]["key"];
  rows: ChristmasOrderByTableRow[];
}) {
  return (
    <section className="rounded-2xl border border-amber-200/80 bg-white/85 px-4 py-3">
      <h3 className="text-[11px] font-semibold tracking-wide text-midnight uppercase">{heading}</h3>
      <dl className="mt-1">
        {rows.map((row) => (
          <div
            key={row.product}
            className="flex items-baseline justify-between gap-3 border-t border-amber-100/80 py-1.5 first:border-t-0"
          >
            <dt className="shrink-0 font-semibold">{row.product}</dt>
            <dd className="text-right">{row.instantNote ?? row[regionKey]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function ChristmasOrderByTable() {
  const rows = getChristmasOrderByTableRows();

  return (
    <div>
      {/* Small screens: stacked by country — every product × every
          region's date is on-screen, nothing hidden behind a scroll. */}
      <div className="space-y-3 text-xs text-neutral-900 sm:hidden" data-testid="christmas-order-by-stacked">
        {STACKED_REGIONS.map((region) => (
          <StackedRegionBlock
            key={region.key}
            heading={region.heading}
            regionKey={region.key}
            rows={rows}
          />
        ))}
      </div>

      {/* sm and up: the full product × region table at full width. */}
      <div className="hidden overflow-hidden rounded-2xl border border-amber-200/80 bg-white/85 sm:block">
        <table
          className="w-full text-left text-sm text-neutral-900"
          data-testid="christmas-order-by-table"
        >
          <thead className="bg-amber-100/80 text-xs tracking-wide text-midnight uppercase">
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
      <p className="mt-2 text-xs text-neutral-700">
        Buffered estimates for standard shipping — not guarantees.
      </p>
    </div>
  );
}
