import { useMemo, useState } from "react";
import type { KRAConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";
import { calculateMaxAchievement, calculateMonthlyAchievement, calculateRemaining } from "~/domain/kra/calculations";
import { validateAchievement } from "~/domain/kra/validation";
import { formatNumber } from "~/utils/formatting";
import { formatDateTime } from "~/utils/formatting";
import { Badge, Button, ConfirmDialog, cardCls, inputCls } from "~/components/common/ui";

export type MonthlyEntryPayload = { achievements: Record<string, number>; remarks: string };

type Props = {
  kras: KRAConfig[]; // active KRAs only, ordered
  record: MonthlyKRA | undefined;
  allowOverride: boolean;
  busy: boolean;
  canSaveAndNext: boolean;
  onSave: (payload: MonthlyEntryPayload, andNext: boolean) => void;
  onDelete: () => void;
};

function initialValues(kras: KRAConfig[], record: MonthlyKRA | undefined): Record<string, string> {
  const values: Record<string, string> = {};
  for (const k of kras) {
    const v = record?.achievements[k.id];
    values[k.id] = v === undefined ? "" : String(v);
  }
  return values;
}

export function MonthlyEntryForm({ kras, record, allowOverride, busy, canSaveAndNext, onSave, onDelete }: Props) {
  const [values, setValues] = useState(() => initialValues(kras, record));
  const [remarks, setRemarks] = useState(record?.remarks ?? "");
  const [confirmBlanks, setConfirmBlanks] = useState<{ andNext: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsed = useMemo(() => {
    const out: Record<string, { blank: boolean; value: number; errors: string[] }> = {};
    for (const k of kras) {
      const raw = values[k.id]?.trim() ?? "";
      if (raw === "") {
        out[k.id] = { blank: true, value: 0, errors: [] };
        continue;
      }
      const value = Number(raw);
      out[k.id] = { blank: false, value, errors: validateAchievement(value, k.weight, k.name, allowOverride).map((e) => e.message) };
    }
    return out;
  }, [values, kras, allowOverride]);

  const numeric = Object.fromEntries(kras.map((k) => [k.id, Number.isFinite(parsed[k.id].value) ? parsed[k.id].value : 0]));
  const total = calculateMonthlyAchievement(numeric, kras);
  const max = calculateMaxAchievement(kras);
  const hasErrors = kras.some((k) => parsed[k.id].errors.length > 0);
  const blanks = kras.filter((k) => parsed[k.id].blank);

  const initial = useMemo(() => initialValues(kras, record), [kras, record]);
  const dirty = kras.some((k) => (values[k.id] ?? "") !== initial[k.id]) || remarks !== (record?.remarks ?? "");

  const submit = (andNext: boolean) => {
    const achievements = Object.fromEntries(kras.map((k) => [k.id, parsed[k.id].value]));
    onSave({ achievements, remarks }, andNext);
  };
  const attempt = (andNext: boolean) => {
    if (hasErrors) return;
    if (blanks.length > 0) setConfirmBlanks({ andNext });
    else submit(andNext);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        attempt(false);
      }}
      noValidate
    >
      <div className={`${cardCls} overflow-x-auto`}>
        <table className="table-sticky min-w-full divide-y divide-slate-200 text-sm">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">KRA</th>
              <th className="px-4 py-2 text-right">Weight</th>
              <th className="w-36 px-4 py-2 text-right">Achievement</th>
              <th className="px-4 py-2 text-right">Remaining</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {kras.map((k) => {
              const p = parsed[k.id];
              const invalid = p.errors.length > 0;
              return (
                <tr key={k.id} className={invalid ? "bg-red-50/50" : ""}>
                  <th scope="row" className="px-4 py-2 text-left font-medium text-slate-800">
                    <label htmlFor={`ach-${k.id}`}>{k.name}</label>
                    {k.description && <p className="text-xs font-normal text-slate-500">{k.description}</p>}
                  </th>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{formatNumber(k.weight)}%</td>
                  <td className="px-4 py-2">
                    <input
                      id={`ach-${k.id}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      max={allowOverride ? undefined : k.weight}
                      className={`${inputCls} text-right tabular-nums`}
                      placeholder="—"
                      value={values[k.id]}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? `err-${k.id}` : undefined}
                      onChange={(e) => setValues((v) => ({ ...v, [k.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                    {p.blank || invalid ? "—" : `${formatNumber(calculateRemaining(k.weight, p.value))}%`}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {invalid ? (
                      <span id={`err-${k.id}`} className="text-red-600">{p.errors[0]}</span>
                    ) : p.blank ? (
                      <Badge tone="amber" title="No value entered. It is saved as 0 only after you confirm.">Not entered</Badge>
                    ) : p.value === k.weight ? (
                      <Badge tone="green">Full marks</Badge>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr>
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(max)}%</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(total)}%</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(Math.max(0, max - total))}%</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-base font-semibold text-slate-900" aria-live="polite">
        Total Achievement: {formatNumber(total)} / {formatNumber(max)}
      </p>

      <div className="mt-4">
        <label htmlFor="remarks" className="mb-1 block text-sm font-medium text-slate-700">Remarks</label>
        <textarea
          id="remarks"
          rows={3}
          className={inputCls}
          placeholder="e.g. Client visit LG, ASL"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy || hasErrors || (!dirty && !!record)}>
          {busy ? "Saving…" : record ? "Save changes" : "Save KRA"}
        </Button>
        {canSaveAndNext && (
          <Button disabled={busy || hasErrors} onClick={() => attempt(true)}>Save &amp; next employee</Button>
        )}
        {blanks.length > 0 && (
          <Button variant="ghost" onClick={() => setValues((v) => Object.fromEntries(Object.entries(v).map(([id, x]) => [id, x.trim() === "" ? "0" : x])))}>
            Fill empty with 0
          </Button>
        )}
        {record && (
          <Button variant="ghost" className="ml-auto text-red-600" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete record
          </Button>
        )}
      </div>
      {hasErrors && <p className="mt-2 text-sm text-red-600">Fix the highlighted values before saving.</p>}
      {record && <p className="mt-2 text-xs text-slate-500">Last updated {formatDateTime(record.updatedAt)}</p>}

      <ConfirmDialog
        open={!!confirmBlanks}
        title="Save with empty values?"
        tone="primary"
        confirmLabel="Save empty values as 0"
        busy={busy}
        onCancel={() => setConfirmBlanks(null)}
        onConfirm={() => {
          const next = confirmBlanks?.andNext ?? false;
          setConfirmBlanks(null);
          submit(next);
        }}
        message={
          <>
            <p>These KRAs have no value and will be saved as 0:</p>
            <ul className="mt-2 list-disc pl-5">
              {blanks.map((k) => <li key={k.id}>{k.name}</li>)}
            </ul>
          </>
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this monthly record?"
        message="The achievements and remarks for this employee and month will be permanently removed."
        confirmLabel="Delete record"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />
    </form>
  );
}
