/**
 * Quarterly report model. The on-screen print view, CSV and XLSX exports all
 * render this one structure, so exported values always match the application.
 */

import type { KRAConfig } from "~/types/kra";
import type { QuarterlyKRA } from "~/types/monthly-kra";
import type { KRATemplate } from "~/types/template";
import { formatQuarter, getMonthLabel, getMonthShortLabel } from "~/utils/dates";
import { roundTo } from "~/utils/formatting";
import { calculateMonthlyAchievement } from "./kra/calculations";
import { describeGoLiveSource } from "./kra/carry-forward";
import { krasForTemplate, templateName } from "./kra/templates";

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
  allKras: KRAConfig[],
  templates: KRATemplate[],
  year: number,
  quarter: number,
  generatedAt: string = new Date().toISOString(),
): QuarterlyReport {
  const quarterMonths = quarterlies[0]?.quarterMonths ?? [];

  // Templates that actually appear in the selection, in template order.
  const used = templates.filter((t) => quarterlies.some((q) => q.templateId === t.id));
  const multi = used.length > 1;
  const suffix = (t: KRATemplate) => (multi ? ` (${t.name})` : "");

  const summary: ReportSection = {
    heading: "Employee Summary",
    header: ["Employee", ...(multi ? ["Template"] : []), ...quarterMonths.map(getMonthLabel), "Quarterly Avg", "Max Possible"],
    rows: quarterlies.map((q) => [
      q.employeeName,
      ...(multi ? [templateName(templates, q.templateId)] : []),
      ...q.quarterMonths.map((m) => (m in q.monthlyTotals ? r2(q.monthlyTotals[m]) : "—")),
      r2(q.quarterlyAchievement),
      r2(q.maxPossible),
    ]),
  };

  const monthlySections: ReportSection[] = [];
  const categorySections: ReportSection[] = [];

  for (const template of used) {
    const kras = krasForTemplate(allKras, template.id, true);
    const group = quarterlies.filter((q) => q.templateId === template.id);
    const maxMonthly = kras.reduce((s, k) => s + k.weight, 0);

    const monthlyRows: ReportCell[][] = [["Weight", ...kras.map((k) => k.weight), "", maxMonthly, ""]];
    for (const q of group) {
      for (const rec of q.monthlyRecords) {
        monthlyRows.push([
          q.employeeName,
          ...kras.map((k) => r2(rec.achievements[k.id] ?? 0)),
          shortMonth(rec.month),
          r2(calculateMonthlyAchievement(rec.achievements, kras)),
          rec.remarks?.trim() ?? "",
        ]);
      }
      if (q.monthlyRecords.length === 0) {
        monthlyRows.push([q.employeeName, ...kras.map(() => "—"), "No data", "—", ""]);
      }
    }
    monthlySections.push({
      heading: `KRA Development — Monthly KRA${suffix(template)}`,
      header: ["Employee", ...kras.map((k) => k.name), "Month", "Total Achv.", "Remarks"],
      rows: monthlyRows,
      boldRows: [0],
    });

    categorySections.push({
      heading: `Quarterly Category Summary${suffix(template)}`,
      header: ["Employee", ...kras.map((k) => k.name), "Quarterly Total", "Max Possible"],
      rows: [
        ["Weight", ...kras.map((k) => k.weight), maxMonthly, ""],
        ...group.map((q): ReportCell[] => [
          q.employeeName,
          ...kras.map((k) => r2(q.categories[k.id]?.final ?? 0)),
          r2(q.quarterlyAchievement),
          r2(q.maxPossible),
        ]),
      ],
      boldRows: [0],
    });
  }

  const notes: ReportSection = {
    heading: "Go Live Carry-forward Notes",
    header: ["Employee", "Go Live", "Source", "Note"],
    rows: quarterlies.map((q): ReportCell[] => {
      if (!q.goLive) return [q.employeeName, "—", "—", "No Go Live KRA configured."];
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
    sections: [summary, ...monthlySections, ...categorySections, notes],
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
