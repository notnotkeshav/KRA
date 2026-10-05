import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/kra-config";
import { getKRAConfig, saveKRAConfig } from "~/db/repositories/kra-config";
import { createTemplate, deleteTemplate, getTemplates, renameTemplate } from "~/db/repositories/templates";
import { krasForTemplate } from "~/domain/kra/templates";
import type { KRATemplate } from "~/types/template";
import { sumActiveWeights, validateKRAConfigSet } from "~/domain/kra/validation";
import type { KRAConfig } from "~/types/kra";
import { type ActionResult, fail, readJson } from "~/utils/actions";
import { generateId } from "~/utils/dates";
import { formatNumber } from "~/utils/formatting";
import { Alert, Badge, Button, Card, Field, Modal, PageHeader, inputCls } from "~/components/common/ui";

export function meta() {
  return [{ title: "KRA Configuration · KRA Management" }];
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const [templates, kras] = await Promise.all([getTemplates(), getKRAConfig()]);
  const wanted = new URL(request.url).searchParams.get("template");
  const template = templates.find((t) => t.id === wanted) ?? templates[0];
  return { templates, template, kras: template ? krasForTemplate(kras, template.id) : [] };
}

type Intent =
  | { intent: "save"; templateId: string; kras: KRAConfig[] }
  | { intent: "createTemplate"; name: string; description: string; copyFromId: string }
  | { intent: "renameTemplate"; id: string; name: string; description: string }
  | { intent: "deleteTemplate"; id: string };

type ConfigResult = ActionResult<{ templateId?: string }>;

export async function clientAction({ request }: Route.ClientActionArgs): Promise<ConfigResult> {
  try {
    const body = await readJson<Intent>(request);
    switch (body.intent) {
      case "save":
        await saveKRAConfig(body.templateId, body.kras);
        return { ok: true, message: "KRA configuration saved." };
      case "createTemplate": {
        const t = await createTemplate(body);
        return { ok: true, message: `Template "${t.name}" created with a copy of the selected KRAs. Adjust them below.`, templateId: t.id };
      }
      case "renameTemplate":
        await renameTemplate(body.id, body);
        return { ok: true, message: "Template updated." };
      case "deleteTemplate":
        await deleteTemplate(body.id);
        return { ok: true, message: "Template deleted." };
    }
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

type ConfigFetcher = ReturnType<typeof useFetcher<ConfigResult>>;

export default function KRAConfigPage({ loaderData }: Route.ComponentProps) {
  const { templates, template, kras } = loaderData;
  // The fetcher lives here so its result survives the editor remount.
  const fetcher = useFetcher<ConfigResult>();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"new" | "rename" | "delete" | null>(null);
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;

  useEffect(() => {
    if (fetcher.state !== "idle" || !result?.ok) return;
    setDialog(null);
    if (result.templateId) navigate(`/kra-config?template=${result.templateId}`);
    else if (result.message === "Template deleted.") navigate("/kra-config");
  }, [fetcher.state, result, navigate]);

  if (!template) {
    return (
      <>
        <PageHeader title="KRA Configuration" />
        <Alert tone="warning">No KRA templates exist. Restore a backup or reset to sample data in Settings.</Alert>
      </>
    );
  }

  const send = (payload: Intent) => fetcher.submit(payload, { method: "post", encType: "application/json" });
  // Remount the editor whenever stored data changes, so the draft always reflects IndexedDB.
  const version = `${template.id}|${kras.map((k) => `${k.id}:${k.updatedAt}`).join("|")}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="KRA templates">
        {templates.map((t) => (
          <Link
            key={t.id}
            role="tab"
            aria-selected={t.id === template.id}
            to={`/kra-config?template=${t.id}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${t.id === template.id ? "bg-indigo-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {t.name}
          </Link>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setDialog("new")}>+ New template</Button>
        <span className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setDialog("rename")}>Rename</Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDialog("delete")}>Delete template</Button>
        </span>
      </div>
      {template.description && <p className="-mt-2 mb-4 text-sm text-slate-500">{template.description}</p>}

      <Editor key={version} template={template} saved={kras} fetcher={fetcher} />

      {dialog === "new" && (
        <TemplateModal title="New template" templates={templates} copyFrom={template.id} busy={busy} error={result && !result.ok ? result.error : undefined}
          onClose={() => setDialog(null)} onSubmit={(v) => send({ intent: "createTemplate", name: v.name, description: v.description, copyFromId: v.copyFromId })} />
      )}
      {dialog === "rename" && (
        <TemplateModal title="Rename template" template={template} busy={busy} error={result && !result.ok ? result.error : undefined}
          onClose={() => setDialog(null)} onSubmit={(v) => send({ intent: "renameTemplate", id: template.id, name: v.name, description: v.description })} />
      )}
      <Modal
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title="Delete this template?"
        footer={
          <>
            <Button onClick={() => setDialog(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => send({ intent: "deleteTemplate", id: template.id })}>Delete template</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          “{template.name}” and its KRA configuration will be deleted. Templates that employees use cannot be deleted.
        </p>
        {result && !result.ok && <Alert tone="error" className="mt-3">{result.error}</Alert>}
      </Modal>
    </>
  );
}

function TemplateModal({
  title, template, templates, copyFrom, busy, error, onClose, onSubmit,
}: {
  title: string; template?: KRATemplate; templates?: KRATemplate[]; copyFrom?: string; busy: boolean; error?: string;
  onClose: () => void; onSubmit: (v: { name: string; description: string; copyFromId: string }) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [source, setSource] = useState(copyFrom ?? "");
  const invalid = name.trim().length < 2;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form="template-form" disabled={busy || invalid}>{busy ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="template-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!invalid) onSubmit({ name, description, copyFromId: source }); }}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" htmlFor="tpl-name"><input id="tpl-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus required /></Field>
        <Field label="Description (optional)" htmlFor="tpl-desc"><input id="tpl-desc" className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        {templates && (
          <Field label="Start from" htmlFor="tpl-source" hint="The new template begins with a copy of this template's KRAs.">
            <select id="tpl-source" className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
      </form>
    </Modal>
  );
}

function Editor({ template, saved, fetcher }: { template: KRATemplate; saved: KRAConfig[]; fetcher: ConfigFetcher }) {
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
      { id: generateId(), templateId: template.id, name: "", weightText: "0", active: true, order: rs.length + 1, createdAt: now, updatedAt: now, isNew: true },
    ]);
  };

  const fieldError = (id: string, field: string) => errors.find((e) => e.field === `${id}.${field}`)?.message;
  const result = fetcher.data;

  return (
    <>
      <PageHeader
        title={`KRA Configuration — ${template.name}`}
        description="Define the KRAs and their weights. The weights of all active KRAs in a template must add up to 100%."
        actions={
          <>
            <Button onClick={add}>Add KRA</Button>
            <Button
              variant="primary"
              disabled={busy || errors.length > 0 || !dirty}
              onClick={() => fetcher.submit({ intent: "save", templateId: template.id, kras: configs } satisfies Intent, { method: "post", encType: "application/json" })}
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
