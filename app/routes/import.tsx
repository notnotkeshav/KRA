import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import type { Route } from "./+types/import";
import { loadAppContext } from "~/db/context";
import { getMonthlyKRAsBetween } from "~/db/repositories/monthly-kra";
import { commitImport } from "~/db/repositories/import";
import { analyzeImport, IMPORT_TEMPLATE_HEADERS } from "~/domain/import";
import type { ImportResult, ImportRow } from "~/types/settings";
import { type ActionResult, fail, readJson } from "~/utils/actions";
import { type CSVTable, downloadText, generateCSV, parseCSV } from "~/utils/csv";
import { normalizeMonth } from "~/utils/dates";
import { Alert, Button, Card, PageHeader, inputCls } from "~/components/common/ui";
import { ImportPreviewTable, summarizeRows } from "~/components/import/ImportPreviewTable";

export function meta() {
  return [{ title: "Import · KRA Management" }];
}

export async function clientLoader() {
  return { ctx: await loadAppContext() };
}

type CommitResult = ActionResult<{ result: ImportResult }>;

export async function clientAction({ request }: Route.ClientActionArgs): Promise<CommitResult> {
  try {
    const { rows, overwrite } = await readJson<{ rows: ImportRow[]; overwrite: boolean }>(request);
    if (!Array.isArray(rows)) return { ok: false, error: "Nothing to import." };
    const result = await commitImport(rows, overwrite);
    return { ok: true, message: "Import complete.", result };
  } catch (error) {
    return fail(error);
  }
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function ImportPage({ loaderData }: Route.ComponentProps) {
  const { kras, employees, settings } = loaderData.ctx;
  const fetcher = useFetcher<CommitResult>();
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<CSVTable | null>(null);
  const [existing, setExisting] = useState<{ id: string; employeeId: string; month: string }[]>([]);
  const [createMissing, setCreateMissing] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const preview = useMemo(
    () => (table ? analyzeImport(table, { kras, employees, existingRecords: existing, settings, createMissingEmployees: createMissing }) : null),
    [table, kras, employees, existing, settings, createMissing],
  );
  const counts = preview ? summarizeRows(preview.rows) : null;
  const importable = preview ? preview.rows.filter((r) => r.status !== "error" && (overwrite || !r.existingRecordId)).length : 0;

  const busy = fetcher.state !== "idle";
  const done = fetcher.data?.ok ? fetcher.data.result : null;

  // After a successful commit, drop the preview; the loader has already refreshed from IndexedDB.
  useEffect(() => {
    if (done) {
      setTable(null);
      setFileName("");
    }
  }, [done]);

  async function onFile(file: File | undefined) {
    setReadError(null);
    setTable(null);
    fetcher.reset?.();
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setReadError("That file is larger than 5 MB.");
    try {
      const parsed = parseCSV(await file.text());
      // Look up existing records only for the months the file mentions.
      const monthCol = parsed.headers.find((h) => h.toLowerCase() === "month");
      const months = monthCol ? parsed.rows.map((r) => normalizeMonth(r.values[monthCol] ?? "")).filter((m): m is string => !!m).sort() : [];
      setExisting(months.length ? await getMonthlyKRAsBetween(months[0], months.at(-1)!) : []);
      setFileName(file.name);
      setTable(parsed);
    } catch {
      setReadError("The file could not be read. Make sure it is a CSV text file.");
    }
  }

  return (
    <>
      <PageHeader
        title="Import"
        description="Import monthly KRA data from a CSV export of your spreadsheet. You review everything before anything is saved."
        actions={
          <Button onClick={() => downloadText(generateCSV([IMPORT_TEMPLATE_HEADERS]), "kra-import-template.csv", "text/csv")}>Download template</Button>
        }
      />

      {done && (
        <Alert tone="success" title="Import complete" className="mb-4">
          {done.imported} new, {done.overwritten} overwritten, {done.skipped} skipped
          {done.createdEmployees > 0 && `, ${done.createdEmployees} employee(s) created`}.{" "}
          <Link to="/quarterly" className="font-medium underline">View quarterly results</Link>
        </Alert>
      )}
      {fetcher.data && !fetcher.data.ok && <Alert tone="error" className="mb-4">{fetcher.data.error}</Alert>}
      {readError && <Alert tone="error" className="mb-4">{readError}</Alert>}

      <Card title="1. Choose a CSV file">
        <div className="space-y-3 p-4">
          <label htmlFor="csv-file" className="sr-only">CSV file</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" className={inputCls} onChange={(e) => onFile(e.target.files?.[0])} />
          <p className="text-xs text-slate-500">
            Expected columns: Employee, one column per KRA, Month (e.g. Apr-26), Total Achv., Remarks. Totals are always recalculated; the
            imported total is only compared.
          </p>
        </div>
      </Card>

      {preview && counts && (
        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">2. Review {fileName && <span className="font-normal text-slate-500">({fileName})</span>}</h2>

          {preview.fileErrors.map((e) => <Alert key={e} tone="error">{e}</Alert>)}
          {preview.unmatchedColumns.length > 0 && (
            <Alert tone="warning" title="Columns that do not match any KRA were ignored">{preview.unmatchedColumns.join(", ")}</Alert>
          )}
          {preview.missingKRAs.length > 0 && preview.rows.length > 0 && (
            <Alert tone="warning" title="No column found for these KRAs (imported as 0)">{preview.missingKRAs.join(", ")}</Alert>
          )}

          {preview.rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="font-medium text-green-700">{counts.ready} ready</span>
                <span className="font-medium text-amber-700">{counts.warning} with warnings</span>
                <span className="font-medium text-red-700">{counts.error} with errors (will be skipped)</span>
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
                  Create missing employees
                </label>
                {counts.existing > 0 && (
                  <label className="flex items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                    Overwrite {counts.existing} existing record(s)
                  </label>
                )}
              </div>

              <ImportPreviewTable preview={preview} />

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  disabled={busy || importable === 0}
                  onClick={() => fetcher.submit({ rows: preview.rows, overwrite }, { method: "post", encType: "application/json" })}
                >
                  {busy ? "Importing…" : `Import ${importable} record${importable === 1 ? "" : "s"}`}
                </Button>
                <span className="text-xs text-slate-500">Rows with errors are never imported.</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
