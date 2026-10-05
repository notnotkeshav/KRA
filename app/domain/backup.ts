/** Backup schema validation. Runs before anything touches IndexedDB. */

import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";
import type { BackupData } from "~/types/settings";
import { isValidMonth } from "~/utils/dates";
import { findDuplicateMonthlyRecords, validateKRAWeights } from "./kra/validation";

export type ParsedBackup = {
  version: 1;
  exportedAt: string;
  employees: Employee[];
  kraConfig: KRAConfig[];
  monthlyKRA: MonthlyKRA[];
  settings: { id: string }[];
};

export type BackupValidation =
  | { ok: true; backup: ParsedBackup }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 10;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateBackup(input: unknown): BackupValidation {
  const errors: string[] = [];
  const err = (m: string) => {
    if (errors.length < MAX_ERRORS) errors.push(m);
  };

  if (!isRecord(input)) return { ok: false, errors: ["The file is not a KRA backup (expected a JSON object)."] };
  if (input.version !== 1) return { ok: false, errors: [`Unsupported backup version: ${String(input.version)}. Expected 1.`] };

  for (const key of ["employees", "kraConfig", "monthlyKRA", "settings"] as const) {
    if (!Array.isArray(input[key])) err(`"${key}" must be an array.`);
  }
  if (errors.length) return { ok: false, errors };

  const employees = input.employees as unknown[];
  const kraConfig = input.kraConfig as unknown[];
  const monthly = input.monthlyKRA as unknown[];
  const settings = input.settings as unknown[];

  employees.forEach((e, i) => {
    if (!isRecord(e) || !isStr(e.id) || !isStr(e.name) || typeof e.active !== "boolean") {
      err(`employees[${i}] needs id, name and active.`);
    }
  });
  kraConfig.forEach((k, i) => {
    if (!isRecord(k) || !isStr(k.id) || !isStr(k.name) || !isNum(k.weight) || typeof k.active !== "boolean" || !isNum(k.order)) {
      err(`kraConfig[${i}] needs id, name, weight, active and order.`);
    }
  });
  monthly.forEach((m, i) => {
    if (!isRecord(m) || !isStr(m.id) || !isStr(m.employeeId) || !isStr(m.month) || !isValidMonth(m.month)) {
      err(`monthlyKRA[${i}] needs id, employeeId and a YYYY-MM month.`);
    } else if (!isRecord(m.achievements) || !Object.values(m.achievements).every(isNum)) {
      err(`monthlyKRA[${i}].achievements must map KRA ids to numbers.`);
    }
  });
  settings.forEach((s, i) => {
    if (!isRecord(s) || !isStr(s.id)) err(`settings[${i}] needs an id.`);
  });
  if (errors.length) return { ok: false, errors };

  const emps = employees as Employee[];
  const kras = kraConfig as KRAConfig[];
  const recs = monthly as MonthlyKRA[];

  const ids = new Set(emps.map((e) => e.id));
  if (ids.size !== emps.length) err("Duplicate employee ids.");
  const names = new Set(emps.map((e) => e.name.trim().toLowerCase()));
  if (names.size !== emps.length) err("Duplicate employee names.");
  if (new Set(kras.map((k) => k.id)).size !== kras.length) err("Duplicate KRA ids.");
  if (new Set(recs.map((r) => r.id)).size !== recs.length) err("Duplicate monthly record ids.");
  if (kras.length > 0) validateKRAWeights(kras).forEach((e) => err(e.message));
  findDuplicateMonthlyRecords(recs).forEach((k) => err(`Duplicate monthly record for ${k.replace("|", " / ")}.`));
  recs.forEach((r) => {
    if (!ids.has(r.employeeId)) err(`Monthly record ${r.id} references unknown employee ${r.employeeId}.`);
  });

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    backup: {
      version: 1,
      exportedAt: typeof input.exportedAt === "string" ? input.exportedAt : "",
      employees: emps,
      kraConfig: kras,
      monthlyKRA: recs,
      settings: settings as { id: string }[],
    },
  };
}

export function parseBackupJSON(text: string): BackupValidation {
  try {
    return validateBackup(JSON.parse(text));
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
}

export function backupSummary(b: Pick<BackupData, "employees" | "kraConfig" | "monthlyKRA">): string {
  return `${b.employees.length} employees, ${b.kraConfig.length} KRAs, ${b.monthlyKRA.length} monthly records`;
}
