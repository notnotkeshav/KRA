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
  kraConfig: unknown[];
  monthlyKRA: unknown[];
  settings: unknown[];
};

export type ImportIssue = {
  row: number;
  field: string;
  message: string;
};

export type ImportRowStatus = "ready" | "warning" | "error";

export type ImportRow = {
  rowNumber: number;
  employeeName: string;
  employeeId: string | null; // null => employee must be created
  createEmployee: boolean;
  month: string;
  achievements: Record<string, number>;
  calculatedTotal: number;
  importedTotal: number | null;
  remarks: string;
  existingRecordId: string | null;
  status: ImportRowStatus;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

export type ImportPreview = {
  rows: ImportRow[];
  fileErrors: string[];
  unmatchedColumns: string[];
  missingKRAs: string[];
};

export type ImportResult = {
  imported: number;
  skipped: number;
  overwritten: number;
  createdEmployees: number;
};

export type ExportFormat = "csv" | "xlsx" | "print";

export type ExportOptions = {
  year: number;
  quarter: number;
  employeeId?: string;
  format: ExportFormat;
};
