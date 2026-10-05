import { useEffect, useRef } from "react";
import { Link, redirect, useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/monthly";
import { loadAppContext } from "~/db/context";
import { getEmployee } from "~/db/repositories/employees";
import { krasForTemplate, templateName } from "~/domain/kra/templates";
import { deleteMonthlyKRA, getMonthlyKRA, getMonthlyKRAs, saveMonthlyKRA } from "~/db/repositories/monthly-kra";
import { calculateMonthlyAchievement } from "~/domain/kra/calculations";
import { validateMonthlyEntry } from "~/domain/kra/validation";
import { type ActionResult, fail, readJson } from "~/utils/actions";
import {
  formatMonth, getCurrentMonth, getMonthName, getYearFromMonth, getYearOptions, makeMonth,
  parseMonthParam, parseYearParam, shiftMonth,
} from "~/utils/dates";
import { formatNumber } from "~/utils/formatting";
import { Alert, Badge, Button, EmptyState, PageHeader, inputCls } from "~/components/common/ui";
import { MonthlyEntryForm, type MonthlyEntryPayload } from "~/components/kra/MonthlyEntryForm";

export function meta() {
  return [{ title: "Monthly KRA · KRA Management" }];
}

const path = (month: string, employeeId?: string) =>
  `/monthly/${month.slice(0, 4)}/${month.slice(5, 7)}${employeeId ? `/${employeeId}` : ""}`;

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const rawYear = params.year;
  const rawMonth = params.month;
  const year = parseYearParam(rawYear);
  const monthNumber = parseMonthParam(rawMonth);

  // /monthly, or an unparseable URL: go to the current month.
  if (!rawYear || year === null || monthNumber === null) throw redirect(path(getCurrentMonth()));
  const month = makeMonth(year, monthNumber);

  const ctx = await loadAppContext();
  const activeEmployees = ctx.employees.filter((e) => e.active);

  // /monthly/:year/:month: pick the first employee so the URL always names one.
  if (!params.employeeId) {
    if (activeEmployees.length > 0) throw redirect(path(month, activeEmployees[0].id));
    return { month, ctx, employee: null, record: undefined, enteredIds: [] as string[], kras: [], templateLabel: "" };
  }

  const employee = ctx.employees.find((e) => e.id === params.employeeId);
  if (!employee) throw new Response("Employee not found", { status: 404, statusText: "Employee not found" });

  const [record, monthRecords] = await Promise.all([getMonthlyKRA(employee.id, month), getMonthlyKRAs(month)]);
  return {
    month,
    ctx,
    employee,
    record,
    enteredIds: monthRecords.map((r) => r.employeeId),
    // The employee is scored on their template's KRAs only.
    kras: krasForTemplate(ctx.kras, employee.templateId),
    templateLabel: templateName(ctx.templates, employee.templateId),
  };
}

type SaveResult = ActionResult<{ total?: number; andNext?: boolean }>;

export async function clientAction({ request, params }: Route.ClientActionArgs): Promise<SaveResult> {
  try {
    const year = parseYearParam(params.year);
    const monthNumber = parseMonthParam(params.month);
    if (year === null || monthNumber === null || !params.employeeId) return { ok: false, error: "Invalid month or employee." };
    const month = makeMonth(year, monthNumber);

    const body = await readJson<{ intent: "save" | "delete"; andNext?: boolean } & Partial<MonthlyEntryPayload>>(request);

    if (body.intent === "delete") {
      const existing = await getMonthlyKRA(params.employeeId, month);
      if (existing) await deleteMonthlyKRA(existing.id);
      return { ok: true, message: "Record deleted." };
    }

    const [{ kras: allKras, settings }, employee] = await Promise.all([loadAppContext(), getEmployee(params.employeeId)]);
    if (!employee) return { ok: false, error: "Employee not found." };
    const kras = krasForTemplate(allKras, employee.templateId);
    const active = kras.filter((k) => k.active);
    const achievements: Record<string, number> = {};
    for (const k of active) {
      const v = body.achievements?.[k.id];
      if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, error: `Missing a valid value for "${k.name}".` };
      achievements[k.id] = v;
    }
    const problems = validateMonthlyEntry(achievements, kras, settings.allowAchievementOverride);
    if (problems.length) return { ok: false, error: problems[0].message };

    // Achievements for KRAs that are currently disabled are kept untouched.
    const existing = await getMonthlyKRA(params.employeeId, month);
    const merged = { ...(existing?.achievements ?? {}), ...achievements };

    const { record } = await saveMonthlyKRA({ employeeId: params.employeeId, month, achievements: merged, remarks: body.remarks });
    return {
      ok: true,
      message: "KRA saved successfully",
      total: calculateMonthlyAchievement(record.achievements, kras),
      andNext: !!body.andNext,
    };
  } catch (error) {
    return fail(error);
  }
}

export default function MonthlyRoute(props: Route.ComponentProps) {
  // Remount on month/employee change so action feedback never leaks between records.
  const key = `${props.loaderData.month}/${props.loaderData.employee?.id ?? "none"}`;
  return <MonthlyPage key={key} {...props} />;
}

