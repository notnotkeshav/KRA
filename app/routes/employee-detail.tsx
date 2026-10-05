import { Link } from "react-router";
import type { Route } from "./+types/employee-detail";
import { loadAppContext } from "~/db/context";
import { getMonthlyKRAsForEmployee } from "~/db/repositories/monthly-kra";
import { getAllGoLiveOverrides } from "~/db/repositories/settings";
import { calculateMonthlyAchievement } from "~/domain/kra/calculations";
import { describeGoLiveSource } from "~/domain/kra/carry-forward";
import { buildQuarterlyKRA } from "~/domain/kra/quarterly";
import { krasForTemplate, templateName } from "~/domain/kra/templates";
import { type Quarter, formatMonth, getQuarterFromMonth, getYearFromMonth } from "~/utils/dates";
import { formatNumber, shortKraName } from "~/utils/formatting";
import { Badge, Card, EmptyState, PageHeader, cardCls } from "~/components/common/ui";

export function meta() {
  return [{ title: "Employee · KRA Management" }];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const ctx = await loadAppContext();
  const employee = ctx.employees.find((e) => e.id === params.employeeId);
  if (!employee) throw new Response("Employee not found", { status: 404, statusText: "Employee not found" });

  const [records, overrides] = await Promise.all([getMonthlyKRAsForEmployee(employee.id), getAllGoLiveOverrides()]);

  const periods = new Map<string, { year: number; quarter: Quarter }>();
  for (const r of records) {
    const year = getYearFromMonth(r.month);
    const quarter = getQuarterFromMonth(r.month);
    periods.set(`${year}-${quarter}`, { year, quarter });
  }
  const quarterly = [...periods.values()]
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
    .map((p) => buildQuarterlyKRA(employee, p.year, p.quarter, records, ctx.kras, ctx.settings, overrides));

  const templateKras = krasForTemplate(ctx.kras, employee.templateId);
  return {
    employee,
    templateLabel: templateName(ctx.templates, employee.templateId),
    kras: templateKras.filter((k) => k.active),
    records: [...records].reverse(),
    quarterly,
    allKras: templateKras,
  };
}

export default function EmployeeDetail({ loaderData }: Route.ComponentProps) {
  const { employee, templateLabel, kras, records, quarterly, allKras } = loaderData;
  const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <>
      <PageHeader
        title={employee.name}
        description={[employee.designation, employee.employeeCode && `Code ${employee.employeeCode}`, `${templateLabel} template`].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            {employee.active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}
            <Link to="/employees" className="text-sm font-medium text-indigo-600 hover:underline">← All employees</Link>
          </>
        }
      />

      {records.length === 0 ? (
        <EmptyState title="No KRA history yet" description="Monthly records for this employee will appear here.">
          <Link to="/monthly" className="text-sm font-medium text-indigo-600 hover:underline">Enter monthly KRA</Link>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <Card title="Quarterly performance">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className={th}>Quarter</th>
                    <th className={`${th} text-right`}>Months with data</th>
                    <th className={`${th} text-right`}>Quarterly Avg</th>
                    <th className={`${th} text-right`}>Max</th>
                    <th className={th}>Go Live</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quarterly.map((q) => (
                    <tr key={`${q.year}-${q.quarter}`}>
                      <td className="px-3 py-2 font-medium">
                        <Link to={`/quarterly/${q.year}/Q${q.quarter}`} className="text-indigo-700 hover:underline">Q{q.quarter} {q.year}</Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{q.months.length} / 3</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(q.quarterlyAchievement)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatNumber(q.maxPossible)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {q.goLiveOverride !== null
                          ? `${formatNumber(q.goLiveOverride)}% · Manual override`
                          : q.goLive
                            ? `${formatNumber(q.goLive.total)}% · ${describeGoLiveSource(q.goLive.source)}`
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <section aria-labelledby="h-history">
            <h2 id="h-history" className="mb-2 text-sm font-semibold text-slate-800">Monthly history</h2>
            <div className={`${cardCls} overflow-x-auto`}>
              <table className="table-sticky min-w-full divide-y divide-slate-200 text-sm">
                <thead className="text-left">
                  <tr>
                    <th className={th}>Month</th>
                    {kras.map((k) => <th key={k.id} className={`${th} text-right`} title={k.name}><span className="normal-case">{shortKraName(k.name)}</span></th>)}
                    <th className={`${th} text-right`}>Total</th>
                    <th className={th}>Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">
                        <Link to={`/monthly/${r.month.slice(0, 4)}/${r.month.slice(5)}/${employee.id}`} className="text-indigo-700 hover:underline">{formatMonth(r.month)}</Link>
                      </td>
                      {kras.map((k) => <td key={k.id} className="px-3 py-2 text-right tabular-nums">{formatNumber(r.achievements[k.id] ?? 0)}</td>)}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(calculateMonthlyAchievement(r.achievements, allKras))}</td>
                      <td className="max-w-xs whitespace-pre-line px-3 py-2 text-slate-600">{r.remarks ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
