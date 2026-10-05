import type { BackupData } from "~/types/settings";
import { validateBackup, type ParsedBackup } from "~/domain/backup";
import { DatabaseError, STORES, getAll, req, withTx } from "../indexeddb";
import { buildDefaultKRAConfig, buildDefaultSettings, buildSampleEmployees, buildSampleMonthlyKRAs } from "../seed";

const ALL = [STORES.employees, STORES.kraConfig, STORES.monthlyKRA, STORES.settings] as const;

export async function exportBackup(): Promise<BackupData> {
  const [employees, kraConfig, monthlyKRA, settings] = await Promise.all([
    getAll<unknown>(STORES.employees),
    getAll<unknown>(STORES.kraConfig),
    getAll<unknown>(STORES.monthlyKRA),
    getAll<unknown>(STORES.settings),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), employees, kraConfig, monthlyKRA, settings };
}

/**
 * Replaces all data with a backup in one transaction. The backup is validated
 * again here, so nothing is modified unless the whole file is well-formed.
 */
export async function restoreBackup(input: unknown): Promise<ParsedBackup> {
  const result = validateBackup(input);
  if (!result.ok) throw new DatabaseError("invalid", result.errors[0]);
  const { backup } = result;

  await withTx(ALL, "readwrite", async (s) => {
    for (const name of ALL) await req(s[name].clear());
    for (const e of backup.employees) await req(s[STORES.employees].put(e));
    for (const k of backup.kraConfig) await req(s[STORES.kraConfig].put(k));
    for (const m of backup.monthlyKRA) await req(s[STORES.monthlyKRA].put(m));
    for (const x of backup.settings) await req(s[STORES.settings].put(x));
    // A backup without app settings or KRAs still has to leave the app usable.
    const hasSettings = backup.settings.some((x) => x.id === "app-settings");
    if (!hasSettings) await req(s[STORES.settings].put(buildDefaultSettings()));
    if (backup.kraConfig.length === 0) {
      for (const k of buildDefaultKRAConfig()) await req(s[STORES.kraConfig].put(k));
    }
  });
  return backup;
}

/** Deletes all data, then restores the default KRA configuration and settings (no employees or records). */
export async function clearDatabase(): Promise<void> {
  await withTx(ALL, "readwrite", async (s) => {
    for (const name of ALL) await req(s[name].clear());
    for (const k of buildDefaultKRAConfig()) await req(s[STORES.kraConfig].put(k));
    await req(s[STORES.settings].put(buildDefaultSettings()));
  });
}

/** Replaces all data with the built-in sample data from `seed.ts` (useful after editing the seed). */
export async function resetToSampleData(): Promise<void> {
  await withTx(ALL, "readwrite", async (s) => {
    for (const name of ALL) await req(s[name].clear());
    for (const k of buildDefaultKRAConfig()) await req(s[STORES.kraConfig].put(k));
    for (const e of buildSampleEmployees()) await req(s[STORES.employees].put(e));
    for (const m of buildSampleMonthlyKRAs()) await req(s[STORES.monthlyKRA].put(m));
    await req(s[STORES.settings].put(buildDefaultSettings()));
  });
}
