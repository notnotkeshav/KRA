import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import type { Route } from "./+types/employees";
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from "~/db/repositories/employees";
import type { Employee } from "~/types/employee";
import { type ActionResult, fail, readJson } from "~/utils/actions";
import { Alert, Badge, Button, ConfirmDialog, EmptyState, PageHeader, cardCls, inputCls } from "~/components/common/ui";
import { EmployeeFormModal, type EmployeeFormValues } from "~/components/employees/EmployeeFormModal";

export function meta() {
  return [{ title: "Employees · KRA Management" }];
}

export async function clientLoader() {
  return { employees: await getEmployees() };
}

type Intent =
  | ({ intent: "create" } & EmployeeFormValues)
  | ({ intent: "update"; id: string } & EmployeeFormValues)
  | { intent: "setActive"; id: string; active: boolean }
  | { intent: "delete"; id: string };

export async function clientAction({ request }: Route.ClientActionArgs): Promise<ActionResult> {
  try {
    const body = await readJson<Intent>(request);
    switch (body.intent) {
      case "create":
        await createEmployee(body);
        return { ok: true, message: `Added ${body.name.trim()}.` };
      case "update":
        await updateEmployee(body.id, body);
        return { ok: true, message: "Employee updated." };
      case "setActive":
        await updateEmployee(body.id, { active: body.active });
        return { ok: true, message: body.active ? "Employee reactivated." : "Employee deactivated." };
      case "delete":
        await deleteEmployee(body.id);
        return { ok: true, message: "Employee deleted." };
    }
  } catch (error) {
    return fail(error);
  }
}

export default function Employees({ loaderData }: Route.ComponentProps) {
  const { employees } = loaderData;
  const fetcher = useFetcher<ActionResult>();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  const busy = fetcher.state !== "idle";
  const result = fetcher.data;

  // Close dialogs once an action succeeds.
  useEffect(() => {
    if (fetcher.state === "idle" && result?.ok) {
      setEditing(null);
      setDeactivating(null);
      setDeleting(null);
    }
  }, [fetcher.state, result]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(
      (e) =>
        (showInactive || e.active) &&
        (!q || [e.name, e.employeeCode, e.designation].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [employees, search, showInactive]);

  const send = (payload: Intent) => fetcher.submit(payload, { method: "post", encType: "application/json" });

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage who appears in KRA tracking. Deactivated employees keep their history but drop out of quarterly reports."
        actions={<Button variant="primary" onClick={() => setEditing("new")}>Add employee</Button>}
      />

      {result?.ok && <Alert tone="success" className="mb-4">{result.message}</Alert>}
      {result && !result.ok && !editing && !deactivating && !deleting && <Alert tone="error" className="mb-4">{result.error}</Alert>}

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="w-full max-w-xs">
          <label htmlFor="emp-search" className="sr-only">Search employees</label>
          <input id="emp-search" type="search" className={inputCls} placeholder="Search by name, code or designation" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show deactivated
        </label>
      </div>

      {employees.length === 0 ? (
        <EmptyState title="No employees yet" description="Add your first employee to start tracking KRAs.">
          <Button variant="primary" onClick={() => setEditing("new")}>Add employee</Button>
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="No employees match your search" />
      ) : (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Designation</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((e) => (
                <tr key={e.id} className={e.active ? "" : "bg-slate-50 text-slate-500"}>
                  <td className="px-4 py-2 font-medium">
                    <Link to={`/employees/${e.id}`} className="text-indigo-700 hover:underline">{e.name}</Link>
                  </td>
                  <td className="px-4 py-2">{e.employeeCode ?? "—"}</td>
                  <td className="px-4 py-2">{e.designation ?? "—"}</td>
                  <td className="px-4 py-2">{e.active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" onClick={() => setEditing(e)}>Edit</Button>
                      {e.active ? (
                        <Button size="sm" onClick={() => setDeactivating(e)}>Deactivate</Button>
                      ) : (
                        <Button size="sm" onClick={() => send({ intent: "setActive", id: e.id, active: true })} disabled={busy}>Reactivate</Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleting(e)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EmployeeFormModal
          key={editing === "new" ? "new" : editing.id}
          open
          employee={editing === "new" ? null : editing}
          busy={busy}
          error={result && !result.ok ? result.error : undefined}
          onClose={() => setEditing(null)}
          onSubmit={(values) =>
            send(editing === "new" ? { intent: "create", ...values } : { intent: "update", id: editing.id, ...values })
          }
        />
      )}

      <ConfirmDialog
        open={!!deactivating}
        title="Deactivate employee?"
        message={`${deactivating?.name} will be hidden from new entries and quarterly reports. Their history is kept and they can be reactivated.`}
        confirmLabel="Deactivate"
        busy={busy}
        onCancel={() => setDeactivating(null)}
        onConfirm={() => deactivating && send({ intent: "setActive", id: deactivating.id, active: false })}
      >
        {result && !result.ok && <Alert tone="error" className="mt-3">{result.error}</Alert>}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!deleting}
        title="Delete employee permanently?"
        message={`This permanently deletes ${deleting?.name}. Employees with KRA history cannot be deleted; deactivate them instead.`}
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && send({ intent: "delete", id: deleting.id })}
      >
        {result && !result.ok && <Alert tone="error" className="mt-3">{result.error}</Alert>}
      </ConfirmDialog>
    </>
  );
}
