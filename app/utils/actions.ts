import { DatabaseError } from "~/db/indexeddb";

export type ActionResult<T = unknown> =
  | ({ ok: true; message: string } & T)
  | { ok: false; error: string };

/** Converts anything thrown into a message that is safe to display (no stack traces). */
export function toErrorMessage(error: unknown): string {
  if (error instanceof DatabaseError) return error.message;
  if (import.meta.env.DEV) console.error("[kra] unexpected error", error);
  return "Something went wrong. Please try again.";
}

export function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: toErrorMessage(error) };
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
