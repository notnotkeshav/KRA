import { Link } from "react-router";
import type { KRAConfig } from "~/types/kra";
import type { QuarterlyKRA } from "~/types/monthly-kra";
import { describeGoLiveSource } from "~/domain/kra/carry-forward";
import { getMonthLabel } from "~/utils/dates";
import { formatNumber, shortKraName } from "~/utils/formatting";
import { Badge, cardCls } from "~/components/common/ui";

const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500";

export function QuarterlySummaryTable({ data }: { data: QuarterlyKRA[] }) {
  const months = data[0]?.quarterMonths ?? [];
  return (
    <div className={`${cardCls} overflow-x-auto`}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className={th}>Employee</th>
            {months.map((m) => <th key={m} className={`${th} text-right`}>{getMonthLabel(m)}</th>)}
            <th className={`${th} text-right`}>Quarterly Avg</th>
            <th className={`${th} text-right`}>Max Possible</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((q) => {
            const adjusted = !!q.goLive && Math.abs(q.quarterlyAchievement - q.monthlyAverage) > 1e-9;
            return (
              <tr key={q.employeeId}>
                <td className="px-3 py-2 font-medium">
                  <Link to={`/employees/${q.employeeId}`} className="text-indigo-700 hover:underline">{q.employeeName}</Link>
                </td>
                {q.quarterMonths.map((m) => (
                  <td key={m} className="px-3 py-2 text-right tabular-nums">
                    {m in q.monthlyTotals ? (
                      <Link to={`/monthly/${m.slice(0, 4)}/${m.slice(5)}/${q.employeeId}`} className="hover:underline">{formatNumber(q.monthlyTotals[m])}</Link>
                    ) : (
                      <span className="text-slate-400" title="No record for this month">—</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {q.months.length === 0 ? <span className="font-normal text-slate-400">—</span> : formatNumber(q.quarterlyAchievement)}
                  {adjusted && q.months.length > 0 && (
                    <div className="text-xs font-normal text-slate-500">
                      {formatNumber(q.monthlyAverage)} avg {q.quarterlyAchievement >= q.monthlyAverage ? "+" : "−"} Go Live adj.
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatNumber(q.maxPossible)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Category columns are generated from the KRA configuration. */
export function QuarterlyCategoryTable({ data, kras }: { data: QuarterlyKRA[]; kras: KRAConfig[] }) {
  return (
    <div className={`${cardCls} overflow-x-auto`}>
      <table className="table-sticky min-w-full divide-y divide-slate-200 text-sm">
        <thead className="text-left">
          <tr>
            <th className={th}>Employee</th>
            {kras.map((k) => (
              <th key={k.id} className={`${th} text-right`} title={k.name}>
                <span className="block normal-case">{shortKraName(k.name)}</span>
                <span className="font-normal normal-case text-slate-400">of {formatNumber(k.weight)}</span>
              </th>
            ))}
            <th className={`${th} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((q) => (
            <tr key={q.employeeId}>
              <td className="px-3 py-2 font-medium">{q.employeeName}</td>
              {kras.map((k) => {
                const c = q.categories[k.id];
                const isGoLive = !!k.isGoLive;
                const tag = isGoLive && q.goLiveOverride !== null ? "override" : isGoLive && q.goLive && q.goLive.carryForward > 0 ? "carry-fwd" : null;
                return (
                  <td key={k.id} className="px-3 py-2 text-right tabular-nums">
                    {q.months.length === 0 ? <span className="text-slate-400">—</span> : formatNumber(c?.final ?? 0)}
                    {tag && <div><Badge tone={tag === "override" ? "amber" : "indigo"}>{tag}</Badge></div>}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {q.months.length === 0 ? <span className="font-normal text-slate-400">—</span> : formatNumber(q.quarterlyAchievement)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GoLivePanel({
  data,
  onOverride,
}: {
  data: QuarterlyKRA[];
  onOverride: (q: QuarterlyKRA) => void;
}) {
  return (
    <ul className="divide-y divide-slate-100">
      {data.map((q) => {
        const auto = q.goLive;
        const overridden = q.goLiveOverride !== null;
        const value = overridden ? q.goLiveOverride! : (auto?.total ?? 0);
        return (
          <li key={q.employeeId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{q.employeeName}</p>
              {q.months.length === 0 ? (
                <p className="text-sm text-slate-500">No data this quarter.</p>
              ) : (
                <>
                  <p className="text-sm text-slate-700">Go Live achievement: <span className="font-semibold">{formatNumber(value)}%</span></p>
                  <p className="text-xs text-slate-500">
                    Source: {overridden ? "Manual override" : describeGoLiveSource(auto?.source ?? "manual")}
                    {overridden && auto && <> (automatic value: {formatNumber(auto.total)}%)</>}
                    {!overridden && auto && auto.carryForward > 0 && <> — {formatNumber(auto.carryForward)}% applied automatically</>}
                  </p>
                </>
              )}
            </div>
            {auto && q.months.length > 0 && (
              <button
                type="button"
                onClick={() => onOverride(q)}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {overridden ? "Edit override" : "Override"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
