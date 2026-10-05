/** Backup schema validation. Runs before anything touches IndexedDB. */

import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";
import type { BackupData } from "~/types/settings";
import { DEFAULT_TEMPLATE_ID, FUNCTIONAL_TEMPLATE_ID, type KRATemplate } from "~/types/template";
import { buildDefaultTemplates, buildFunctionalKRAConfig } from "~/db/seed";
import { isValidMonth } from "~/utils/dates";
import { findDuplicateMonthlyRecords, validateKRAWeights } from "./kra/validation";

export type ParsedBackup = {
  version: 1;
  exportedAt: string;
  employees: Employee[];
  templates: KRATemplate[];
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

  if (input.templates !== undefined && !Array.isArray(input.templates)) return { ok: false, errors: ['"templates" must be an array.'] };
  const employees = input.employees as unknown[];
  const rawTemplates = (input.templates as unknown[] | undefined) ?? [];
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
  rawTemplates.forEach((t, i) => {
    if (!isRecord(t) || !isStr(t.id) || !isStr(t.name)) err(`templates[${i}] needs id and name.`);
  });
  settings.forEach((s, i) => {
    if (!isRecord(s) || !isStr(s.id)) err(`settings[${i}] needs an id.`);
  });
  if (errors.length) return { ok: false, errors };

  // Backups from before templates existed: everything belongs to the Developer template.
  const legacy = input.templates === undefined;
  const templates: KRATemplate[] = legacy ? buildDefaultTemplates() : (rawTemplates as KRATemplate[]);
  const emps = (employees as Employee[]).map((e) => ({ ...e, templateId: e.templateId || DEFAULT_TEMPLATE_ID }));
  let kras = (kraConfig as KRAConfig[]).map((k) => ({ ...k, templateId: k.templateId || DEFAULT_TEMPLATE_ID }));
  if (legacy && kras.length > 0 && !kras.some((k) => k.templateId === FUNCTIONAL_TEMPLATE_ID)) {
    kras = [...kras, ...buildFunctionalKRAConfig()];
  }
  const recs = monthly as MonthlyKRA[];

  const ids = new Set(emps.map((e) => e.id));
  if (ids.size !== emps.length) err("Duplicate employee ids.");
  const names = new Set(emps.map((e) => e.name.trim().toLowerCase()));
  if (names.size !== emps.length) err("Duplicate employee names.");
  if (new Set(kras.map((k) => k.id)).size !== kras.length) err("Duplicate KRA ids.");
  if (new Set(recs.map((r) => r.id)).size !== recs.length) err("Duplicate monthly record ids.");
  if (new Set(templates.map((t) => t.id)).size !== templates.length) err("Duplicate template ids.");
  const templateIds = new Set(templates.map((t) => t.id));
  kras.forEach((k) => {
    if (!templateIds.has(k.templateId)) err(`KRA "${k.name}" references unknown template ${k.templateId}.`);
  });
  emps.forEach((e) => {
    if (!templateIds.has(e.templateId)) err(`Employee "${e.name}" references unknown template ${e.templateId}.`);
  });
  for (const t of templates) {
    const set = kras.filter((k) => k.templateId === t.id);
    if (set.length > 0) validateKRAWeights(set).forEach((e) => err(`Template "${t.name}": ${e.message}`));
  }
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
      templates,
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
