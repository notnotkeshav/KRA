import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/export";
import { loadAppContext } from "~/db/context";
import { getMonthlyKRAsBetween, getMonthsWithData } from "~/db/repositories/monthly-kra";
import { getAllGoLiveOverrides } from "~/db/repositories/settings";
import { buildQuarterlyReport, flattenReport, reportFilename } from "~/domain/export";
import { buildQuarterlyKRAs } from "~/domain/kra/quarterly";
import type { ExportFormat } from "~/types/settings";
import { downloadBlob, downloadText, generateCSV } from "~/utils/csv";
import {
  getCurrentQuarter, getCurrentYear, getMonthsForQuarter, getPreviousQuarter,
  getQuarterFromMonth, getYearFromMonth, getYearOptions, parseQuarterParam, parseYearParam,
} from "~/utils/dates";
import { buildXlsx } from "~/utils/xlsx";
import { Alert, Button, EmptyState, PageHeader, inputCls } from "~/components/common/ui";
import { ReportView } from "~/components/export/ReportView";

export function meta() {
  return [{ title: "Export · KRA Management" }];
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const ctx = await loadAppContext();

  let year = parseYearParam(url.searchParams.get("year") ?? undefined);
  let quarter = parseQuarterParam(url.searchParams.get("quarter") ?? undefined);
  if (year === null || quarter === null) {
    // Default to the latest quarter that has data, else the current quarter.
    const months = await getMonthsWithData();
    const latest = months.at(-1);
    year = latest ? getYearFromMonth(latest) : getCurrentYear();
    quarter = latest ? getQuarterFromMonth(latest) : getCurrentQuarter();
  }

  const employeeId = url.searchParams.get("employee") ?? "";
  const selected = employeeId ? ctx.employees.filter((e) => e.id === employeeId) : ctx.employees.filter((e) => e.active);

  const prev = getPreviousQuarter(year, quarter);
  const [records, overrides] = await Promise.all([
    getMonthlyKRAsBetween(getMonthsForQuarter(prev.year, prev.quarter)[0], getMonthsForQuarter(year, quarter)[2]),
    getAllGoLiveOverrides(),
  ]);
  const data = buildQuarterlyKRAs(selected, year, quarter, records, ctx.kras, ctx.settings, overrides.filter((o) => o.year === year && o.quarter === quarter));
  const report = buildQuarterlyReport(data, ctx.kras, ctx.templates, year, quarter);
  const hasData = data.some((q) => q.months.length > 0);

  return { year, quarter, employeeId, employees: ctx.employees, report, hasData, selectedName: employeeId ? (selected[0]?.name ?? null) : null };
}

export default function ExportPage({ loaderData }: Route.ComponentProps) {
  const { year, quarter, employeeId, employees, report, hasData, selectedName } = loaderData;
  const navigate = useNavigate();
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [error, setError] = useState<string | null>(null);

  const go = (next: { year?: number; quarter?: number; employee?: string }) => {
    const params = new URLSearchParams({ year: String(next.year ?? year), quarter: `Q${next.quarter ?? quarter}` });
    const emp = next.employee ?? employeeId;
    if (emp) params.set("employee", emp);
    navigate(`/export?${params}`);
  };

  function runExport() {
    setError(null);
    try {
      const { rows, boldRows } = flattenReport(report);
      if (format === "csv") {
        downloadText(generateCSV(rows), reportFilename(year, quarter, selectedName, "csv"), "text/csv");
      } else if (format === "xlsx") {
        downloadBlob(buildXlsx(rows, boldRows, `Q${quarter} ${year}`), reportFilename(year, quarter, selectedName, "xlsx"));
      } else {
        window.print();
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("[kra] export failed", e);
      setError("The export could not be created. Please try again or use a different format.");
    }
  }

  return (
    <>
      <div className="no-print">
        <PageHeader title="Export" description="Download a quarterly KRA report. The export contains exactly what the Quarterly page shows." />

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div>
            <label htmlFor="x-year" className="mb-1 block text-xs font-medium text-slate-500">Year</label>
            <select id="x-year" className={inputCls} value={year} onChange={(e) => go({ year: Number(e.target.value) })}>
              {getYearOptions([year]).map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="x-quarter" className="mb-1 block text-xs font-medium text-slate-500">Quarter</label>
            <select id="x-quarter" className={inputCls} value={quarter} onChange={(e) => go({ quarter: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div className="min-w-44">
            <label htmlFor="x-emp" className="mb-1 block text-xs font-medium text-slate-500">Employee</label>
            <select id="x-emp" className={inputCls} value={employeeId} onChange={(e) => go({ employee: e.target.value })}>
              <option value="">All active employees</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.active ? "" : " (inactive)"}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="x-format" className="mb-1 block text-xs font-medium text-slate-500">Format</label>
            <select id="x-format" className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV</option>
              <option value="print">Print / PDF</option>
            </select>
          </div>
          <Button variant="primary" onClick={runExport} disabled={!hasData}>
            {format === "print" ? "Print / Save as PDF" : "Download"}
          </Button>
        </div>

        {error && <Alert tone="error" className="mb-4">{error}</Alert>}
        {format === "print" && hasData && (
          <Alert tone="info" className="mb-4">The print dialog opens with this report only. Choose “Save as PDF” as the destination to create a PDF.</Alert>
        )}
        {!hasData && (
          <EmptyState title={`No KRA data for Q${quarter} ${year}`} description="Choose a quarter with monthly records, or enter data first." />
        )}
      </div>

      {hasData && <ReportView report={report} />}
    </>
  );
}

