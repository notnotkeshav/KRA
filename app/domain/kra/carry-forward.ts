/**
 * Go Live carry-forward.
 *
 * Rule: if an employee had Go Live achievement in the previous quarter and no
 * Go Live activity in the current quarter, the current quarter receives a
 * configurable amount (default 5) instead of zero.
 *
 * Interpretation choices (documented because the rule leaves them open):
 *  - "Go Live activity" means manually entered Go Live points > 0 in any month.
 *  - The previous quarter only counts its *manual* points, so a carried value
 *    never chains forward on its own.
 *  - An employee with no monthly records at all in the quarter gets nothing.
 */

import type { GoLiveAchievement, GoLiveCarryForwardConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";
import { sumValues } from "./calculations";

export type CarryForwardInput = {
  currentRecords: MonthlyKRA[];
  previousRecords: MonthlyKRA[];
  goLiveKraId: string;
  config: GoLiveCarryForwardConfig;
  goLiveWeight: number;
  /** Aggregated manual quarterly Go Live value (already averaged/summed). */
  manualQuarterly: number;
  /** When true the weight cap is not enforced. */
  allowOverCap?: boolean;
};

function goLivePoints(records: MonthlyKRA[], kraId: string): number {
  return sumValues(records.map((r) => r.achievements[kraId] ?? 0));
}

export function shouldApplyCarryForward(
  currentRecords: MonthlyKRA[],
  previousRecords: MonthlyKRA[],
  goLiveKraId: string,
  config: GoLiveCarryForwardConfig,
): boolean {
  if (!config.enabled || config.percentage <= 0) return false;
  if (currentRecords.length === 0) return false;
  return goLivePoints(previousRecords, goLiveKraId) > 0 && goLivePoints(currentRecords, goLiveKraId) <= 0;
}

export function calculateGoLiveCarryForward(input: CarryForwardInput): GoLiveAchievement {
  const { currentRecords, previousRecords, goLiveKraId, config, goLiveWeight, manualQuarterly, allowOverCap } = input;

  let carryForward = shouldApplyCarryForward(currentRecords, previousRecords, goLiveKraId, config)
    ? config.percentage
    : 0;

  // manual + carry-forward must never exceed the KRA weight unless overrides are allowed.
  if (!allowOverCap) {
    carryForward = Math.max(0, Math.min(carryForward, goLiveWeight - manualQuarterly));
  }

  const source: GoLiveAchievement["source"] =
    carryForward > 0 ? (manualQuarterly > 0 ? "manual+carry-forward" : "carry-forward") : "manual";

  return { manual: manualQuarterly, carryForward, total: manualQuarterly + carryForward, source };
}

export function describeGoLiveSource(source: GoLiveAchievement["source"]): string {
  switch (source) {
    case "carry-forward":
      return "Quarterly carry-forward";
    case "manual+carry-forward":
      return "Manual entry + carry-forward";
    default:
      return "Manual entry";
  }
}
