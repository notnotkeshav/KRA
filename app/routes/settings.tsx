import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/settings";
import { clearDatabase, exportBackup, resetToSampleData, restoreBackup } from "~/db/repositories/backup";
import { getSettings, updateSettings } from "~/db/repositories/settings";
import { backupSummary, parseBackupJSON, type ParsedBackup } from "~/domain/backup";
import type { AppSettings } from "~/types/settings";
import { type ActionResult, fail, readJson, toErrorMessage } from "~/utils/actions";
import { downloadText } from "~/utils/csv";
import { formatDateTime } from "~/utils/formatting";
import { Alert, Button, Card, ConfirmDialog, Field, PageHeader, inputCls } from "~/components/common/ui";

export function meta() {
  return [{ title: "Settings · KRA Management" }];
}

export async function clientLoader() {
  return { settings: await getSettings() };
}

type Intent =
  | { intent: "settings"; settings: Pick<AppSettings, "goLiveCarryForward" | "allowAchievementOverride" | "quarterlyAggregation" | "treatMissingMonthsAsZero"> }
  | { intent: "restore"; backup: unknown }
  | { intent: "clear" }
  | { intent: "sample" };

export async function clientAction({ request }: Route.ClientActionArgs): Promise<ActionResult> {
  try {
    const body = await readJson<Intent>(request);
    switch (body.intent) {
      case "settings":
        await updateSettings(body.settings);
        return { ok: true, message: "Settings saved." };
      case "restore": {
        const restored = await restoreBackup(body.backup);
        return { ok: true, message: `Backup restored: ${backupSummary(restored)}.` };
      }
      case "sample":
        await resetToSampleData();
        return { ok: true, message: "Sample data loaded." };
      case "clear":
        await clearDatabase();
        return { ok: true, message: "All data was deleted. Default KRAs and settings were restored." };
    }
  } catch (error) {
    return fail(error);
  }
}