function MonthlyPage({ loaderData }: Route.ComponentProps) {
  const { month, ctx, employee, record, enteredIds, kras, templateLabel } = loaderData;
  const navigate = useNavigate();
  const fetcher = useFetcher<SaveResult>();
  const advance = useRef(false);

  const activeEmployees = ctx.employees.filter((e) => e.active);
  const employeeOptions = employee && !employee.active ? [...activeEmployees, employee] : activeEmployees;
  const index = employee ? employeeOptions.findIndex((e) => e.id === employee.id) : -1;
  const prevEmployee = index > 0 ? employeeOptions[index - 1] : undefined;
  const nextEmployee = index >= 0 ? employeeOptions[index + 1] : undefined;
  const activeKras = kras.filter((k) => k.active);

  const result = fetcher.data;
  const busy = fetcher.state !== "idle";

  // "Save & next employee": move on once the save has landed in IndexedDB.
  useEffect(() => {
    if (fetcher.state === "idle" && result?.ok && result.andNext && advance.current && nextEmployee) {
      advance.current = false;
      navigate(path(month, nextEmployee.id));
    }
  }, [fetcher.state, result, nextEmployee, month, navigate]);

  const year = getYearFromMonth(month);
  const monthNumber = Number(month.slice(5, 7));

  return (
    <>
      <PageHeader title="Monthly KRA" description="Enter each employee's achievement for the month. Totals are calculated automatically." />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <label htmlFor="sel-year" className="mb-1 block text-xs font-medium text-slate-500">Year</label>
          <select id="sel-year" className={inputCls} value={year} onChange={(e) => navigate(path(makeMonth(Number(e.target.value), monthNumber), employee?.id))}>
            {getYearOptions([year]).map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sel-month" className="mb-1 block text-xs font-medium text-slate-500">Month</label>
          <select id="sel-month" className={inputCls} value={monthNumber} onChange={(e) => navigate(path(makeMonth(year, Number(e.target.value)), employee?.id))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{getMonthName(i + 1)}</option>)}
          </select>
        </div>
        <div className="min-w-44">
          <label htmlFor="sel-emp" className="mb-1 block text-xs font-medium text-slate-500">Employee</label>
          <select id="sel-emp" className={inputCls} value={employee?.id ?? ""} onChange={(e) => navigate(path(month, e.target.value))} disabled={employeeOptions.length === 0}>
            {!employee && <option value="">No employees</option>}
            {employeeOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{enteredIds.includes(e.id) ? " ✓" : ""}{e.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link to={path(shiftMonth(month, -1), employee?.id)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">← Previous month</Link>
          <Link to={path(shiftMonth(month, 1), employee?.id)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Next month →</Link>
        </div>
      </div>

      {!employee ? (
        <EmptyState title="No active employees" description="Add an employee before entering KRA data.">
          <Link to="/employees" className="text-sm font-medium text-indigo-600 hover:underline">Go to Employees</Link>
        </EmptyState>
      ) : activeKras.length === 0 ? (
        <EmptyState title="No active KRAs" description="Enable or add KRAs first.">
          <Link to="/kra-config" className="text-sm font-medium text-indigo-600 hover:underline">Go to KRA Configuration</Link>
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              {employee.name} · {formatMonth(month)}{" "}
              {record ? <Badge tone="green">Saved</Badge> : <Badge tone="amber">No record yet</Badge>} <Badge tone="indigo">{templateLabel}</Badge>
              {!employee.active && <> <Badge>Inactive</Badge></>}
            </h2>
            <div className="flex gap-2">
              {prevEmployee ? <Link to={path(month, prevEmployee.id)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">← {prevEmployee.name}</Link> : <Button size="sm" disabled>← Previous employee</Button>}
              {nextEmployee ? <Link to={path(month, nextEmployee.id)} className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">{nextEmployee.name} →</Link> : <Button size="sm" disabled>Next employee →</Button>}
            </div>
          </div>

          {result?.ok && result.total !== undefined && (
            <Alert tone="success" title={result.message} className="mb-3">
              Total Achievement: {formatNumber(result.total)}%
            </Alert>
          )}
          {result?.ok && result.total === undefined && <Alert tone="success" className="mb-3">{result.message}</Alert>}
          {result && !result.ok && <Alert tone="error" className="mb-3">{result.error}</Alert>}
          {ctx.settings.allowAchievementOverride && (
            <Alert tone="warning" className="mb-3">Achievement override is on: values above a KRA's weight are allowed.</Alert>
          )}

          <MonthlyEntryForm
            key={`${record?.updatedAt ?? "new"}`}
            kras={activeKras}
            record={record}
            allowOverride={ctx.settings.allowAchievementOverride}
            busy={busy}
            canSaveAndNext={!!nextEmployee}
            onSave={(payload, andNext) => {
              advance.current = andNext;
              fetcher.submit({ intent: "save", andNext, ...payload }, { method: "post", encType: "application/json" });
            }}
            onDelete={() => fetcher.submit({ intent: "delete" }, { method: "post", encType: "application/json" })}
          />
        </>
      )}
    </>
  );
}

