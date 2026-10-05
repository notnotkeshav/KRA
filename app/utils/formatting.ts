/** Number and text display helpers. Calculations stay precise; only display rounds. */

export function roundTo(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** "65.33" / "68": at most 2 decimals, no trailing zeros. */
export function formatNumber(value: number, decimals: number = 2): string {
  return String(roundTo(value, decimals));
}

export function formatPercentage(value: number, decimals: number = 2): string {
  return `${formatNumber(value, decimals)}%`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Short column label: "Team/Junior Developer Grooming / ..." -> "Team/Junior Developer Grooming". */
export function shortKraName(name: string): string {
  const first = name.split(" / ")[0];
  return first.length > 34 ? `${first.slice(0, 32)}…` : first;
}
