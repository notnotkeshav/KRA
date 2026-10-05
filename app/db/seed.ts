/** Default and sample data. Pure builders; persistence lives in migrations/backup. */

import type { Employee } from "~/types/employee";
import type { KRAConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";
import { DEFAULT_SETTINGS, type AppSettings } from "~/types/settings";
import { calculateTotalAchievement } from "~/domain/kra/calculations";

const DEFAULT_KRAS: { id: string; name: string; weight: number; isGoLive?: boolean }[] = [
  { id: "kra-no-bugs", name: "No Bugs in Development", weight: 20 },
  { id: "kra-timeline", name: "Project Timeline", weight: 20 },
  { id: "kra-timesheet", name: "Timesheet", weight: 10 },
  { id: "kra-ideation", name: "Ideation", weight: 10 },
  { id: "kra-go-live", name: "Go Live", weight: 10, isGoLive: true },
  { id: "kra-grooming", name: "Team/Junior Developer Grooming / Multi Platform Work / Task Level", weight: 10 },
  { id: "kra-documentation", name: "Documentation", weight: 10 },
  { id: "kra-review", name: "Timesheet Review for Manager / ChatGPT Code", weight: 10 },
];

export function buildDefaultKRAConfig(now: string = new Date().toISOString()): KRAConfig[] {
  return DEFAULT_KRAS.map((k, i) => ({
    id: k.id,
    name: k.name,
    weight: k.weight,
    active: true,
    order: i + 1,
    ...(k.isGoLive ? { isGoLive: true } : {}),
    createdAt: now,
    updatedAt: now,
  }));
}

export function buildDefaultSettings(now: string = new Date().toISOString()): AppSettings {
  return { ...DEFAULT_SETTINGS, goLiveCarryForward: { ...DEFAULT_SETTINGS.goLiveCarryForward }, updatedAt: now };
}

export function buildSampleEmployees(now: string = new Date().toISOString()): Employee[] {
  return [
    { id: "emp-keshav", name: "Keshav Kumar", employeeCode: "HR-EMP-00307", designation: "Software Developer", active: true, createdAt: now, updatedAt: now },
  ];
}

// Values in KRA order: no bugs, timeline, timesheet, ideation, go live, grooming, documentation, review.
// Missing values in the source spreadsheet are seeded as 0. Totals are calculated, not copied.
const SAMPLE_ROWS: { employeeId: string; month: string; values: number[]; remarks: string }[] = [
  { employeeId: "emp-keshav", month: "2026-04", values: [15, 5, 5, 5, 5, 10, 0, 10], remarks: "Client visit LG, ASL" },
  { employeeId: "emp-keshav", month: "2026-05", values: [15, 15, 8, 0, 10, 5, 10, 10], remarks: "2 POC" },
  { employeeId: "emp-keshav", month: "2026-06", values: [15, 15, 8, 0, 5, 8, 7, 10], remarks: "Client visit LG, 3 POC" },
];

export function buildSampleMonthlyKRAs(now: string = new Date().toISOString()): MonthlyKRA[] {
  return SAMPLE_ROWS.map((row) => {
    const achievements: Record<string, number> = {};
    DEFAULT_KRAS.forEach((k, i) => {
      achievements[k.id] = row.values[i] ?? 0;
    });
    return {
      id: `seed-${row.employeeId}-${row.month}`,
      employeeId: row.employeeId,
      month: row.month,
      achievements,
      totalAchievement: calculateTotalAchievement(achievements),
      remarks: row.remarks,
      createdAt: now,
      updatedAt: now,
    };
  });
}
