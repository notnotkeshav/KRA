import { Link } from "react-router";
import type { Route } from "./+types/dashboard";
import { loadAppContext } from "~/db/context";
import { getMonthlyKRAsBetween, getMonthsWithData } from "~/db/repositories/monthly-kra";
import { getAllGoLiveOverrides } from "~/db/repositories/settings";
import { buildDashboard, dashboardRangeStart, pickReferenceMonth } from "~/domain/dashboard";
import { describeGoLiveSource } from "~/domain/kra/carry-forward";
import { findGoLiveKRA } from "~/domain/kra/quarterly";
import { formatMonth, formatQuarter, getCurrentMonth, getMonthLabel, getMonthsForQuarter, getQuarterFromMonth, getYearFromMonth } from "~/utils/dates";
import { formatNumber, formatPercentage } from "~/utils/formatting";
import { Alert, Bar, Card, EmptyState, PageHeader, StatCard } from "~/components/common/ui";

export function meta() {
  return [{ title: "Dashboard · KRA Management" }];
}

export async function clientLoader() {
  const [ctx, monthsWithData, overrides] = await Promise.all([loadAppContext(), getMonthsWithData(), getAllGoLiveOverrides()]);
  const ref = pickReferenceMonth(getCurrentMonth(), monthsWithData);
  const quarterEnd = getMonthsForQuarter(getYearFromMonth(ref.month), getQuarterFromMonth(ref.month))[2];
  const records = await getMonthlyKRAsBetween(dashboardRangeStart(ref.month), quarterEnd);
  const data = buildDashboard(ref.month, ref.fallback, ctx.employees, ctx.kras, ctx.settings, records, overrides);
  return { data, goLiveKra: findGoLiveKRA(ctx.kras) ?? null, hasAnyData: monthsWithData.length > 0, currentMonth: getCurrentMonth() };
}

function TrendBars({ values, max }: { values: { name: string; total: number | null }[]; max: number }) {
  return (
    <ul className="space-y-1.5">
      {values.map((v) => (
        <li key={v.name} className="grid grid-cols-[6rem_1fr_4rem] items-center gap-2 text-sm">
          <span className="truncate text-slate-700" title={v.name}>{v.name}</span>
          {v.total === null ? <span className="col-span-2 text-xs text-slate-400">no data</span> : (
            <>
              <Bar value={v.total} max={max} label={`${v.name} ${formatNumber(v.total)}`} />
              <span className="text-right tabular-nums text-slate-700">{formatPercentage(v.total)}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { data, goLiveKra, hasAnyData, currentMonth } = loaderData;
  const { referenceQuarter: rq } = data;

  return (
    <>
      <PageHeader title="Dashboard" description="KRA performance at a glance." />

      {!hasAnyData ? (
        <EmptyState title="No KRA data yet" description="Enter monthly KRAs or import your spreadsheet to populate the dashboard.">
          <div className="flex justify-center gap-4 text-sm font-medium">
            <Link to="/monthly" className="text-indigo-600 hover:underline">Enter monthly KRA</Link>
            <Link to="/import" className="text-indigo-600 hover:underline">Import CSV</Link>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {data.usingFallbackMonth && (
            <Alert tone="info">
              No KRA data for {formatMonth(currentMonth)} yet. Showing the latest month with data ({formatMonth(data.referenceMonth)}).
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Month" value={getMonthLabel(data.referenceMonth)} sub={data.usingFallbackMonth ? "Latest with data" : "Current month"} />
            <StatCard label="Quarter" value={formatQuarter(rq.year, rq.quarter)} sub={<Link to={`/quarterly/${rq.year}/Q${rq.quarter}`} className="text-indigo-600 hover:underline">View quarter</Link>} />
            <StatCard label="Employees" value={data.activeEmployees} sub="Active" />
            <StatCard label="Average" value={data.monthlyAverage === null ? "—" : formatNumber(data.monthlyAverage)} sub={`of ${formatNumber(data.maxMonthly)} this month`} />
            <StatCard label="Highest" value={data.highest ? formatNumber(data.highest.total) : "—"} sub={data.highest?.name} />
            <StatCard label="Lowest" value={data.lowest ? formatNumber(data.lowest.total) : "—"} sub={data.lowest?.name ?? (data.highest ? "Needs 2+ employees" : undefined)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={`Category performance — ${getMonthLabel(data.referenceMonth)}`}>
              {data.byKRA.every((b) => b.average === 0) && data.monthlyAverage === null ? (
                <p className="p-4 text-sm text-slate-500">No records for this month.</p>
              ) : (
                <ul className="space-y-3 p-4">
                  {data.byKRA.map(({ kra, average }) => {
                    const pct = kra.weight > 0 ? (average / kra.weight) * 100 : 0;
                    return (
                      <li key={kra.id}>
                        <div className="mb-1 flex justify-between gap-2 text-sm">
                          <span className="text-slate-700">{kra.name}</span>
                          <span className="shrink-0 tabular-nums text-slate-600">{formatNumber(average)} / {formatNumber(kra.weight)} <span className="text-slate-400">({formatNumber(pct, 0)}%)</span></span>
                        </div>
                        <Bar value={average} max={kra.weight} tone={pct >= 80 ? "green" : pct >= 50 ? "indigo" : "amber"} label={kra.name} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Go Live status">
              {data.goLive.every((q) => q.months.length === 0) ? (
                <p className="p-4 text-sm text-slate-500">No data for {formatQuarter(rq.year, rq.quarter)}.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.goLive.map((q) => (
                    <li key={q.employeeId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="font-medium text-slate-800">{q.employeeName}</span>
                      <span className="text-right text-slate-600">
                        {q.months.length === 0 ? "No data" : (
                          <>
                            <span className="font-semibold text-slate-900">{formatNumber(q.goLiveOverride ?? q.goLive?.total ?? 0)}%</span>
                            <span className="block text-xs text-slate-500">{q.goLiveOverride !== null ? "Manual override" : describeGoLiveSource(q.goLive?.source ?? "manual")}</span>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {goLiveKra && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{formatQuarter(rq.year, rq.quarter)} · {goLiveKra.name}</p>}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Monthly achievement trend">
              {data.monthlyTrend.length === 0 ? <p className="p-4 text-sm text-slate-500">No recent months with data.</p> : (
                <div className="space-y-4 p-4">
                  {data.monthlyTrend.map((m) => (
                    <div key={m.month}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{getMonthLabel(m.month)}</p>
                      <TrendBars values={m.values} max={data.maxMonthly} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Quarterly achievement trend">
              {data.quarterlyTrend.length === 0 ? <p className="p-4 text-sm text-slate-500">No recent quarters with data.</p> : (
                <div className="space-y-4 p-4">
                  {data.quarterlyTrend.map((q) => (
                    <div key={`${q.year}-${q.quarter}`}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{formatQuarter(q.year, q.quarter)}</p>
                      <TrendBars values={q.values} max={data.maxMonthly} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
