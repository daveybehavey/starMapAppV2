import type { Metadata } from "next";
import { getFunnelDashboard } from "@/lib/funnel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Funnel Dashboard",
  description: "Internal funnel conversion dashboard",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams?: Promise<{ days?: string; token?: string }>;
};

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function FunnelDashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const days = toNumber(params.days, 14);
  const requiredToken = process.env.FUNNEL_DASHBOARD_TOKEN?.trim() || "";
  const token = params.token?.trim() || "";

  if (requiredToken && token !== requiredToken) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-white">
        <h1 className="text-2xl font-semibold">Funnel dashboard locked</h1>
        <p className="mt-3 text-sm text-neutral-300">Add the valid `token` query parameter to view this page.</p>
      </main>
    );
  }

  const dashboard = await getFunnelDashboard(days);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 text-white">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-2xl font-semibold">Funnel Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-300">
          Updated {new Date(dashboard.generatedAt).toLocaleString()} • Last {dashboard.days} days + lifetime totals
        </p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-neutral-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Step</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Last {dashboard.days}d</th>
                <th className="px-4 py-3 font-semibold">Step Conversion</th>
                <th className="px-4 py-3 font-semibold">From Landing</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.rows.map((row) => (
                <tr key={row.step} className="border-t border-white/10">
                  <td className="px-4 py-3 font-medium">{row.step}</td>
                  <td className="px-4 py-3">{row.total.toLocaleString()}</td>
                  <td className="px-4 py-3">{row.lastNDays.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {row.fromPreviousPct === null ? "—" : `${row.fromPreviousPct.toFixed(2)}%`}
                  </td>
                  <td className="px-4 py-3">
                    {row.fromLandingPct === null ? "—" : `${row.fromLandingPct.toFixed(2)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
