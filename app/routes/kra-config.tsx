import { useMemo, useState } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/kra-config";
import { getKRAConfig, saveKRAConfig } from "~/db/repositories/kra-config";
import { sumActiveWeights, validateKRAConfigSet } from "~/domain/kra/validation";
import type { KRAConfig } from "~/types/kra";
import { type ActionResult, fail, readJson } from "~/utils/actions";
import { generateId } from "~/utils/dates";
import { formatNumber } from "~/utils/formatting";
import { Alert, Badge, Button, Card, PageHeader, inputCls } from "~/components/common/ui";

export function meta() {
  return [{ title: "KRA Configuration · KRA Management" }];
}

export async function clientLoader() {
  return { kras: await getKRAConfig() };
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<ActionResult> {
  try {
    const { kras } = await readJson<{ kras: KRAConfig[] }>(request);
    await saveKRAConfig(kras);
    return { ok: true, message: "KRA configuration saved." };
  } catch (error) {
    return fail(error);
  }
}

type Draft = Omit<KRAConfig, "weight"> & { weightText: string; isNew?: boolean };

function toDraft(k: KRAConfig): Draft {
  const { weight, ...rest } = k;
  return { ...rest, weightText: String(weight) };
}

function fromDraft(d: Draft): KRAConfig {
  const { weightText, isNew: _isNew, ...rest } = d;
  return { ...rest, weight: weightText.trim() === "" ? Number.NaN : Number(weightText) };
}

export default function KRAConfigPage({ loaderData }: Route.ComponentProps) {
  // Remount the editor whenever stored data changes, so the draft always reflects IndexedDB.
  const version = loaderData.kras.map((k) => `${k.id}:${k.updatedAt}`).join("|");
  // The fetcher lives here so its result survives the editor remount.
  const fetcher = useFetcher<ActionResult>();
  return <Editor key={version} saved={loaderData.kras} fetcher={fetcher} />;
}

function Editor({ saved, fetcher }: { saved: KRAConfig[]; fetcher: ReturnType<typeof useFetcher<ActionResult>> }) {
  const [rows, setRows] = useState<Draft[]>(() => saved.map(toDraft));
  const busy = fetcher.state !== "idle";

  const configs = useMemo(() => rows.map(fromDraft), [rows]);
  const errors = useMemo(() => validateKRAConfigSet(configs), [configs]);
  const total = sumActiveWeights(configs);
  const weightsValid = Math.abs(total - 100) < 1e-9;
  const dirty = JSON.stringify(rows.map(fromDraft).map(({ updatedAt: _u, ...k }) => k)) !==
    JSON.stringify(saved.map(({ updatedAt: _u, ...k }) => k));

  const update = (id: string, patch: Partial<Draft>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        return { ...r, ...patch };
      }),
    );

  const setGoLive = (id: string, on: boolean) =>
    setRows((rs) => rs.map((r) => ({ ...r, isGoLive: r.id === id ? on : on ? false : r.isGoLive })));

  const move = (index: number, delta: number) =>
    setRows((rs) => {
      const next = [...rs];
      const target = index + delta;
      if (target < 0 || target >= next.length) return rs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const add = () => {
    const now = new Date().toISOString();
    setRows((rs) => [
      ...rs,
      { id: generateId(), name: "", weightText: "0", active: true, order: rs.length + 1, createdAt: now, updatedAt: now, isNew: true },
    ]);
  };

  const fieldError = (id: string, field: string) => errors.find((e) => e.field === `${id}.${field}`)?.message;
  const result = fetcher.data;

  return (
    <>
      <PageHeader
        title="KRA Configuration"
        description="Define the KRAs and their weights. The weights of all active KRAs must add up to 100%."
        actions={
          <>
            <Button onClick={add}>Add KRA</Button>
            <Button
              variant="primary"
              disabled={busy || errors.length > 0 || !dirty}
              onClick={() => fetcher.submit({ kras: configs }, { method: "post", encType: "application/json" })}
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      {result?.ok && !dirty && <Alert tone="success" className="mb-4">{result.message}</Alert>}
      {result && !result.ok && <Alert tone="error" className="mb-4">{result.error}</Alert>}

      <div
        className={`mb-4 flex items-center justify-between rounded-lg border px-4 py-3 ${
          weightsValid ? "border-green-200 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
        role="status"
      >
        <span className="text-sm font-medium">Total Weight: {formatNumber(total)}%</span>
        <span className="text-sm">{weightsValid ? "Valid" : `Must equal 100% (${total < 100 ? "short" : "over"} by ${formatNumber(Math.abs(100 - total))}%)`}</span>
      </div>

      {errors.filter((e) => !e.field.includes(".") && e.field !== "weight").length > 0 && (
        <Alert tone="warning" title="Fix these before saving" className="mb-4">
          <ul className="list-disc pl-5">
            {errors.filter((e) => !e.field.includes(".") && e.field !== "weight").map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </Alert>
      )}

      <Card>
        <ul className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <li key={r.id} className={`grid gap-3 px-4 py-3 md:grid-cols-[auto_1fr_7rem_auto] ${r.active ? "" : "bg-slate-50"}`}>
              <div className="flex items-center gap-1 md:flex-col">
                <Button size="sm" variant="ghost" aria-label={`Move ${r.name || "KRA"} up`} disabled={i === 0} onClick={() => move(i, -1)}>▲</Button>
                <Button size="sm" variant="ghost" aria-label={`Move ${r.name || "KRA"} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>▼</Button>
              </div>
              <div className="space-y-2">
                <div>
                  <label htmlFor={`name-${r.id}`} className="sr-only">KRA name</label>
                  <input
                    id={`name-${r.id}`}
                    className={inputCls}
                    placeholder="KRA name"
                    value={r.name}
                    aria-invalid={!!fieldError(r.id, "name")}
                    onChange={(e) => update(r.id, { name: e.target.value })}
                  />
                  {fieldError(r.id, "name") && <p className="mt-1 text-xs text-red-600">{fieldError(r.id, "name")}</p>}
                </div>
                <label htmlFor={`desc-${r.id}`} className="sr-only">Description</label>
                <input
                  id={`desc-${r.id}`}
                  className={inputCls}
                  placeholder="Description (optional)"
                  value={r.description ?? ""}
                  onChange={(e) => update(r.id, { description: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={r.active} onChange={(e) => update(r.id, { active: e.target.checked })} />
                    Active
                  </label>
                  <label className="flex items-center gap-2" title="The Go Live carry-forward rule applies to this KRA">
                    <input type="checkbox" checked={!!r.isGoLive} onChange={(e) => setGoLive(r.id, e.target.checked)} />
                    Go Live KRA (carry-forward)
                  </label>
                  {!r.active && <Badge>Disabled</Badge>}
                </div>
              </div>
              <div>
                <label htmlFor={`w-${r.id}`} className="mb-1 block text-xs font-medium text-slate-500">Weight %</label>
                <input
                  id={`w-${r.id}`}
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  inputMode="decimal"
                  className={`${inputCls} text-right`}
                  value={r.weightText}
                  aria-invalid={!!fieldError(r.id, "weight")}
                  onChange={(e) => update(r.id, { weightText: e.target.value })}
                />
                {fieldError(r.id, "weight") && <p className="mt-1 text-xs text-red-600">Enter 0–100.</p>}
              </div>
              <div className="flex items-start justify-end">
                {r.isNew && (
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        KRAs with recorded achievements cannot be deleted; disable them to hide them from new entries and reports. Changing a weight does not rewrite past records.
      </p>
    </>
  );
}
