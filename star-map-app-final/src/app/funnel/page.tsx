import type { Metadata } from "next";
import { getFunnelDashboard } from "@/lib/funnel";
import { getCheckoutFailureDashboard } from "@/lib/checkoutDiagnostics";
import { getPromotionSubscriberSummary } from "@/lib/promotionSubscriptions";
import { getReferralDashboard } from "@/lib/referralDashboard";
import {
  formatReferralOfferVariantLabel,
  formatReferralSkipReasonLabel,
  REFERRAL_OFFER_MIX_EMPTY_NOTE,
  REFERRAL_POLICY_NOTE,
  REFERRAL_SKIP_REASONS_EMPTY_NOTE,
} from "@/lib/referralUi";
import { FunnelCsvDownloader } from "@/components/funnel/FunnelCsvDownloader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Funnel Dashboard | StarMapCo",
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

function Sparkline({ values }: { values: number[] }) {
  const width = 140;
  const height = 32;
  if (!values.length) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#ffffff22" strokeWidth="2" />
      </svg>
    );
  }
  const max = Math.max(...values, 0);
  const min = Math.min(...values, max);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const normalized = (value - min) / range;
    const y = height - normalized * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const lastValue = values[values.length - 1];
  const lastX = width;
  const lastY = height - ((lastValue - min) / range) * height;

  return (
    <svg width={width} height={height} aria-hidden="true" role="img">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#f5c26b"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3.5} fill="#f5c26b" />
    </svg>
  );
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

