/** Quarterly aggregation of monthly KRA records. Pure and React-free. */

import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { GoLiveOverride, MonthlyKRA, QuarterlyCategory, QuarterlyKRA } from "~/types/monthly-kra";
import type { AppSettings } from "~/types/settings";
import { getMonthsForQuarter, getPreviousQuarter } from "~/utils/dates";
import type { Quarter } from "~/utils/dates";
import {
  type AggregationOptions,
  calculateCategoryAchievement,
  calculateMonthlyAchievement,
  calculateQuarterlyAverage,
  calculateQuarterlyMax,
  sumValues,
} from "./calculations";
import { calculateGoLiveCarryForward } from "./carry-forward";
import { krasForTemplate } from "./templates";

export function aggregationFromSettings(settings: AppSettings): AggregationOptions {
  return {
    method: settings.quarterlyAggregation,
    treatMissingAsZero: settings.treatMissingMonthsAsZero,
    expectedMonths: 3,
  };
}

export function overrideId(employeeId: string, year: number, quarter: number): string {
  return `goLiveOverride:${employeeId}:${year}-Q${quarter}`;
}

export function findGoLiveKRA(kras: KRAConfig[]): KRAConfig | undefined {
  return kras.find((k) => k.active && k.isGoLive);
}

/**
 * Builds the quarterly summary for one employee, scored against the KRAs of
 * the employee's template (`allKras` may contain every template's KRAs).
 * `employeeRecords` may contain any months; only the quarter and the previous
 * quarter are used.
 */
export function buildQuarterlyKRA(
  employee: Pick<Employee, "id" | "name" | "templateId">,
  year: number,
  quarter: Quarter,
  employeeRecords: MonthlyKRA[],
  allKras: KRAConfig[],
  settings: AppSettings,
  overrides: GoLiveOverride[] = [],
): QuarterlyKRA {
  const kras = krasForTemplate(allKras, employee.templateId);
  const opts = aggregationFromSettings(settings);
  const activeKras = kras.filter((k) => k.active);
  const quarterMonths = getMonthsForQuarter(year, quarter);

  const mine = employeeRecords.filter((r) => r.employeeId === employee.id);
  const currentRecords = mine
    .filter((r) => quarterMonths.includes(r.month))
    .sort((a, b) => a.month.localeCompare(b.month));
  const months = currentRecords.map((r) => r.month);

  const monthlyTotals: Record<string, number> = {};
  for (const r of currentRecords) monthlyTotals[r.month] = calculateMonthlyAchievement(r.achievements, kras);

  const monthlyAverage = calculateQuarterlyAverage(Object.values(monthlyTotals), opts);

  const categories: Record<string, QuarterlyCategory> = {};
  for (const kra of activeKras) {
    const manual = calculateCategoryAchievement(currentRecords, kra.id, opts);
    categories[kra.id] = { manual, final: manual };
  }

  // Go Live carry-forward / override.
  const goLiveKra = findGoLiveKRA(kras);
  let goLive: QuarterlyKRA["goLive"] = null;
  let goLiveOverride: number | null = null;

  if (goLiveKra) {
    const prev = getPreviousQuarter(year, quarter);
    const prevMonths = getMonthsForQuarter(prev.year, prev.quarter);
    const previousRecords = mine.filter((r) => prevMonths.includes(r.month));

    goLive = calculateGoLiveCarryForward({
      currentRecords,
      previousRecords,
      goLiveKraId: goLiveKra.id,
      config: settings.goLiveCarryForward,
      goLiveWeight: goLiveKra.weight,
      manualQuarterly: categories[goLiveKra.id].manual,
      allowOverCap: settings.allowAchievementOverride,
    });

    const override = overrides.find((o) => o.employeeId === employee.id && o.year === year && o.quarter === quarter);
    if (override) goLiveOverride = override.value;

    categories[goLiveKra.id].final = goLiveOverride ?? goLive.total;
  }

  const quarterlyAchievement = sumValues(Object.values(categories).map((c) => c.final));
  const maxPossible = calculateQuarterlyMax(kras, months.length, opts);

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    templateId: employee.templateId,
    year,
    quarter,
    quarterMonths,
    months,
    monthlyRecords: currentRecords,
    monthlyTotals,
    categories,
    monthlyAverage,
    quarterlyAchievement,
    maxPossible,
    goLive,
    goLiveOverride,
    remarks: currentRecords
      .filter((r) => r.remarks?.trim())
      .map((r) => ({ month: r.month, text: r.remarks!.trim() })),
  };
}

/** Summaries for the given employees (callers decide whether to include inactive ones). */
export function buildQuarterlyKRAs(
  employees: Pick<Employee, "id" | "name" | "templateId">[],
  year: number,
  quarter: Quarter,
  records: MonthlyKRA[],
  kras: KRAConfig[],
  settings: AppSettings,
  overrides: GoLiveOverride[] = [],
): QuarterlyKRA[] {
  return employees.map((e) => buildQuarterlyKRA(e, year, quarter, records, kras, settings, overrides));
}
