/** CSV import analysis. Produces a reviewable preview; never writes anything. */

import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";
import type { AppSettings, ImportIssue, ImportPreview, ImportRow } from "~/types/settings";
import { type CSVTable } from "~/utils/csv";
import { normalizeMonth } from "~/utils/dates";
import { roundTo } from "~/utils/formatting";
import { sumValues } from "./kra/calculations";

const EPSILON = 1e-9;

export function normalizeHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Aliases for the standard spreadsheet's abbreviated headings. */
const ALIASES: Record<string, string[]> = {
  "nobugsindevelopment": ["nobugs"],
  "projecttimeline": ["timeline"],
  "golive": ["golive"],
  "teamjuniordevelopergroomingmultiplatformworktasklevel": ["teamjuniordevelopergrooming", "grooming"],
  "timesheetreviewformanagerchatgptcode": ["timesheetreview"],
};

/**
 * Maps each CSV header to a KRA. Exact normalized names and known aliases are
 * claimed first; only then may a heading match as an unambiguous prefix.
 */
export function matchColumns(headers: string[], kras: KRAConfig[]): Map<string, KRAConfig> {
  const map = new Map<string, KRAConfig>();
  const used = new Set<string>();
  const byKey = new Map(kras.map((k) => [normalizeHeader(k.name), k]));

  const claim = (header: string, kra: KRAConfig | undefined) => {
    if (kra && !used.has(kra.id)) {
      map.set(header, kra);
      used.add(kra.id);
    }
  };

  for (const header of headers) {
    const key = normalizeHeader(header);
    let kra = byKey.get(key);
    if (!kra) {
      for (const [full, aliases] of Object.entries(ALIASES)) {
        if (aliases.includes(key) && byKey.has(full)) kra = byKey.get(full);
      }
    }
    claim(header, kra);
  }

  for (const header of headers) {
    if (map.has(header)) continue;
    const key = normalizeHeader(header);
    if (key.length < 8) continue;
    const candidates = kras.filter(
      (k) => !used.has(k.id) && (normalizeHeader(k.name).startsWith(key) || key.startsWith(normalizeHeader(k.name))),
    );
    if (candidates.length === 1) claim(header, candidates[0]);
  }
  return map;
}

export type ImportContext = {
  kras: KRAConfig[];
  employees: Employee[];
  existingRecords: Pick<MonthlyKRA, "id" | "employeeId" | "month">[];
  settings: AppSettings;
  createMissingEmployees: boolean;
};

