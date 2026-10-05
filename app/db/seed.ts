/** Default and sample data. Pure builders; persistence lives in migrations/backup. */

import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import { DEVELOPER_TEMPLATE_ID, FUNCTIONAL_TEMPLATE_ID, type KRATemplate } from "~/types/template";
import type { MonthlyKRA } from "~/types/monthly-kra";
import { DEFAULT_SETTINGS, type AppSettings } from "~/types/settings";
import { calculateTotalAchievement } from "~/domain/kra/calculations";

type KRADef = { id: string; name: string; weight: number; description?: string; isGoLive?: boolean };

const DEVELOPER_KRAS: KRADef[] = [
  { id: "kra-no-bugs", name: "No Bugs in Development", weight: 20 },
  { id: "kra-timeline", name: "Project Timeline", weight: 20 },
  { id: "kra-timesheet", name: "Timesheet", weight: 10 },
  { id: "kra-ideation", name: "Ideation", weight: 10 },
  { id: "kra-go-live", name: "Go Live", weight: 10, isGoLive: true },
  { id: "kra-grooming", name: "Team/Junior Developer Grooming / Multi Platform Work / Task Level", weight: 10 },
  { id: "kra-documentation", name: "Documentation", weight: 10 },
  { id: "kra-review", name: "Timesheet Review for Manager / ChatGPT Code", weight: 10 },
];

const FUNCTIONAL_KRAS: KRADef[] = [
  { id: "fkra-demo", name: "Demo / Ideation", weight: 10, description: "Demo achievement (10 demos target) / ideation" },
  { id: "fkra-accounts", name: "Accounts", weight: 20, description: "4 existing, 2 new accounts" },
  { id: "fkra-go-live", name: "Go Live", weight: 10, isGoLive: true },
  { id: "fkra-installment", name: "Any Installment after First", weight: 10 },
  { id: "fkra-testimonials", name: "Testimonials", weight: 10, description: "2 testimonials target" },
  { id: "fkra-timeline", name: "Project Timeline", weight: 20 },
  { id: "fkra-client-visit", name: "Client Visit", weight: 10 },
  { id: "fkra-timesheet", name: "Timesheet", weight: 10 },
];

function buildKRAs(defs: KRADef[], templateId: string, now: string): KRAConfig[] {
  return defs.map((k, i) => ({
    id: k.id,
    templateId,
    name: k.name,
    weight: k.weight,
    ...(k.description ? { description: k.description } : {}),
    active: true,
    order: i + 1,
    ...(k.isGoLive ? { isGoLive: true } : {}),
    createdAt: now,
    updatedAt: now,
  }));
}

export function buildDefaultTemplates(now: string = new Date().toISOString()): KRATemplate[] {
  return [
    { id: DEVELOPER_TEMPLATE_ID, name: "Developer", description: "KRAs for developers", createdAt: now, updatedAt: now },
    { id: FUNCTIONAL_TEMPLATE_ID, name: "Functional", description: "KRAs for functional / team roles", createdAt: now, updatedAt: now },
  ];
}

/** Developer template KRAs (the original default set). */
export function buildDefaultKRAConfig(now: string = new Date().toISOString()): KRAConfig[] {
  return buildKRAs(DEVELOPER_KRAS, DEVELOPER_TEMPLATE_ID, now);
}

export function buildFunctionalKRAConfig(now: string = new Date().toISOString()): KRAConfig[] {
  return buildKRAs(FUNCTIONAL_KRAS, FUNCTIONAL_TEMPLATE_ID, now);
}

/** KRAs of every built-in template. */
export function buildAllDefaultKRAConfig(now: string = new Date().toISOString()): KRAConfig[] {
  return [...buildDefaultKRAConfig(now), ...buildFunctionalKRAConfig(now)];
}

export function buildDefaultSettings(now: string = new Date().toISOString()): AppSettings {
  return { ...DEFAULT_SETTINGS, goLiveCarryForward: { ...DEFAULT_SETTINGS.goLiveCarryForward }, updatedAt: now };
}

export function buildSampleEmployees(now: string = new Date().toISOString()): Employee[] {
  return [
    { id: "emp-keshav", name: "Keshav Kumar", templateId: DEVELOPER_TEMPLATE_ID, employeeCode: "HR-EMP-00307", designation: "Software Developer", active: true, createdAt: now, updatedAt: now },
    { id: "emp-babita", name: "Babita", templateId: FUNCTIONAL_TEMPLATE_ID, active: true, createdAt: now, updatedAt: now },
  ];
}

// Values follow the KRA order of each template. Missing values in the source spreadsheets are seeded as 0.
// Totals are calculated, not copied.
// Developer: no bugs, timeline, timesheet, ideation, go live, grooming, documentation, review.
// Functional: demo/ideation, accounts, go live, installment, testimonials, timeline, client visit, timesheet.
const SAMPLE_ROWS: { employeeId: string; month: string; values: number[]; remarks: string; functional?: boolean }[] = [
  { employeeId: "emp-keshav", month: "2026-04", values: [15, 5, 5, 5, 5, 10, 0, 10], remarks: "Client visit LG, ASL" },
  { employeeId: "emp-keshav", month: "2026-05", values: [15, 15, 8, 0, 10, 5, 10, 10], remarks: "2 POC" },
  { employeeId: "emp-keshav", month: "2026-06", values: [15, 15, 8, 0, 5, 8, 7, 10], remarks: "Client visit LG, 3 POC" },
  { employeeId: "emp-babita", month: "2026-04", values: [2, 10, 1, 0, 10, 1, 5, 5], remarks: "", functional: true },
  { employeeId: "emp-babita", month: "2026-05", values: [2, 15, 5, 10, 10, 5, 10, 8], remarks: "10 issues", functional: true },
  { employeeId: "emp-babita", month: "2026-06", values: [2, 15, 5, 0, 10, 5, 10, 8], remarks: "7 issues", functional: true },
];

export function buildSampleMonthlyKRAs(now: string = new Date().toISOString()): MonthlyKRA[] {
  return SAMPLE_ROWS.map((row) => {
    const defs = row.functional ? FUNCTIONAL_KRAS : DEVELOPER_KRAS;
    const achievements: Record<string, number> = {};
    defs.forEach((k, i) => {
      achievements[k.id] = row.values[i] ?? 0;
    });
    return {
      id: `seed-${row.employeeId}-${row.month}`,
      employeeId: row.employeeId,
      month: row.month,
      achievements,
      totalAchievement: calculateTotalAchievement(achievements),
      remarks: row.remarks || undefined,
      createdAt: now,
      updatedAt: now,
    };
  });
}
