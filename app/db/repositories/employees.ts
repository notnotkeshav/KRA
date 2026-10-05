import type { Employee, EmployeeInput } from "~/types/employee";
import { validateEmployeeName } from "~/domain/kra/validation";
import { generateId } from "~/utils/dates";
import { DatabaseError, STORES, getAll, getByKey, req, withTx } from "../indexeddb";

const S = STORES.employees;

async function requireTemplate(s: { templates: IDBObjectStore }, id: string): Promise<void> {
  if (!(await req(s.templates.get(id)))) throw new DatabaseError("invalid", "Choose a valid KRA template.");
}

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export async function getEmployees(): Promise<Employee[]> {
  const all = await getAll<Employee>(S);
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getActiveEmployees(): Promise<Employee[]> {
  return (await getEmployees()).filter((e) => e.active);
}

export function getEmployee(id: string): Promise<Employee | undefined> {
  return getByKey<Employee>(S, id);
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  return withTx([S, STORES.templates], "readwrite", async (s) => {
    await requireTemplate(s, input.templateId);
    const existing = await req(s[S].getAll() as IDBRequest<Employee[]>);
    const problems = validateEmployeeName(input.name, existing);
    if (problems.length) throw new DatabaseError("invalid", problems[0].message);

    const now = new Date().toISOString();
    const employee: Employee = {
      id: generateId(),
      name: input.name.trim(),
      templateId: input.templateId,
      employeeCode: clean(input.employeeCode),
      designation: clean(input.designation),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await req(s[S].add(employee));
    return employee;
  });
}

export async function updateEmployee(id: string, changes: Partial<EmployeeInput> & { active?: boolean }): Promise<Employee> {
  return withTx([S, STORES.templates, STORES.monthlyKRA], "readwrite", async (s) => {
    const existing = await req(s[S].get(id) as IDBRequest<Employee | undefined>);
    if (!existing) throw new DatabaseError("not-found", "Employee not found.");

    // Records are scored against the template's KRAs, so a template with history cannot be swapped.
    if (changes.templateId !== undefined && changes.templateId !== existing.templateId) {
      await requireTemplate(s, changes.templateId);
      const records = await req(s[STORES.monthlyKRA].index("employeeId").count(id));
      if (records > 0) {
        throw new DatabaseError("invalid", `${existing.name} has ${records} monthly record(s) under the current template, so the template cannot be changed.`);
      }
    }

    if (changes.name !== undefined) {
      const all = await req(s[S].getAll() as IDBRequest<Employee[]>);
      const problems = validateEmployeeName(changes.name, all, id);
      if (problems.length) throw new DatabaseError("invalid", problems[0].message);
    }

    const updated: Employee = {
      ...existing,
      ...(changes.name !== undefined && { name: changes.name.trim() }),
      ...(changes.templateId !== undefined && { templateId: changes.templateId }),
      ...(changes.employeeCode !== undefined && { employeeCode: clean(changes.employeeCode) }),
      ...(changes.designation !== undefined && { designation: clean(changes.designation) }),
      ...(changes.active !== undefined && { active: changes.active }),
      updatedAt: new Date().toISOString(),
    };
    await req(s[S].put(updated));
    return updated;
  });
}

/** Refuses to delete an employee who has monthly records; deactivate instead. */
export async function deleteEmployee(id: string): Promise<void> {
  await withTx([S, STORES.monthlyKRA], "readwrite", async (s) => {
    const count = await req(s[STORES.monthlyKRA].index("employeeId").count(id));
    if (count > 0) {
      throw new DatabaseError("invalid", `This employee has ${count} monthly KRA record(s). Deactivate them instead of deleting.`);
    }
    await req(s[S].delete(id));
  });
}
