/** Validation rules. All functions are pure and return a list of problems. */

import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";
import { isValidMonth } from "~/utils/dates";

export type ValidationError = {
  field: string;
  message: string;
};

const EPSILON = 1e-9;

export function sumActiveWeights(configs: Pick<KRAConfig, "active" | "weight">[]): number {
  return configs.filter((c) => c.active).reduce((sum, c) => sum + c.weight, 0);
}

/** SUM(active weights) must be exactly 100. */
export function validateKRAWeights(configs: Pick<KRAConfig, "active" | "weight">[]): ValidationError[] {
  const total = sumActiveWeights(configs);
  return Math.abs(total - 100) > EPSILON
    ? [{ field: "weight", message: `Total active KRA weight is ${round(total)}%. It must equal 100%.` }]
    : [];
}

export function validateKRAConfig(config: { name: string; weight: number }): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!config.name.trim()) errors.push({ field: "name", message: "KRA name is required." });
  if (!Number.isFinite(config.weight) || config.weight < 0 || config.weight > 100) {
    errors.push({ field: "weight", message: "KRA weight must be a number between 0 and 100." });
  }
  return errors;
}

/** Full validation of a proposed KRA list: each row, unique names, total weight. */
export function validateKRAConfigSet(configs: KRAConfig[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<string>();
  for (const c of configs) {
    for (const e of validateKRAConfig(c)) errors.push({ field: `${c.id}.${e.field}`, message: `${c.name || "(unnamed)"}: ${e.message}` });
    const key = c.name.trim().toLowerCase();
    if (key && seen.has(key)) errors.push({ field: `${c.id}.name`, message: `Duplicate KRA name "${c.name.trim()}".` });
    seen.add(key);
  }
  if (configs.filter((c) => c.isGoLive && c.active).length > 1) {
    errors.push({ field: "isGoLive", message: "Only one active KRA can be marked as Go Live." });
  }
  errors.push(...validateKRAWeights(configs));
  return errors;
}

/** 0 <= achievement <= weight (upper bound skipped when overrides are allowed). */
export function validateAchievement(
  value: number,
  weight: number,
  kraName: string,
  allowOverride: boolean = false,
): ValidationError[] {
  if (!Number.isFinite(value)) {
    return [{ field: kraName, message: `Achievement for "${kraName}" must be a valid number.` }];
  }
  const errors: ValidationError[] = [];
  if (value < 0) errors.push({ field: kraName, message: `Achievement for "${kraName}" cannot be negative.` });
  if (!allowOverride && value > weight + EPSILON) {
    errors.push({ field: kraName, message: `Achievement for "${kraName}" (${round(value)}) exceeds its weight (${round(weight)}).` });
  }
  return errors;
}

export function validateMonthlyEntry(
  achievements: Record<string, number>,
  kras: KRAConfig[],
  allowOverride: boolean = false,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const kra of kras) {
    if (!kra.active) continue;
    const value = achievements[kra.id];
    if (value === undefined) continue;
    errors.push(...validateAchievement(value, kra.weight, kra.name, allowOverride).map((e) => ({ ...e, field: kra.id })));
  }
  return errors;
}

export function validateEmployeeName(name: string, existing: Pick<Employee, "id" | "name">[] = [], selfId?: string): ValidationError[] {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [{ field: "name", message: "Employee name must be at least 2 characters." }];
  const dupe = existing.some((e) => e.id !== selfId && e.name.trim().toLowerCase() === trimmed.toLowerCase());
  return dupe ? [{ field: "name", message: `An employee named "${trimmed}" already exists.` }] : [];
}

export function validateMonth(month: string): ValidationError[] {
  return isValidMonth(month) ? [] : [{ field: "month", message: "Month must be a valid YYYY-MM value." }];
}

/** Returns the `employeeId|month` keys that appear more than once. */
export function findDuplicateMonthlyRecords(records: Pick<MonthlyKRA, "employeeId" | "month">[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of records) {
    const key = `${r.employeeId}|${r.month}`;
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return [...dupes];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
