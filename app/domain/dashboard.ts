/** Dashboard figures, computed from already-loaded records. Pure. */

import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { GoLiveOverride, MonthlyKRA, QuarterlyKRA } from "~/types/monthly-kra";
import type { AppSettings } from "~/types/settings";
import type { KRATemplate } from "~/types/template";
import {
  type Quarter, getMonthsForQuarter, getPreviousQuarter, getQuarterFromMonth, getYearFromMonth, shiftMonth,
} from "~/utils/dates";
import { calculateMaxAchievement, calculateMonthlyAchievement, sumValues } from "./kra/calculations";
import { buildQuarterlyKRAs } from "./kra/quarterly";
import { krasForTemplate } from "./kra/templates";

export type Performer = { employeeId: string; name: string; total: number };

export type DashboardData = {
  referenceMonth: string;
  referenceQuarter: { year: number; quarter: Quarter };
  /** True when the real current month has no data and the latest month with data is shown instead. */
  usingFallbackMonth: boolean;
  activeEmployees: number;
  maxMonthly: number;
  monthlyAverage: number | null;
  highest: Performer | null;
  lowest: Performer | null;
  /** Average per KRA, one block per template that has records in the reference month. */
  byTemplate: { template: KRATemplate; employees: number; items: { kra: KRAConfig; average: number }[] }[];
  monthlyTrend: { month: string; values: { name: string; total: number | null }[] }[];
  quarterlyTrend: { year: number; quarter: Quarter; values: { name: string; total: number | null }[] }[];
  goLive: QuarterlyKRA[];
};

export function pickReferenceMonth(currentMonth: string, monthsWithData: string[]): { month: string; fallback: boolean } {
  if (monthsWithData.includes(currentMonth) || monthsWithData.length === 0) return { month: currentMonth, fallback: false };
  const latest = [...monthsWithData].sort().at(-1)!;
  return { month: latest, fallback: true };
}

/** First month that must be loaded: the quarter four quarters before the reference quarter, plus one earlier for carry-forward. */
export function dashboardRangeStart(referenceMonth: string): string {
  let y = getYearFromMonth(referenceMonth);
  let q = getQuarterFromMonth(referenceMonth);
  for (let i = 0; i < 4; i++) ({ year: y, quarter: q } = getPreviousQuarter(y, q));
  return getMonthsForQuarter(y, q)[0];
}

export function buildDashboard(
  referenceMonth: string,
  fallback: boolean,
  employees: Employee[],
  templates: KRATemplate[],
  kras: KRAConfig[],
  settings: AppSettings,
  records: MonthlyKRA[],
  overrides: GoLiveOverride[],
): DashboardData {
  const active = employees.filter((e) => e.active);
  const year = getYearFromMonth(referenceMonth);
  const quarter = getQuarterFromMonth(referenceMonth);

  const monthRecords = records.filter((r) => r.month === referenceMonth && active.some((e) => e.id === r.employeeId));
  const performers: Performer[] = monthRecords.map((r) => ({
    employeeId: r.employeeId,
    name: active.find((e) => e.id === r.employeeId)!.name,
    total: calculateMonthlyAchievement(r.achievements, krasForTemplate(kras, active.find((e) => e.id === r.employeeId)!.templateId)),
  }));
  const sorted = [...performers].sort((a, b) => b.total - a.total);

  const byTemplate = templates
    .map((template) => {
      const ids = new Set(active.filter((e) => e.templateId === template.id).map((e) => e.id));
      const recs = monthRecords.filter((r) => ids.has(r.employeeId));
      const items = krasForTemplate(kras, template.id, true).map((kra) => ({
        kra,
        average: recs.length ? sumValues(recs.map((r) => r.achievements[kra.id] ?? 0)) / recs.length : 0,
      }));
      return { template, employees: recs.length, items };
    })
    .filter((t) => t.employees > 0);

  const monthlyTrend = [5, 4, 3, 2, 1, 0]
    .map((back) => shiftMonth(referenceMonth, -back))
    .map((month) => ({
      month,
      values: active.map((e) => {
        const r = records.find((x) => x.employeeId === e.id && x.month === month);
        return { name: e.name, total: r ? calculateMonthlyAchievement(r.achievements, krasForTemplate(kras, e.templateId)) : null };
      }),
    }))
    .filter((m) => m.values.some((v) => v.total !== null));

  const quarters: { year: number; quarter: Quarter }[] = [];
  let cursor = { year, quarter };
  for (let i = 0; i < 4; i++) {
    quarters.unshift(cursor);
    cursor = getPreviousQuarter(cursor.year, cursor.quarter);
  }
  const quarterlyTrend = quarters
    .map((p) => {
      const qs = buildQuarterlyKRAs(active, p.year, p.quarter, records, kras, settings, overrides);
      return { ...p, values: qs.map((q) => ({ name: q.employeeName, total: q.months.length ? q.quarterlyAchievement : null })) };
    })
    .filter((q) => q.values.some((v) => v.total !== null));

  return {
    referenceMonth,
    referenceQuarter: { year, quarter },
    usingFallbackMonth: fallback,
    activeEmployees: active.length,
    maxMonthly: Math.max(100, ...templates.map((t) => calculateMaxAchievement(krasForTemplate(kras, t.id)))),
    monthlyAverage: performers.length ? sumValues(performers.map((p) => p.total)) / performers.length : null,
    highest: sorted[0] ?? null,
    lowest: sorted.length > 1 ? sorted.at(-1)! : null,
    byTemplate,
    monthlyTrend,
    quarterlyTrend,
    goLive: buildQuarterlyKRAs(active, year, quarter, records, kras, settings, overrides),
  };
}
