import type { QuarterlyReport } from "~/domain/export";

/** On-screen / print rendering of the report model (same data as CSV and XLSX). */
export function ReportView({ report }: { report: QuarterlyReport }) {
  return (
    <article className="print-report rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 border-b border-slate-200 pb-3">
        <h2 className="text-lg font-semibold text-slate-900">{report.title}</h2>
        <p className="text-sm text-slate-700">{report.subtitle}</p>
        <p className="text-xs text-slate-500">Generated {new Date(report.generatedAt).toLocaleString()}</p>
      </header>
      {report.sections.map((section) => (
        <section key={section.heading} className="mb-5 last:mb-0">
          <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{section.heading}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-left">
                  {section.header.map((h, i) => (
                    <th key={i} className="border border-slate-300 px-2 py-1 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, r) => (
                  <tr key={r} className={section.boldRows?.includes(r) ? "bg-slate-50 font-semibold" : ""}>
                    {row.map((cell, c) => (
                      <td key={c} className={`border border-slate-300 px-2 py-1 align-top ${typeof cell === "number" ? "text-right tabular-nums" : "whitespace-pre-line"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </article>
  );
}
