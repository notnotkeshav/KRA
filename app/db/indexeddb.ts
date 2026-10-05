/**
 * Small promise-based IndexedDB layer. IndexedDB is the app's source of truth;
 * repositories use `withTx` so every operation is one atomic transaction.
 */

import { migrate } from "./migrations";

export const DB_NAME = "kra-db";
export const DB_VERSION = 2;

export const STORES = {
  employees: "employees",
  kraConfig: "kraConfig",
  monthlyKRA: "monthlyKRA",
  settings: "settings",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

/** Error with a message that is safe to show to users. */
export class DatabaseError extends Error {
  readonly code: "unavailable" | "blocked" | "transaction" | "constraint" | "not-found" | "invalid";
  constructor(code: DatabaseError["code"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseError";
    this.code = code;
  }
}

function logDev(label: string, error: unknown): void {
  if (import.meta.env.DEV) console.error(`[kra-db] ${label}`, error);
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Opens (once) and returns the shared connection. Upgrades and seeding run on first open. */
export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new DatabaseError("unavailable", "Local storage (IndexedDB) is not available in this browser. Private browsing modes may disable it."));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      logDev("open threw", error);
      reject(new DatabaseError("unavailable", "The browser refused to open the local database.", { cause: error }));
      return;
    }

    request.onupgradeneeded = (event) => {
      const tx = request.transaction;
      if (!tx) return;
      try {
        migrate(request.result, tx, event.oldVersion);
      } catch (error) {
        logDev("migration failed", error);
        tx.abort();
      }
    };
    request.onblocked = () => {
      reject(new DatabaseError("blocked", "The database upgrade is blocked by another open tab. Close other KRA tabs and reload."));
    };
    request.onerror = () => {
      logDev("open failed", request.error);
      reject(new DatabaseError("unavailable", "Could not open the local database. Storage may be disabled or full.", { cause: request.error }));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

/** Awaits one IDBRequest. */
export function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type StoreMap<K extends StoreName> = { [P in K]: IDBObjectStore };

function toDatabaseError(error: unknown): Error {
  if (error instanceof DatabaseError) return error;
  logDev("transaction failed", error);
  if (error instanceof DOMException) {
    if (error.name === "ConstraintError") {
      return new DatabaseError("constraint", "A record with the same unique value already exists.", { cause: error });
    }
    if (error.name === "QuotaExceededError") {
      return new DatabaseError("transaction", "The browser storage quota was exceeded.", { cause: error });
    }
  }
  return new DatabaseError("transaction", "The database operation failed. Please try again.", { cause: error });
}

/**
 * Runs `work` inside a single transaction. `work` may only await IDB requests
 * (via `req`) — awaiting anything else would let the transaction auto-commit.
 * Resolves with the result once the transaction has committed.
 */
export async function withTx<K extends StoreName, T>(
  names: readonly K[],
  mode: IDBTransactionMode,
  work: (stores: StoreMap<K>) => Promise<T>,
): Promise<T> {
  const db = await getDB();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction([...names], mode);
    } catch (error) {
      reject(toDatabaseError(error));
      return;
    }
    const stores = {} as StoreMap<K>;
    for (const name of names) stores[name] = tx.objectStore(name);

    let result: T;
    let failure: unknown;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => {
      failure ??= tx.error;
    };
    tx.onabort = () => reject(toDatabaseError(failure ?? tx.error));

    work(stores).then(
      (value) => {
        result = value;
      },
      (error) => {
        failure = error;
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
      },
    );
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return withTx([store], "readonly", (s) => req(s[store].getAll() as IDBRequest<T[]>));
}

export async function getByKey<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withTx([store], "readonly", (s) => req(s[store].get(key) as IDBRequest<T | undefined>));
}