export function analyzeImport(table: CSVTable, ctx: ImportContext): ImportPreview {
  const activeKras = ctx.kras.filter((k) => k.active);
  const fileErrors: string[] = [];
  const headerOf = (name: string) => table.headers.find((h) => normalizeHeader(h) === normalizeHeader(name));

  const employeeCol = headerOf("Employee");
  const monthCol = headerOf("Month");
  const totalCol = table.headers.find((h) => ["totalachv", "total", "totalachievement"].includes(normalizeHeader(h)));
  const remarksCol = headerOf("Remarks");

  if (table.headers.length === 0) fileErrors.push("The file is empty.");
  if (table.headers.length > 0 && !employeeCol) fileErrors.push('Missing required column "Employee".');
  if (table.headers.length > 0 && !monthCol) fileErrors.push('Missing required column "Month".');

  const reserved = new Set([employeeCol, monthCol, totalCol, remarksCol].filter((h): h is string => !!h));
  const columns = matchColumns(table.headers.filter((h) => !reserved.has(h)), activeKras);
  const unmatchedColumns = table.headers.filter((h) => !reserved.has(h) && !columns.has(h) && h !== "");
  const missingKRAs = activeKras.filter((k) => ![...columns.values()].some((c) => c.id === k.id)).map((k) => k.name);

  if (fileErrors.length > 0 || table.rows.length === 0) {
    if (fileErrors.length === 0) fileErrors.push("The file has a header but no data rows.");
    return { rows: [], fileErrors, unmatchedColumns, missingKRAs };
  }

  const empByName = new Map(ctx.employees.map((e) => [e.name.trim().toLowerCase(), e]));
  const existing = new Map(ctx.existingRecords.map((r) => [`${r.employeeId}|${r.month}`, r.id]));
  const seenInFile = new Set<string>();
  const allowOver = ctx.settings.allowAchievementOverride;

  const rows: ImportRow[] = table.rows.map(({ rowNumber, values }) => {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const issue = (list: ImportIssue[], field: string, message: string) => list.push({ row: rowNumber, field, message });

    // Employee
    const employeeName = (values[employeeCol!] ?? "").trim();
    let employeeId: string | null = null;
    let createEmployee = false;
    if (!employeeName) {
      issue(errors, "Employee", "Employee name is missing.");
    } else {
      const found = empByName.get(employeeName.toLowerCase());
      if (found) {
        employeeId = found.id;
        if (!found.active) issue(warnings, "Employee", `"${found.name}" is deactivated.`);
      } else if (ctx.createMissingEmployees) {
        createEmployee = true;
        issue(warnings, "Employee", `"${employeeName}" does not exist and will be created.`);
      } else {
        issue(errors, "Employee", `Unknown employee "${employeeName}". Add them first or enable "create missing employees".`);
      }
    }

    // Month
    const rawMonth = values[monthCol!] ?? "";
    const month = normalizeMonth(rawMonth);
    if (!month) issue(errors, "Month", `Invalid month "${rawMonth}". Use formats like Apr-26 or 2026-04.`);

    // Achievements
    const achievements: Record<string, number> = {};
    for (const kra of activeKras) {
      const header = [...columns.entries()].find(([, k]) => k.id === kra.id)?.[0];
      const raw = header === undefined ? "" : (values[header] ?? "").replace(/%$/, "").trim();
      if (header === undefined) {
        achievements[kra.id] = 0;
        continue;
      }
      if (raw === "") {
        achievements[kra.id] = 0;
        issue(warnings, kra.name, "Empty value treated as 0.");
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        achievements[kra.id] = 0;
        issue(errors, kra.name, `"${raw}" is not a number.`);
      } else if (n < 0) {
        achievements[kra.id] = n;
        issue(errors, kra.name, `${n} is negative.`);
      } else if (n > kra.weight + EPSILON && !allowOver) {
        achievements[kra.id] = n;
        issue(errors, kra.name, `${n} exceeds the weight of ${kra.weight}.`);
      } else {
        achievements[kra.id] = n;
      }
    }

    // Totals: always recalculated, imported value only compared.
    const calculatedTotal = sumValues(Object.values(achievements));
    let importedTotal: number | null = null;
    const rawTotal = totalCol ? (values[totalCol] ?? "").replace(/%$/, "").trim() : "";
    if (rawTotal !== "") {
      const n = Number(rawTotal);
      if (Number.isFinite(n)) {
        importedTotal = n;
        if (Math.abs(n - calculatedTotal) > EPSILON) {
          issue(warnings, "Total Achv.", `Imported total ${roundTo(n)} differs from calculated total ${roundTo(calculatedTotal)}. The calculated value will be used.`);
        }
      } else {
        issue(warnings, "Total Achv.", `Imported total "${rawTotal}" is not a number and was ignored.`);
      }
    }

    // Duplicates / existing records
    let existingRecordId: string | null = null;
    if (month && employeeName) {
      const key = `${(employeeId ?? `new:${employeeName.toLowerCase()}`)}|${month}`;
      if (seenInFile.has(key)) issue(errors, "Month", `Duplicate row for ${employeeName} in ${month}.`);
      seenInFile.add(key);
      if (employeeId && existing.has(key)) {
        existingRecordId = existing.get(key)!;
        issue(warnings, "Month", `A record for ${month} already exists and will only be replaced if overwrite is enabled.`);
      }
    }

    return {
      rowNumber,
      employeeName,
      employeeId,
      createEmployee,
      month: month ?? "",
      achievements,
      calculatedTotal,
      importedTotal,
      remarks: remarksCol ? (values[remarksCol] ?? "") : "",
      existingRecordId,
      status: errors.length ? "error" : warnings.length ? "warning" : "ready",
      errors,
      warnings,
    };
  });

  return { rows, fileErrors, unmatchedColumns, missingKRAs };
}

export const IMPORT_TEMPLATE_HEADERS = [
  "Employee",
  "No Bugs in Development",
  "Project Timeline",
  "Timesheet",
  "Ideation",
  "Go Live",
  "Team/Junior Developer Grooming/multi Platform Work task level",
  "Documentation",
  "Timesheet Review for Manager/ChatGpt code",
  "Month",
  "Total Achv.",
  "Remarks",
];
