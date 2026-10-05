import type { GoLiveCarryForwardConfig } from "./kra";

export type QuarterlyAggregation = "average" | "sum";

export type AppSettings = {
  id: string;
  goLiveCarryForward: GoLiveCarryForwardConfig;
  allowAchievementOverride: boolean;
  quarterlyAggregation: QuarterlyAggregation;
  treatMissingMonthsAsZero: boolean;
  updatedAt: string;
};

export const SETTINGS_ID = "app-settings";

export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  goLiveCarryForward: { enabled: true, percentage: 5 },
  allowAchievementOverride: false,
  quarterlyAggregation: "average",
  treatMissingMonthsAsZero: false,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export type BackupData = {
  version: 1;
  exportedAt: string;
  employees: unknown[];
  templates?: unknown[];
  kraConfig: unknown[];
  monthlyKRA: unknown[];
  settings: unknown[];
};

export type ExportFormat = "csv" | "xlsx" | "print";

export type ExportOptions = {
  year: number;
  quarter: number;
  employeeId?: string;
  format: ExportFormat;
};
