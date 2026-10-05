import { useEffect, useMemo, useState } from "react";
import { Link, redirect, useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/quarterly";
import { loadAppContext } from "~/db/context";
import { getMonthlyKRAsBetween } from "~/db/repositories/monthly-kra";
import { clearGoLiveOverride, getGoLiveOverrides, setGoLiveOverride } from "~/db/repositories/settings";
import { buildQuarterlyKRAs, findGoLiveKRA } from "~/domain/kra/quarterly";
import type { QuarterlyKRA } from "~/types/monthly-kra";
import { type ActionResult, fail, readJson } from "~/utils/actions";
import {
  type Quarter, formatQuarter, getCurrentQuarter, getCurrentYear, getMonthLabel, getMonthsForQuarter,
  getNextQuarter, getPreviousQuarter, getYearOptions, parseQuarterParam, parseYearParam,
} from "~/utils/dates";
import { formatNumber } from "~/utils/formatting";
import { Alert, Button, Card, EmptyState, Field, Modal, PageHeader, inputCls } from "~/components/common/ui";
import { GoLivePanel, QuarterlyCategoryTable, QuarterlySummaryTable } from "~/components/quarterly/QuarterlyTables";

export function meta() {
  return [{ title: "Quarterly KRA · KRA Management" }];
}

const path = (year: number, quarter: number) => `/quarterly/${year}/Q${quarter}`;

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const year = parseYearParam(params.year);
  const quarter = parseQuarterParam(params.quarter);
  if (year === null || quarter === null) throw redirect(path(getCurrentYear(), getCurrentQuarter()));

  const prev = getPreviousQuarter(year, quarter);
  const from = getMonthsForQuarter(prev.year, prev.quarter)[0];
  const to = getMonthsForQuarter(year, quarter)[2];

  const [ctx, records, overrides] = await Promise.all([
    loadAppContext(),
    getMonthlyKRAsBetween(from, to), // current + previous quarter only
    getGoLiveOverrides(year, quarter),
  ]);

  const employees = ctx.employees.filter((e) => e.active);
  const data = buildQuarterlyKRAs(employees, year, quarter, records, ctx.kras, ctx.settings, overrides);
  return { year, quarter, data, kras: ctx.kras.filter((k) => k.active), settings: ctx.settings, inactiveCount: ctx.employees.length - employees.length };
}

type Intent =
  | { intent: "override"; employeeId: string; value: number }
  | { intent: "clearOverride"; employeeId: string };

export async function clientAction({ request, params }: Route.ClientActionArgs): Promise<ActionResult> {
  try {
    const year = parseYearParam(params.year);
    const quarter = parseQuarterParam(params.quarter);
    if (year === null || quarter === null) return { ok: false, error: "Invalid quarter." };
    const body = await readJson<Intent>(request);
    if (body.intent === "override") {
      await setGoLiveOverride(body.employeeId, year, quarter, body.value);
      return { ok: true, message: "Go Live override applied." };
    }
    await clearGoLiveOverride(body.employeeId, year, quarter);
    return { ok: true, message: "Go Live reset to the automatic value." };
  } catch (error) {
    return fail(error);
  }
}

