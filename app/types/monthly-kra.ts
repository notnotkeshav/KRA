import type { GoLiveAchievement } from "./kra";

export type MonthlyKRA = {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  achievements: Record<string, number>; // kraId -> achievement points
  /** Snapshot of the total at save time. Reports always recompute from achievements. */
  totalAchievement: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyKRAInput = {
  employeeId: string;
  month: string;
  achievements: Record<string, number>;
  remarks?: string;
};

/** A manual replacement of the automatically calculated Go Live quarterly value. */
export type GoLiveOverride = {
  id: string; // goLiveOverride:<employeeId>:<year>-Q<quarter>
  kind: "goLiveOverride";
  employeeId: string;
  year: number;
  quarter: number;
  value: number;
  createdAt: string;
  updatedAt: string;
};

export type QuarterlyCategory = {
  /** Aggregated value from monthly entries only. */
  manual: number;
  /** Value used in the report (includes Go Live carry-forward / override). */
  final: number;
};

export type QuarterlyKRA = {
  employeeId: string;
  employeeName: string;
  year: number;
  quarter: number; // 1-4
  /** All three months of the quarter, in order. */
  quarterMonths: string[];
  /** Months of the quarter that have a record. */
  months: string[];
  monthlyRecords: MonthlyKRA[];
  /** month -> total recalculated from active KRAs. */
  monthlyTotals: Record<string, number>;
  categories: Record<string, QuarterlyCategory>;
  /** Mean (or sum, per settings) of monthly totals, before Go Live adjustments. */
  monthlyAverage: number;
  /** Sum of final category values: what the quarterly report shows. */
  quarterlyAchievement: number;
  maxPossible: number;
  goLive: GoLiveAchievement | null;
  goLiveOverride: number | null;
  remarks: { month: string; text: string }[];
};