export default function SettingsPage({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData;
  // The fetcher lives here so its result survives the view remount.
  const fetcher = useFetcher<ActionResult>();
  return <SettingsView key={settings.updatedAt} settings={settings} fetcher={fetcher} />;
}

function SettingsView({ settings, fetcher }: { settings: AppSettings; fetcher: ReturnType<typeof useFetcher<ActionResult>> }) {
  const busy = fetcher.state !== "idle";

  const [enabled, setEnabled] = useState(settings.goLiveCarryForward.enabled);
  const [percentage, setPercentage] = useState(String(settings.goLiveCarryForward.percentage));
  const [allowOverride, setAllowOverride] = useState(settings.allowAchievementOverride);
  const [aggregation, setAggregation] = useState(settings.quarterlyAggregation);
  const [missingZero, setMissingZero] = useState(settings.treatMissingMonthsAsZero);

  const pct = Number(percentage);
  const pctValid = percentage.trim() !== "" && Number.isFinite(pct) && pct >= 0 && pct <= 100;

  const [backupError, setBackupError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: ParsedBackup; name: string } | null>(null);
  const [restoreErrors, setRestoreErrors] = useState<string[]>([]);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);
  const [typed, setTyped] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setConfirmRestore(false);
      setConfirmClear(false);
      setConfirmSample(false);
      setTyped("");
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [fetcher.state, fetcher.data]);

  const send = (payload: Intent) => fetcher.submit(payload as never, { method: "post", encType: "application/json" });

  async function onBackupFile(file: File | undefined) {
    setPending(null);
    setRestoreErrors([]);
    if (!file) return;
    try {
      const result = parseBackupJSON(await file.text());
      if (result.ok) setPending({ backup: result.backup, name: file.name });
      else setRestoreErrors(result.errors);
    } catch {
      setRestoreErrors(["The file could not be read."]);
    }
  }

  async function onExportBackup() {
    setBackupError(null);
    try {
      const backup = await exportBackup();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(JSON.stringify(backup, null, 2), `kra-backup-${stamp}.json`, "application/json");
    } catch (error) {
      setBackupError(toErrorMessage(error));
    }
  }

  const result = fetcher.data;

  return (
    <>
      <PageHeader title="Settings" description="Business rules, calculation options, and data backup." />

      {result?.ok && <Alert tone="success" className="mb-4">{result.message}</Alert>}
      {result && !result.ok && !confirmRestore && !confirmClear && !confirmSample && <Alert tone="error" className="mb-4">{result.error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Business rules">
          <form
            className="space-y-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pctValid) return;
              send({
                intent: "settings",
                settings: {
                  goLiveCarryForward: { enabled, percentage: pct },
                  allowAchievementOverride: allowOverride,
                  quarterlyAggregation: aggregation,
                  treatMissingMonthsAsZero: missingZero,
                },
              });
            }}
          >
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-800">Go Live carry-forward</legend>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span>Apply carry-forward when an employee had Go Live last quarter and none this quarter.</span>
              </label>
              <Field label="Carry-forward value (%)" htmlFor="cf-pct" error={pctValid ? undefined : "Enter a number between 0 and 100."}>
                <input id="cf-pct" type="number" min={0} max={100} step="any" className={`${inputCls} max-w-32`} value={percentage} disabled={!enabled} aria-invalid={!pctValid} onChange={(e) => setPercentage(e.target.value)} />
              </Field>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-800">Quarterly calculation</legend>
              <Field label="Aggregation method" htmlFor="agg">
                <select id="agg" className={inputCls} value={aggregation} onChange={(e) => setAggregation(e.target.value as AppSettings["quarterlyAggregation"])}>
                  <option value="average">Average of months with data (default)</option>
                  <option value="sum">Sum of months</option>
                </select>
              </Field>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={missingZero} onChange={(e) => setMissingZero(e.target.checked)} />
                <span>Treat missing months as zero (average over 3 months instead of months with data).</span>
              </label>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-slate-800">Data entry</legend>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={allowOverride} onChange={(e) => setAllowOverride(e.target.checked)} />
                <span>Allow achievement above a KRA's weight (override). Also lifts the Go Live carry-forward cap.</span>
              </label>
            </fieldset>

            <Button type="submit" variant="primary" disabled={busy || !pctValid}>{busy ? "Saving…" : "Save settings"}</Button>
            <p className="text-xs text-slate-500">Last updated {formatDateTime(settings.updatedAt)}</p>
          </form>
        </Card>

        <Card title="Backup and restore">
          <div className="space-y-5 p-4 text-sm text-slate-600">
            {backupError && <Alert tone="error">{backupError}</Alert>}
            <div>
              <p className="mb-2">Download all employees, KRA configuration, monthly records and settings as a JSON file.</p>
              <Button onClick={onExportBackup}>Export backup</Button>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2">Restore from a backup file. This <strong>replaces all current data</strong>.</p>
              <label htmlFor="backup-file" className="sr-only">Backup file</label>
              <input id="backup-file" ref={fileRef} type="file" accept=".json,application/json" className={inputCls} onChange={(e) => onBackupFile(e.target.files?.[0])} />
              {restoreErrors.length > 0 && (
                <Alert tone="error" title="This backup cannot be imported. Nothing was changed." className="mt-3">
                  <ul className="list-disc pl-5">{restoreErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </Alert>
              )}
              {pending && (
                <div className="mt-3 space-y-2">
                  <Alert tone="info" title={`${pending.name} is a valid backup`}>
                    {backupSummary(pending.backup)}
                    {pending.backup.exportedAt && <> · exported {formatDateTime(pending.backup.exportedAt)}</>}
                  </Alert>
                  <Button variant="danger" onClick={() => setConfirmRestore(true)}>Restore this backup…</Button>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2">Replace all data with the built-in sample data (Keshav, Apr–Jul 2026).</p>
              <Button variant="danger" onClick={() => setConfirmSample(true)}>Reset to sample data…</Button>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2">Permanently delete every employee and monthly record. Default KRAs and settings are restored.</p>
              <Button variant="danger" onClick={() => setConfirmClear(true)}>Clear database…</Button>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmRestore}
        title="Replace all data with this backup?"
        message="All current employees, KRAs, monthly records and settings will be replaced. This cannot be undone. Consider exporting a backup first."
        confirmLabel="Replace data"
        busy={busy}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => pending && send({ intent: "restore", backup: pending.backup })}
      >
        {result && !result.ok && <Alert tone="error" className="mt-3">{result.error}</Alert>}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmSample}
        title="Replace all data with sample data?"
        message="All current employees, KRAs, monthly records and settings will be replaced by the sample data. This cannot be undone."
        confirmLabel="Load sample data"
        busy={busy}
        onCancel={() => setConfirmSample(false)}
        onConfirm={() => send({ intent: "sample" })}
      >
        {result && !result.ok && <Alert tone="error" className="mt-3">{result.error}</Alert>}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all data?"
        message="Every employee and monthly record will be permanently deleted. Type DELETE to confirm."
        confirmLabel="Delete everything"
        busy={busy || typed !== "DELETE"}
        onCancel={() => {
          setConfirmClear(false);
          setTyped("");
        }}
        onConfirm={() => send({ intent: "clear" })}
      >
        <div className="mt-3">
          <label htmlFor="confirm-delete" className="sr-only">Type DELETE to confirm</label>
          <input id="confirm-delete" className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" />
        </div>
        {result && !result.ok && <Alert tone="error" className="mt-3">{result.error}</Alert>}
      </ConfirmDialog>
    </>
  );
}