export default function QuarterlyPage({ loaderData }: Route.ComponentProps) {
  const { year, quarter, data, kras, settings, inactiveCount } = loaderData;
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionResult>();
  const [overriding, setOverriding] = useState<QuarterlyKRA | null>(null);
  const [value, setValue] = useState("");

  const goLive = findGoLiveKRA(kras);
  const prev = getPreviousQuarter(year, quarter as Quarter);
  const next = getNextQuarter(year, quarter as Quarter);
  const months = getMonthsForQuarter(year, quarter as Quarter);
  const hasData = data.some((q) => q.months.length > 0);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setOverriding(null);
  }, [fetcher.state, fetcher.data]);

  const remarks = useMemo(() => data.filter((q) => q.remarks.length > 0), [data]);
  const parsedValue = Number(value);
  const valueValid = value.trim() !== "" && Number.isFinite(parsedValue) && parsedValue >= 0 && (settings.allowAchievementOverride || !goLive || parsedValue <= goLive.weight);

  const send = (payload: Intent) => fetcher.submit(payload, { method: "post", encType: "application/json" });

  return (
    <>
      <PageHeader
        title={`Quarterly KRA — ${formatQuarter(year, quarter)}`}
        description={`${getMonthLabel(months[0])} – ${getMonthLabel(months[2])}. ${
          settings.quarterlyAggregation === "sum" ? "Monthly values are summed." : settings.treatMissingMonthsAsZero ? "Missing months count as zero." : "Averaged over months that have data."
        }`}
        actions={<Link to={`/export?year=${year}&quarter=${quarter}`} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Export this quarter</Link>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <label htmlFor="q-year" className="mb-1 block text-xs font-medium text-slate-500">Year</label>
          <select id="q-year" className={inputCls} value={year} onChange={(e) => navigate(path(Number(e.target.value), quarter))}>
            {getYearOptions([year]).map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="q-quarter" className="mb-1 block text-xs font-medium text-slate-500">Quarter</label>
          <select id="q-quarter" className={inputCls} value={quarter} onChange={(e) => navigate(path(year, Number(e.target.value)))}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <Link to={path(prev.year, prev.quarter)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">← {formatQuarter(prev.year, prev.quarter)}</Link>
          <Link to={path(next.year, next.quarter)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{formatQuarter(next.year, next.quarter)} →</Link>
        </div>
      </div>

      {fetcher.data?.ok && <Alert tone="success" className="mb-4">{fetcher.data.message}</Alert>}
      {fetcher.data && !fetcher.data.ok && !overriding && <Alert tone="error" className="mb-4">{fetcher.data.error}</Alert>}

      {data.length === 0 ? (
        <EmptyState title="No active employees" description="Add employees to see quarterly results.">
          <Link to="/employees" className="text-sm font-medium text-indigo-600 hover:underline">Go to Employees</Link>
        </EmptyState>
      ) : !hasData ? (
        <EmptyState title={`No KRA data for ${formatQuarter(year, quarter)}`} description="Enter monthly KRAs for this quarter to see the aggregation.">
          <Link to={`/monthly/${months[0].slice(0, 4)}/${months[0].slice(5)}`} className="text-sm font-medium text-indigo-600 hover:underline">Enter monthly KRA</Link>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="h-summary">
            <h2 id="h-summary" className="mb-2 text-sm font-semibold text-slate-800">Monthly achievement and quarterly average</h2>
            <QuarterlySummaryTable data={data} goLiveId={goLive?.id} />
          </section>

          <section aria-labelledby="h-cat">
            <h2 id="h-cat" className="mb-2 text-sm font-semibold text-slate-800">Category-wise quarterly achievement</h2>
            <QuarterlyCategoryTable data={data} kras={kras} />
          </section>

          {goLive && (
            <Card title={`${goLive.name} — carry-forward status`}>
              <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                {settings.goLiveCarryForward.enabled
                  ? `If an employee had Go Live in the previous quarter and none this quarter, ${formatNumber(settings.goLiveCarryForward.percentage)}% is applied automatically. You can override it per employee.`
                  : "Go Live carry-forward is turned off in Settings."}
              </p>
              <GoLivePanel
                data={data}
                onOverride={(q) => {
                  setValue(String(q.goLiveOverride ?? q.goLive?.total ?? 0));
                  setOverriding(q);
                }}
              />
            </Card>
          )}

          <Card title="Remarks">
            {remarks.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No remarks recorded this quarter.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {remarks.map((q) => (
                  <div key={q.employeeId} className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{q.employeeName}</p>
                    <dl className="mt-1 space-y-0.5 text-sm text-slate-700">
                      {q.remarks.map((r) => (
                        <div key={r.month} className="flex gap-2">
                          <dt className="w-20 shrink-0 text-slate-500">{getMonthLabel(r.month)}</dt>
                          <dd className="whitespace-pre-line">{r.text}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {inactiveCount > 0 && <p className="text-xs text-slate-500">{inactiveCount} deactivated employee(s) are not shown.</p>}
        </div>
      )}

      {overriding && (
        <Modal
          open
          onClose={() => setOverriding(null)}
          title={`Override Go Live — ${overriding.employeeName}`}
          footer={
            <>
              <Button onClick={() => setOverriding(null)} disabled={busy}>Cancel</Button>
              {overriding.goLiveOverride !== null && (
                <Button onClick={() => send({ intent: "clearOverride", employeeId: overriding.employeeId })} disabled={busy}>Reset to automatic</Button>
              )}
              <Button variant="primary" disabled={busy || !valueValid} onClick={() => send({ intent: "override", employeeId: overriding.employeeId, value: parsedValue })}>
                Confirm override
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              The automatic Go Live value for {formatQuarter(year, quarter)} is <strong>{formatNumber(overriding.goLive?.total ?? 0)}%</strong>
              {overriding.goLive && overriding.goLive.carryForward > 0 ? " (quarterly carry-forward)" : ""}. Overriding replaces it for this employee and quarter only, and is shown in reports and exports.
            </p>
            {fetcher.data && !fetcher.data.ok && <Alert tone="error">{fetcher.data.error}</Alert>}
            <Field
              label="Go Live value for the quarter"
              htmlFor="override-value"
              error={value !== "" && !valueValid ? `Enter a number between 0 and ${goLive?.weight ?? 100}.` : undefined}
              hint={goLive ? `Maximum ${goLive.weight} unless the override setting allows more.` : undefined}
            >
              <input id="override-value" type="number" step="any" min={0} className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
