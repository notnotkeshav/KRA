import type { GoLiveOverride } from "~/types/monthly-kra";
import { SETTINGS_ID, type AppSettings } from "~/types/settings";
import { overrideId } from "~/domain/kra/quarterly";
import { DatabaseError, STORES, getAll, req, withTx } from "../indexeddb";
import { buildDefaultSettings } from "../seed";

const S = STORES.settings;

function isValidSettings(value: unknown): value is AppSettings {
  const s = value as Partial<AppSettings> | undefined;
  return (
    !!s &&
    typeof s.goLiveCarryForward?.enabled === "boolean" &&
    typeof s.goLiveCarryForward.percentage === "number" &&
    typeof s.allowAchievementOverride === "boolean" &&
    (s.quarterlyAggregation === "average" || s.quarterlyAggregation === "sum") &&
    typeof s.treatMissingMonthsAsZero === "boolean"
  );
}

/** Returns stored settings; missing or corrupted data falls back to defaults. */
export async function getSettings(): Promise<AppSettings> {
  const stored = await withTx([S], "readonly", (s) => req(s[S].get(SETTINGS_ID) as IDBRequest<unknown>));
  if (isValidSettings(stored)) return stored;
  const defaults = buildDefaultSettings();
  await withTx([S], "readwrite", (s) => req(s[S].put(defaults)));
  return defaults;
}

export async function updateSettings(changes: Partial<Omit<AppSettings, "id" | "updatedAt">>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...changes, id: SETTINGS_ID, updatedAt: new Date().toISOString() };
  if (next.goLiveCarryForward.percentage < 0 || next.goLiveCarryForward.percentage > 100 || !Number.isFinite(next.goLiveCarryForward.percentage)) {
    throw new DatabaseError("invalid", "Carry-forward percentage must be between 0 and 100.");
  }
  await withTx([S], "readwrite", (s) => req(s[S].put(next)));
  return next;
}

// ---- Go Live overrides (stored as documents in the settings store) ----

function isOverride(v: unknown): v is GoLiveOverride {
  return typeof v === "object" && v !== null && (v as { kind?: unknown }).kind === "goLiveOverride";
}

export async function getGoLiveOverrides(year: number, quarter: number): Promise<GoLiveOverride[]> {
  const all = await getAll<unknown>(S);
  return all.filter(isOverride).filter((o) => o.year === year && o.quarter === quarter);
}

export async function getAllGoLiveOverrides(): Promise<GoLiveOverride[]> {
  return (await getAll<unknown>(S)).filter(isOverride);
}

export async function setGoLiveOverride(employeeId: string, year: number, quarter: number, value: number): Promise<GoLiveOverride> {
  if (!Number.isFinite(value) || value < 0) throw new DatabaseError("invalid", "Override must be a number of 0 or more.");
  const id = overrideId(employeeId, year, quarter);
  return withTx([S], "readwrite", async (s) => {
    const existing = await req(s[S].get(id) as IDBRequest<GoLiveOverride | undefined>);
    const now = new Date().toISOString();
    const record: GoLiveOverride = {
      id,
      kind: "goLiveOverride",
      employeeId,
      year,
      quarter,
      value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await req(s[S].put(record));
    return record;
  });
}

export async function clearGoLiveOverride(employeeId: string, year: number, quarter: number): Promise<void> {
  await withTx([S], "readwrite", (s) => req(s[S].delete(overrideId(employeeId, year, quarter))));
}

