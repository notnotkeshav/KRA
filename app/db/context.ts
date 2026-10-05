import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { KRATemplate } from "~/types/template";
import type { AppSettings } from "~/types/settings";
import { getEmployees } from "./repositories/employees";
import { getKRAConfig } from "./repositories/kra-config";
import { getTemplates } from "./repositories/templates";
import { getSettings } from "./repositories/settings";

export type AppContext = {
  employees: Employee[];
  templates: KRATemplate[];
  /** KRAs of every template; use `krasForTemplate` to pick one. */
  kras: KRAConfig[];
  settings: AppSettings;
};

/** The small, always-needed reference data (employees, KRA config, settings). */
export async function loadAppContext(): Promise<AppContext> {
  const [employees, templates, kras, settings] = await Promise.all([getEmployees(), getTemplates(), getKRAConfig(), getSettings()]);
  return { employees, templates, kras, settings };
}
