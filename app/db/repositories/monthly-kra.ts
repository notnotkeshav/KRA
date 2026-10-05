import type { MonthlyKRA, MonthlyKRAInput } from "~/types/monthly-kra";
import { calculateTotalAchievement } from "~/domain/kra/calculations";
import { validateMonth } from "~/domain/kra/validation";
import { type Quarter, getMonthsForQuarter, generateId } from "~/utils/dates";
import { DatabaseError, STORES, getAll, req, withTx } from "../indexeddb";

const S = STORES.monthlyKRA;

function buildRecord(input: MonthlyKRAInput, existing: MonthlyKRA | undefined, now: string): MonthlyKRA {
  return {
    id: existing?.id ?? generateId(),
    employeeId: input.employeeId,
    month: input.month,
    achievements: { ...input.achievements },
    totalAchievement: calculateTotalAchievement(input.achievements),
    remarks: input.remarks?.trim() ? input.remarks.trim() : undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function getMonthlyKRA(employeeId: string, month: string): Promise<MonthlyKRA | undefined> {
  return withTx([S], "readonly", (s) =>
    req(s[S].index("employeeId_month").get([employeeId, month]) as IDBRequest<MonthlyKRA | undefined>),
  );
}

export async function getMonthlyKRAs(month: string): Promise<MonthlyKRA[]> {
  return withTx([S], "readonly", (s) => req(s[S].index("month").getAll(month) as IDBRequest<MonthlyKRA[]>));
}

export async function getMonthlyKRAsForEmployee(employeeId: string): Promise<MonthlyKRA[]> {
  const rows = await withTx([S], "readonly", (s) =>
    req(s[S].index("employeeId").getAll(employeeId) as IDBRequest<MonthlyKRA[]>),
  );
  return rows.sort((a, b) => a.month.localeCompare(b.month));
}

/** Inclusive month range, via the `month` index (no full-store scan). */
export async function getMonthlyKRAsBetween(fromMonth: string, toMonth: string): Promise<MonthlyKRA[]> {
  return withTx([S], "readonly", (s) =>
    req(s[S].index("month").getAll(IDBKeyRange.bound(fromMonth, toMonth)) as IDBRequest<MonthlyKRA[]>),
  );
}

export function getMonthlyKRAsForQuarter(year: number, quarter: Quarter): Promise<MonthlyKRA[]> {
  const months = getMonthsForQuarter(year, quarter);
  return getMonthlyKRAsBetween(months[0], months[2]);
}

/** Distinct months that have at least one record, ascending. */
export async function getMonthsWithData(): Promise<string[]> {
  return withTx([S], "readonly", async (s) => {
    const months: string[] = [];
    const cursor = s[S].index("month").openKeyCursor(null, "nextunique");
    await new Promise<void>((resolve, reject) => {
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        months.push(c.key as string);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
    return months;
  });
}

export async function getAllMonthlyKRAs(): Promise<MonthlyKRA[]> {
  return getAll<MonthlyKRA>(S);
}

/** Creates or updates the single record for (employee, month). `updatedAt` always changes. */
export async function saveMonthlyKRA(input: MonthlyKRAInput): Promise<{ record: MonthlyKRA; created: boolean }> {
  const monthProblems = validateMonth(input.month);
  if (monthProblems.length) throw new DatabaseError("invalid", monthProblems[0].message);

  return withTx([S, STORES.employees], "readwrite", async (s) => {
    const employee = await req(s[STORES.employees].get(input.employeeId));
    if (!employee) throw new DatabaseError("not-found", "Employee not found.");
    const existing = await req(
      s[S].index("employeeId_month").get([input.employeeId, input.month]) as IDBRequest<MonthlyKRA | undefined>,
    );
    const record = buildRecord(input, existing, new Date().toISOString());
    await req(s[S].put(record));
    return { record, created: !existing };
  });
}

/** Strict create: fails when the (employee, month) record already exists. */
export async function createMonthlyKRA(input: MonthlyKRAInput): Promise<MonthlyKRA> {
  return withTx([S], "readwrite", async (s) => {
    const existing = await req(s[S].index("employeeId_month").get([input.employeeId, input.month]));
    if (existing) throw new DatabaseError("constraint", "A KRA record for this employee and month already exists.");
    const record = buildRecord(input, undefined, new Date().toISOString());
    await req(s[S].add(record));
    return record;
  });
}

export async function deleteMonthlyKRA(id: string): Promise<void> {
  await withTx([S], "readwrite", (s) => req(s[S].delete(id)));
}
