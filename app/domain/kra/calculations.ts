/** Pure KRA calculations. Nothing here rounds; rounding is a display concern. */

import type { KRAConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";

export type AggregationOptions = {
  method: "average" | "sum";
  /** Count missing months as zero when averaging. */
  treatMissingAsZero: boolean;
  expectedMonths: number;
};

export const DEFAULT_AGGREGATION: AggregationOptions = {
  method: "average",
  treatMissingAsZero: false,
  expectedMonths: 3,
};

export function sumValues(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/** Plain sum of an achievements record. */
export function calculateTotalAchievement(achievements: Record<string, number>): number {
  return sumValues(Object.values(achievements));
}

/**
 * Monthly total over the *active* KRAs only; missing entries count as 0.
 * This is what reports use, so disabled KRAs never leak into totals.
 */
export function calculateMonthlyAchievement(achievements: Record<string, number>, kras: KRAConfig[]): number {
  return sumValues(kras.filter((k) => k.active).map((k) => achievements[k.id] ?? 0));
}

export function calculateRemaining(weight: number, achievement: number): number {
  return Math.max(0, weight - achievement);
}

export function calculateMaxAchievement(kras: KRAConfig[]): number {
  return sumValues(kras.filter((k) => k.active).map((k) => k.weight));
}

function divisor(count: number, opts: AggregationOptions): number {
  if (opts.method === "sum") return 1;
  return opts.treatMissingAsZero ? opts.expectedMonths : count;
}

/** Aggregates monthly totals: sum / months-with-data by default. */
export function calculateQuarterlyAverage(monthlyTotals: number[], opts: AggregationOptions = DEFAULT_AGGREGATION): number {
  if (monthlyTotals.length === 0) return 0;
  return sumValues(monthlyTotals) / divisor(monthlyTotals.length, opts);
}

/** Aggregates one KRA's monthly values across the months that have records. */
export function calculateCategoryAchievement(
  records: MonthlyKRA[],
  kraId: string,
  opts: AggregationOptions = DEFAULT_AGGREGATION,
): number {
  if (records.length === 0) return 0;
  return sumValues(records.map((r) => r.achievements[kraId] ?? 0)) / divisor(records.length, opts);
}

/** Maximum a quarterly report can reach under the chosen aggregation. */
export function calculateQuarterlyMax(kras: KRAConfig[], monthsWithData: number, opts: AggregationOptions): number {
  const monthly = calculateMaxAchievement(kras);
  return opts.method === "sum" ? monthly * (opts.treatMissingAsZero ? opts.expectedMonths : monthsWithData) : monthly;
}
