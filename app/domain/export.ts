/**
 * Quarterly report model. The on-screen print view, CSV and XLSX exports all
 * render this one structure, so exported values always match the application.
 */

import type { KRAConfig } from "~/types/kra";
import type { QuarterlyKRA } from "~/types/monthly-kra";
import { formatQuarter, getMonthLabel, getMonthShortLabel } from "~/utils/dates";
import { roundTo } from "~/utils/formatting";
import { calculateMonthlyAchievement } from "./kra/calculations";
import { describeGoLiveSource } from "./kra/carry-forward";

export type ReportCell = string | number;

export type ReportSection = {
  heading: string;
  header: ReportCell[];
  rows: ReportCell[][];
  /** Indexes into `rows` rendered in bold (e.g. a weights row). */
  boldRows?: number[];
};

export type QuarterlyReport = {
  title: string;
  subtitle: string;
  generatedAt: string;
  sections: ReportSection[];
};

const r2 = (n: number) => roundTo(n, 2);

function shortMonth(month: string): string {
  return `${getMonthShortLabel(month)}-${month.slice(2, 4)}`;
}

export function buildQuarterlyReport(
  quarterlies: QuarterlyKRA[],
  kras: KRAConfig[],
  year: number,
  quarter: number,
  generatedAt: string = new Date().toISOString(),
): QuarterlyReport {
  const active = kras.filter((k) => k.active).sort((a, b) => a.order - b.order);
  const quarterMonths = quarterlies[0]?.quarterMonths ?? [];
  const maxMonthly = active.reduce((s, k) => s + k.weight, 0);

  const summary: ReportSection = {
    heading: "Employee Summary",
    header: ["Employee", ...quarterMonths.map(getMonthLabel), "Quarterly Avg", "Max Possible"],
    rows: quarterlies.map((q) => [
      q.employeeName,
      ...q.quarterMonths.map((m) => (m in q.monthlyTotals ? r2(q.monthlyTotals[m]) : "—")),
      r2(q.quarterlyAchievement),
      r2(q.maxPossible),
    ]),
  };

  const monthlyRows: ReportCell[][] = [["Weight", ...active.map((k) => k.weight), "", maxMonthly, ""]];
  for (const q of quarterlies) {
    for (const rec of q.monthlyRecords) {
      monthlyRows.push([
        q.employeeName,
        ...active.map((k) => r2(rec.achievements[k.id] ?? 0)),
        shortMonth(rec.month),
        r2(calculateMonthlyAchievement(rec.achievements, kras)),
        rec.remarks?.trim() ?? "",
      ]);
    }
    if (q.monthlyRecords.length === 0) {
      monthlyRows.push([q.employeeName, ...active.map(() => "—"), "No data", "—", ""]);
    }
  }
  const monthly: ReportSection = {
    heading: "KRA Development — Monthly KRA",
    header: ["Employee", ...active.map((k) => k.name), "Month", "Total Achv.", "Remarks"],
    rows: monthlyRows,
    boldRows: [0],
  };

  const categories: ReportSection = {
    heading: "Quarterly Category Summary",
    header: ["Employee", ...active.map((k) => k.name), "Quarterly Total", "Max Possible"],
    rows: [
      ["Weight", ...active.map((k) => k.weight), maxMonthly, ""],
      ...quarterlies.map((q): ReportCell[] => [
        q.employeeName,
        ...active.map((k) => r2(q.categories[k.id]?.final ?? 0)),
        r2(q.quarterlyAchievement),
        r2(q.maxPossible),
      ]),
    ],
    boldRows: [0],
  };

  const notes: ReportSection = {
    heading: "Go Live Carry-forward Notes",
    header: ["Employee", "Go Live", "Source", "Note"],
    rows: quarterlies.map((q): ReportCell[] => {
      const goLiveId = kras.find((k) => k.active && k.isGoLive)?.id;
      if (!q.goLive || !goLiveId) return [q.employeeName, "—", "—", "No Go Live KRA configured."];
      const value = q.goLiveOverride ?? q.goLive.total;
      if (q.goLiveOverride !== null) {
        return [q.employeeName, r2(value), "Manual override", `Overridden to ${r2(q.goLiveOverride)} (automatic value was ${r2(q.goLive.total)}).`];
      }
      if (q.goLive.carryForward > 0) {
        return [
          q.employeeName,
          r2(value),
          describeGoLiveSource(q.goLive.source),
          `${r2(q.goLive.carryForward)}% carried forward: Go Live achieved last quarter, none this quarter.`,
        ];
      }
      return [q.employeeName, r2(value), describeGoLiveSource(q.goLive.source), "No carry-forward applied."];
    }),
  };

  return {
    title: "KRA Development",
    subtitle: `Quarterly KRA Report — ${formatQuarter(year, quarter)}`,
    generatedAt,
    sections: [summary, monthly, categories, notes],
  };
}

/** Flattens a report into spreadsheet rows. Used by both CSV and XLSX. */
export function flattenReport(report: QuarterlyReport): { rows: ReportCell[][]; boldRows: number[] } {
  const rows: ReportCell[][] = [];
  const bold: number[] = [];
  const push = (row: ReportCell[], isBold = false) => {
    if (isBold) bold.push(rows.length);
    rows.push(row);
  };

  push([report.title], true);
  push([report.subtitle], true);
  push([`Generated: ${new Date(report.generatedAt).toLocaleString()}`]);

  for (const section of report.sections) {
    push([]);
    push([section.heading], true);
    push(section.header, true);
    section.rows.forEach((row, i) => push(row, section.boldRows?.includes(i)));
  }
  return { rows, boldRows: bold };
}

export function reportFilename(year: number, quarter: number, employeeName: string | null, ext: string): string {
  const who = employeeName ? `-${employeeName.replace(/[^a-z0-9]+/gi, "_")}` : "";
  return `KRA-Q${quarter}-${year}${who}.${ext}`;
}