function findStepTotal(rows: Awaited<ReturnType<typeof getFunnelDashboard>>["rows"], step: string) {
  return rows.find((row) => row.step === step)?.lastNDays ?? 0;
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

  const [dashboard, checkoutDiagnostics, promotionSubscribers, referralDashboard] = await Promise.all([
    getFunnelDashboard(days),
    getCheckoutFailureDashboard(days),
    getPromotionSubscriberSummary(500),
    getReferralDashboard(days),
  ]);
  const lastStep = dashboard.rows[dashboard.rows.length - 1];
  const landingTotal = dashboard.rows.find((row) => row.step === "landing_view")?.total ?? 0;
  const landingConvertedPct = landingTotal > 0 ? (lastStep?.total ?? 0) / landingTotal : 0;
  const checkoutStarted = findStepTotal(dashboard.rows, "checkout_started");
  const checkoutRequests = findStepTotal(dashboard.rows, "checkout_request_received");
  const checkoutSessions = findStepTotal(dashboard.rows, "checkout_session_created");
  const paymentsVerified = findStepTotal(dashboard.rows, "payment_verified");
  const requestShare = percentage(checkoutRequests, checkoutStarted);
  const sessionShare = percentage(checkoutSessions, checkoutRequests);
  const paidShare = percentage(paymentsVerified, checkoutSessions);
  const topCheckoutBlocker = checkoutDiagnostics.rows[0] ?? null;
  const dropStep = dashboard.rows.reduce<{ row: typeof dashboard.rows[0] | null; pct: number }>(
    (acc, row, index) => {
      if (index === 0) return acc;
      const prev = dashboard.rows[index - 1];
      const pct = prev?.total ? row.total / prev.total : 0;
      if (pct < acc.pct) {
        return { row, pct };
      }
      return acc;
    },
    { row: null, pct: 1 },
  );
  const dropAlert =
    dropStep.row && dropStep.pct < 0.65
      ? `Major drop detected: ${dropStep.row.step.replace(/_/g, " ")} lost ${(100 * (1 - dropStep.pct)).toFixed(
          1,
        )}% relative to the previous step.`
      : null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 text-white">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-2xl font-semibold">Funnel Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-300">
          Updated {new Date(dashboard.generatedAt).toLocaleString()} • Last {dashboard.days} days + lifetime totals
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.4em] text-neutral-500">
          Token-based access only — set <code className="rounded bg-black/10 px-1 py-0.5 text-[11px]">FUNNEL_DASHBOARD_TOKEN</code>
          in your environment to view this page.
        </p>
        {dropAlert ? (
          <div className="mt-4 rounded-xl border border-rose-300/60 bg-rose-900/80 p-3 text-[13px] text-rose-50 shadow">
            {dropAlert}
          </div>
        ) : null}
        <div className="mt-4">
          <FunnelCsvDownloader
            rows={dashboard.rows}
            daily={dashboard.daily}
            generatedAt={dashboard.generatedAt}
          />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Landing conversion</p>
            <p className="text-2xl font-bold">
              {(landingConvertedPct * 100).toFixed(1)}%<span className="text-base font-normal text-neutral-300"> of visitors</span>
            </p>
            <p className="text-sm text-neutral-400">to {lastStep?.step ?? "checkout"}</p>
          </div>
          {dropStep.row ? (
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Biggest drop</p>
              <p className="text-2xl font-bold">{dropStep.row.step.replace(/_/g, " ")}</p>
              <p className="text-sm text-neutral-400">
                {((1 - dropStep.pct) * 100).toFixed(1)}% drop from previous step
              </p>
            </div>
          ) : null}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Checkout handoff</p>
            <p className="text-2xl font-bold">
              {requestShare === null ? "—" : `${requestShare.toFixed(1)}%`}
            </p>
            <p className="text-sm text-neutral-400">
              {checkoutRequests.toLocaleString()} requests from {checkoutStarted.toLocaleString()} checkout starts
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Stripe session creation</p>
            <p className="text-2xl font-bold">
              {sessionShare === null ? "—" : `${sessionShare.toFixed(1)}%`}
            </p>
            <p className="text-sm text-neutral-400">
              {checkoutSessions.toLocaleString()} sessions from {checkoutRequests.toLocaleString()} requests
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Paid after Stripe</p>
            <p className="text-2xl font-bold">{paidShare === null ? "—" : `${paidShare.toFixed(1)}%`}</p>
            <p className="text-sm text-neutral-400">
              {paymentsVerified.toLocaleString()} payments from {checkoutSessions.toLocaleString()} sessions
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Promo signups</p>
            <p className="text-2xl font-bold">{promotionSubscribers.active.toLocaleString()}</p>
            <p className="text-sm text-neutral-400">
              {promotionSubscribers.total.toLocaleString()} total • {promotionSubscribers.unsubscribed.toLocaleString()} unsubscribed
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              Welcome sent {promotionSubscribers.lifecycle.welcomeSent.toLocaleString()} • pending{" "}
              {promotionSubscribers.lifecycle.pending.toLocaleString()} • due now{" "}
              {promotionSubscribers.lifecycle.dueNow.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              objection {promotionSubscribers.lifecycle.queuedByStep.objection.toLocaleString()} queued • urgency{" "}
              {promotionSubscribers.lifecycle.queuedByStep.urgency.toLocaleString()} queued • completed{" "}
              {promotionSubscribers.lifecycle.completed.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Referral conversions</p>
            <p className="text-2xl font-bold">{referralDashboard.lastNDays.conversions.toLocaleString()}</p>
            <p className="text-sm text-neutral-400">
              {referralDashboard.lastNDays.rewardsGrantedCredits.toLocaleString()} credits granted •{" "}
              {referralDashboard.lastNDays.rewardSkips.toLocaleString()} skips in last {days}d
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Referral reversals</p>
            <p className="text-2xl font-bold">
              {referralDashboard.lastNDays.conversionReversals.toLocaleString()}
            </p>
            <p className="text-sm text-neutral-400">
              conversion reversals • {referralDashboard.lastNDays.rewardReversals.toLocaleString()} reward reversals
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Top checkout blocker</p>
            <p className="text-2xl font-bold">{topCheckoutBlocker?.reason ?? "No recorded blockers"}</p>
            <p className="text-sm text-neutral-400">
              {topCheckoutBlocker ? `${topCheckoutBlocker.lastNDays.toLocaleString()} in the last ${days} days` : "No server-side checkout failures recorded."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-4 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Top referral skip reasons</p>
            <p className="text-sm text-neutral-300">
              {referralDashboard.topSkipReasons.length > 0
                ? referralDashboard.topSkipReasons
                    .map((entry) => `${formatReferralSkipReasonLabel(entry.value)} (${entry.count})`)
                    .join(" • ")
                : REFERRAL_SKIP_REASONS_EMPTY_NOTE}
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              Offer variants:{" "}
              {referralDashboard.topOfferVariants.length > 0
                ? referralDashboard.topOfferVariants
                    .map((entry) => `${formatReferralOfferVariantLabel(entry.value)} (${entry.count})`)
                    .join(" • ")
                : REFERRAL_OFFER_MIX_EMPTY_NOTE}
            </p>
            <p className="mt-2 text-xs text-neutral-400">
              {REFERRAL_POLICY_NOTE}
            </p>
          </div>
        </div>
        {referralDashboard.topReferrers.length > 0 ? (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Top referral codes (last {days}d)</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {referralDashboard.topReferrers.map((entry) => (
                <div key={entry.code} className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                  <p className="text-sm font-medium text-white">{entry.code}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {entry.conversions.toLocaleString()} conversions • {entry.rewardsGranted.toLocaleString()} credits granted •{" "}
                    {entry.rewardSkips.toLocaleString()} skips
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {checkoutDiagnostics.rows.length > 0 ? (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Checkout blockers</h2>
                <p className="mt-1 text-xs text-neutral-400">Server-side reasons recorded before Stripe session creation.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {checkoutDiagnostics.rows.slice(0, 6).map((row) => (
                <div key={row.reason} className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                  <p className="text-sm font-medium text-white">{row.reason}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {row.lastNDays.toLocaleString()} last {days}d • {row.total.toLocaleString()} lifetime
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-neutral-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Trend</th>
                <th className="px-4 py-3 font-semibold">Step</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Last {dashboard.days}d</th>
                <th className="px-4 py-3 font-semibold">Step Conversion</th>
                <th className="px-4 py-3 font-semibold">From Landing</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.rows.map((row) => {
                const sparklineValues = dashboard.daily.map((day) => day.counts[row.step] ?? 0);
                return (
                  <tr key={row.step} className="border-t border-white/10">
                    <td className="px-4 py-3">
                      <Sparkline values={sparklineValues} />
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
