/**
 * Schema migrations. Each step is idempotent so a half-upgraded or legacy
 * database converges on the current schema instead of failing.
 *
 *  v1: object stores and indexes
 *  v2: first-run seeding (only when the database is empty) and Go Live flag repair
 */

import type { KRAConfig } from "~/types/kra";
import {
  buildDefaultKRAConfig,
  buildDefaultSettings,
  buildSampleEmployees,
  buildSampleMonthlyKRAs,
} from "./seed";

type StoreNames = { employees: string; kraConfig: string; monthlyKRA: string; settings: string };
const S: StoreNames = { employees: "employees", kraConfig: "kraConfig", monthlyKRA: "monthlyKRA", settings: "settings" };

function ensureStore(db: IDBDatabase, tx: IDBTransaction, name: string, options: IDBObjectStoreParameters): IDBObjectStore {
  return db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, options);
}

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string | string[], options?: IDBIndexParameters): void {
  if (store.indexNames.contains(name)) {
    const existing = store.index(name);
    const same = JSON.stringify(existing.keyPath) === JSON.stringify(keyPath) && existing.unique === !!options?.unique;
    if (same) return;
    store.deleteIndex(name);
  }
  store.createIndex(name, keyPath, options);
}

function createSchema(db: IDBDatabase, tx: IDBTransaction): void {
  const employees = ensureStore(db, tx, S.employees, { keyPath: "id" });
  ensureIndex(employees, "name", "name", { unique: true });
  ensureIndex(employees, "active", "active");

  const kra = ensureStore(db, tx, S.kraConfig, { keyPath: "id" });
  ensureIndex(kra, "order", "order");

  const monthly = ensureStore(db, tx, S.monthlyKRA, { keyPath: "id" });
  ensureIndex(monthly, "employeeId", "employeeId");
  ensureIndex(monthly, "month", "month");
  ensureIndex(monthly, "employeeId_month", ["employeeId", "month"], { unique: true });

  ensureStore(db, tx, S.settings, { keyPath: "id" });
}

function seedIfEmpty(tx: IDBTransaction): void {
  const employees = tx.objectStore(S.employees);
  const kra = tx.objectStore(S.kraConfig);
  const counts = [employees.count(), kra.count()];
  let pending = counts.length;

  const done = () => {
    if (--pending > 0) return;
    const [employeeCount, kraCount] = counts.map((c) => c.result);
    const now = new Date().toISOString();
    if (kraCount === 0) {
      for (const k of buildDefaultKRAConfig(now)) kra.put(k);
      tx.objectStore(S.settings).put(buildDefaultSettings(now));
    }
    if (employeeCount === 0 && kraCount === 0) {
      for (const e of buildSampleEmployees(now)) employees.put(e);
      for (const m of buildSampleMonthlyKRAs(now)) tx.objectStore(S.monthlyKRA).put(m);
    }
  };
  counts.forEach((c) => (c.onsuccess = done));
}

/** Older databases have no `isGoLive` flag; infer it once from the KRA name. */
function repairGoLiveFlag(tx: IDBTransaction): void {
  const store = tx.objectStore(S.kraConfig);
  store.getAll().onsuccess = (event) => {
    const all = (event.target as IDBRequest<KRAConfig[]>).result;
    if (all.length === 0 || all.some((k) => k.isGoLive)) return;
    const goLive = all.find((k) => /go[\s-]?live/i.test(k.name));
    if (goLive) store.put({ ...goLive, isGoLive: true });
  };
}

export function migrate(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  if (oldVersion < 1) createSchema(db, tx);
  if (oldVersion < 2) {
    createSchema(db, tx); // repairs legacy v1 databases created before indexes were finalised
    seedIfEmpty(tx);
    repairGoLiveFlag(tx);
  }
}
