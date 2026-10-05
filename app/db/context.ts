import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { AppSettings } from "~/types/settings";
import { getEmployees } from "./repositories/employees";
import { getKRAConfig } from "./repositories/kra-config";
import { getSettings } from "./repositories/settings";

export type AppContext = {
  employees: Employee[];
  kras: KRAConfig[];
  settings: AppSettings;
};

/** The small, always-needed reference data (employees, KRA config, settings). */
export async function loadAppContext(): Promise<AppContext> {
  const [employees, kras, settings] = await Promise.all([getEmployees(), getKRAConfig(), getSettings()]);
  return { employees, kras, settings };
}
