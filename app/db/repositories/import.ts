import type { Employee } from "~/types/employee";
import type { MonthlyKRA } from "~/types/monthly-kra";
import type { ImportResult, ImportRow } from "~/types/settings";
import { calculateTotalAchievement } from "~/domain/kra/calculations";
import { generateId } from "~/utils/dates";
import { STORES, req, withTx } from "../indexeddb";

/**
 * Commits reviewed import rows in one transaction (all or nothing).
 * Rows with errors are skipped; rows that hit an existing record are skipped
 * unless `overwrite` is set.
 */
export async function commitImport(rows: ImportRow[], overwrite: boolean): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, overwritten: 0, createdEmployees: 0 };

  await withTx([STORES.employees, STORES.monthlyKRA], "readwrite", async (s) => {
    const employees = await req(s[STORES.employees].getAll() as IDBRequest<Employee[]>);
    const byName = new Map(employees.map((e) => [e.name.trim().toLowerCase(), e]));

    for (const row of rows) {
      if (row.status === "error") {
        result.skipped++;
        continue;
      }

      let employee = row.employeeId
        ? employees.find((e) => e.id === row.employeeId)
        : byName.get(row.employeeName.trim().toLowerCase());
      if (!employee) {
        if (!row.createEmployee) {
          result.skipped++;
          continue;
        }
        const now = new Date().toISOString();
        employee = { id: generateId(), name: row.employeeName.trim(), active: true, createdAt: now, updatedAt: now };
        await req(s[STORES.employees].add(employee));
        byName.set(employee.name.toLowerCase(), employee);
        employees.push(employee);
        result.createdEmployees++;
      }

      const existing = await req(
        s[STORES.monthlyKRA].index("employeeId_month").get([employee.id, row.month]) as IDBRequest<MonthlyKRA | undefined>,
      );
      if (existing && !overwrite) {
        result.skipped++;
        continue;
      }

      const now = new Date().toISOString();
      const record: MonthlyKRA = {
        id: existing?.id ?? generateId(),
        employeeId: employee.id,
        month: row.month,
        achievements: row.achievements,
        totalAchievement: calculateTotalAchievement(row.achievements),
        remarks: row.remarks.trim() || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await req(s[STORES.monthlyKRA].put(record));
      if (existing) result.overwritten++;
      else result.imported++;
    }
  });

  return result;
}
