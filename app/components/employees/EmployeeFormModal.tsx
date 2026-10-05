import { useState } from "react";
import type { Employee } from "~/types/employee";
import type { KRATemplate } from "~/types/template";
import { Alert, Button, Field, Modal, inputCls } from "~/components/common/ui";

export type EmployeeFormValues = { name: string; templateId: string; employeeCode: string; designation: string };

export function EmployeeFormModal({
  employee,
  templates,
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  employee: Employee | null;
  templates: KRATemplate[];
  open: boolean;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
}) {
  const [values, setValues] = useState<EmployeeFormValues>({
    name: employee?.name ?? "",
    templateId: employee?.templateId ?? templates[0]?.id ?? "",
    employeeCode: employee?.employeeCode ?? "",
    designation: employee?.designation ?? "",
  });
  const nameInvalid = values.name.trim().length < 2;
  const set = (key: keyof EmployeeFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? "Edit employee" : "Add employee"}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" form="employee-form" type="submit" disabled={busy || nameInvalid}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form
        id="employee-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nameInvalid) onSubmit(values);
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" htmlFor="emp-name" hint="Must be unique.">
          <input id="emp-name" className={inputCls} value={values.name} onChange={set("name")} required autoFocus />
        </Field>
        <Field
          label="KRA template"
          htmlFor="emp-template"
          hint="Decides which KRAs this employee is scored on. It cannot be changed once monthly records exist."
        >
          <select id="emp-template" className={inputCls} value={values.templateId} onChange={set("templateId")} required>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Employee code (optional)" htmlFor="emp-code">
          <input id="emp-code" className={inputCls} value={values.employeeCode} onChange={set("employeeCode")} />
        </Field>
        <Field label="Designation (optional)" htmlFor="emp-desig">
          <input id="emp-desig" className={inputCls} value={values.designation} onChange={set("designation")} />
        </Field>
      </form>
    </Modal>
  );
}
