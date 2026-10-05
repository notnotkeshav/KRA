import type { ImportPreview, ImportRow } from "~/types/settings";
import { getMonthLabel } from "~/utils/dates";
import { formatNumber } from "~/utils/formatting";
import { Badge, cardCls } from "~/components/common/ui";

const statusBadge = {
  ready: <Badge tone="green">Ready</Badge>,
  warning: <Badge tone="amber">Warning</Badge>,
  error: <Badge tone="red">Error</Badge>,
} as const;

export function summarizeRows(rows: ImportRow[]) {
  return {
    ready: rows.filter((r) => r.status === "ready").length,
    warning: rows.filter((r) => r.status === "warning").length,
    error: rows.filter((r) => r.status === "error").length,
    existing: rows.filter((r) => r.status !== "error" && r.existingRecordId).length,
  };
}

export function ImportPreviewTable({ preview }: { preview: ImportPreview }) {
  const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500";
  return (
    <div className={`${cardCls} overflow-x-auto`}>
      <table className="table-sticky min-w-full divide-y divide-slate-200 text-sm">
        <thead className="text-left">
          <tr>
            <th className={th}>Row</th>
            <th className={th}>Employee</th>
            <th className={th}>Month</th>
            <th className={`${th} text-right`}>Calculated</th>
            <th className={`${th} text-right`}>Imported</th>
            <th className={th}>Status</th>
            <th className={th}>Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {preview.rows.map((r) => (
            <tr key={r.rowNumber} className={r.status === "error" ? "bg-red-50/60" : r.status === "warning" ? "bg-amber-50/50" : ""}>
              <td className="px-3 py-2 tabular-nums text-slate-500">{r.rowNumber}</td>
              <td className="px-3 py-2 font-medium">{r.employeeName || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2">{r.month ? getMonthLabel(r.month) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.calculatedTotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.importedTotal === null ? "—" : formatNumber(r.importedTotal)}</td>
              <td className="px-3 py-2">{statusBadge[r.status]}</td>
              <td className="px-3 py-2 text-xs">
                <ul className="space-y-0.5">
                  {r.errors.map((e, i) => <li key={`e${i}`} className="text-red-700">{e.field}: {e.message}</li>)}
                  {r.warnings.map((w, i) => <li key={`w${i}`} className="text-amber-800">{w.field}: {w.message}</li>)}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
