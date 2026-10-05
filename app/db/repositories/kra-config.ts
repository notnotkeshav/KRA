import type { KRAConfig } from "~/types/kra";
import { validateKRAConfigSet } from "~/domain/kra/validation";
import { DatabaseError, STORES, getAll, getByKey, req, withTx } from "../indexeddb";

const S = STORES.kraConfig;

export async function getKRAConfig(): Promise<KRAConfig[]> {
  const all = await getAll<KRAConfig>(S);
  return all.sort((a, b) => a.order - b.order);
}

export async function getActiveKRAConfig(): Promise<KRAConfig[]> {
  return (await getKRAConfig()).filter((k) => k.active);
}

export function getKRA(id: string): Promise<KRAConfig | undefined> {
  return getByKey<KRAConfig>(S, id);
}

/**
 * Replaces the whole KRA configuration atomically. The set is validated first
 * (names, weights, total active weight = 100) so an invalid config is never stored.
 * KRAs missing from `next` are removed only if no monthly record references them.
 */
export async function saveKRAConfig(next: KRAConfig[]): Promise<KRAConfig[]> {
  const problems = validateKRAConfigSet(next);
  if (problems.length) throw new DatabaseError("invalid", problems[0].message);

  const now = new Date().toISOString();
  const normalized = next.map((k, i): KRAConfig => ({
    ...k,
    name: k.name.trim(),
    description: k.description?.trim() || undefined,
    order: i + 1,
    updatedAt: now,
  }));

  return withTx([S, STORES.monthlyKRA], "readwrite", async (s) => {
    const existing = await req(s[S].getAll() as IDBRequest<KRAConfig[]>);
    const keep = new Set(normalized.map((k) => k.id));
    const removed = existing.filter((k) => !keep.has(k.id));
    if (removed.length) {
      const records = await req(s[STORES.monthlyKRA].getAll() as IDBRequest<{ achievements: Record<string, number> }[]>);
      for (const k of removed) {
        if (records.some((r) => k.id in r.achievements)) {
          throw new DatabaseError("invalid", `"${k.name}" has recorded achievements and cannot be deleted. Disable it instead.`);
        }
        await req(s[S].delete(k.id));
      }
    }
    for (const k of normalized) await req(s[S].put(k));
    return normalized;
  });
}
