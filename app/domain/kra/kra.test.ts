import { describe, expect, it } from "vitest";
import { buildDefaultKRAConfig, buildDefaultSettings } from "~/db/seed";
import type { KRAConfig } from "~/types/kra";
import type { MonthlyKRA } from "~/types/monthly-kra";
import { validateBackup } from "../backup";
import { analyzeImport } from "../import";
import { parseCSV } from "~/utils/csv";
import { normalizeMonth } from "~/utils/dates";
import { buildQuarterlyReport, flattenReport } from "../export";
import { buildXlsxBytes, crc32 } from "~/utils/xlsx";
import {
  calculateCategoryAchievement,
  calculateMonthlyAchievement,
  calculateQuarterlyAverage,
  calculateTotalAchievement,
} from "./calculations";
import { calculateGoLiveCarryForward } from "./carry-forward";
import { buildQuarterlyKRA } from "./quarterly";
import {
  findDuplicateMonthlyRecords,
  validateAchievement,
  validateKRAWeights,
  validateMonthlyEntry,
  validateEmployeeName,
} from "./validation";

const kras = buildDefaultKRAConfig();
const settings = buildDefaultSettings();
const KESHAV = { id: "emp-keshav", name: "Keshav", active: true, createdAt: "", updatedAt: "" };
const employees = [KESHAV];
const GO_LIVE = "kra-go-live";

// Self-contained fixture (independent of seed.ts). Values in KRA order: no bugs, timeline,
// timesheet, ideation, go live, grooming, documentation, review.
const FIXTURE: [string, number[], string][] = [
  ["2026-04", [15, 5, 5, 5, 5, 10, 0, 10], "Client visit LG, ASL"],
  ["2026-05", [15, 15, 8, 0, 10, 5, 10, 10], "2 POC"],
  ["2026-06", [15, 15, 8, 0, 5, 8, 7, 10], "Client visit LG, 3 POC"],
];
const seeded: MonthlyKRA[] = FIXTURE.map(([month, values, remarks]) => ({
  id: `fx-${month}`,
  employeeId: KESHAV.id,
  month,
  achievements: Object.fromEntries(kras.map((k, i) => [k.id, values[i]])),
  totalAchievement: 0,
  remarks,
  createdAt: "",
  updatedAt: "",
}));

function record(employeeId: string, month: string, goLive: number, extra: Partial<Record<string, number>> = {}): MonthlyKRA {
  const achievements: Record<string, number> = Object.fromEntries(kras.map((k) => [k.id, 0]));
  achievements[GO_LIVE] = goLive;
  Object.assign(achievements, extra);
  return { id: `${employeeId}-${month}`, employeeId, month, achievements, totalAchievement: 0, createdAt: "", updatedAt: "" };
}

describe("monthly totals", () => {
  it("sums the spec example to 68", () => {
    const june = seeded.find((r) => r.employeeId === KESHAV.id && r.month === "2026-06")!;
    expect(calculateTotalAchievement(june.achievements)).toBe(68);
    expect(calculateMonthlyAchievement(june.achievements, kras)).toBe(68);
  });

  it("recalculates fixture totals rather than trusting inputs", () => {
    const totals = seeded.map((r) => calculateMonthlyAchievement(r.achievements, kras));
    expect(totals).toEqual([55, 73, 68]);
  });

  it("ignores disabled KRAs", () => {
    const disabled = kras.map((k) => (k.id === "kra-ideation" ? { ...k, active: false } : k));
    expect(calculateMonthlyAchievement({ "kra-ideation": 9, "kra-timesheet": 4 }, disabled)).toBe(4);
  });
});

describe("quarterly aggregation", () => {
  it("averages Keshav's Q2 to 65.33", () => {
    const q = buildQuarterlyKRA(KESHAV, 2026, 2, seeded, kras, settings);
    expect(q.months).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(q.monthlyAverage).toBeCloseTo(65.3333, 3);
    expect(q.quarterlyAchievement).toBeCloseTo(65.3333, 3);
  });

  it("does not treat missing months as zero by default, but can be configured to", () => {
    expect(calculateQuarterlyAverage([55, 73])).toBe(64);
    expect(
      calculateQuarterlyAverage([55, 73], { method: "average", treatMissingAsZero: true, expectedMonths: 3 }),
    ).toBeCloseTo(42.6667, 3);
    const twoMonths = seeded.slice(0, 2); // June missing
    const loose = buildQuarterlyKRA(KESHAV, 2026, 2, twoMonths, kras, settings);
    expect(loose.months).toHaveLength(2);
    expect(loose.monthlyAverage).toBe(64);
    const strict = buildQuarterlyKRA(KESHAV, 2026, 2, twoMonths, kras, { ...settings, treatMissingMonthsAsZero: true });
    expect(strict.monthlyAverage).toBeCloseTo(42.6667, 3);
  });

  it("supports the sum aggregation method", () => {
    const q = buildQuarterlyKRA(KESHAV, 2026, 2, seeded, kras, { ...settings, quarterlyAggregation: "sum" });
    expect(q.quarterlyAchievement).toBe(196);
    expect(q.maxPossible).toBe(300);
  });

  it("averages category values over months with data", () => {
    const records = [record("a", "2026-04", 5), record("a", "2026-05", 10)];
    expect(calculateCategoryAchievement(records, GO_LIVE)).toBe(7.5);
    expect(calculateCategoryAchievement([], GO_LIVE)).toBe(0);
  });

  it("returns an empty summary for a quarter without data", () => {
    const q = buildQuarterlyKRA(KESHAV, 2026, 4, seeded, kras, settings);
    expect(q.months).toEqual([]);
    expect(q.quarterlyAchievement).toBe(0);
    expect(q.goLive?.carryForward).toBe(0);
  });

  it("excludes disabled KRAs from columns and max", () => {
    const disabled = kras.map((k) => (k.id === "kra-ideation" ? { ...k, active: false } : k));
    const q = buildQuarterlyKRA(KESHAV, 2026, 2, seeded, disabled, settings);
    expect(Object.keys(q.categories)).not.toContain("kra-ideation");
    expect(q.maxPossible).toBe(90);
  });
});

describe("Go Live carry-forward", () => {
  const cfg = settings.goLiveCarryForward;
  const base = { goLiveKraId: GO_LIVE, config: cfg, goLiveWeight: 10 };

  it("applies 5% when the previous quarter had Go Live and the current has none", () => {
    const r = calculateGoLiveCarryForward({
      ...base,
      currentRecords: [record("a", "2026-07", 0)],
      previousRecords: [record("a", "2026-05", 10)],
      manualQuarterly: 0,
    });
    expect(r).toEqual({ manual: 0, carryForward: 5, total: 5, source: "carry-forward" });
  });

  it("does not apply when the current quarter has Go Live activity", () => {
    const r = calculateGoLiveCarryForward({
      ...base,
      currentRecords: [record("a", "2026-07", 4)],
      previousRecords: [record("a", "2026-05", 10)],
      manualQuarterly: 4,
    });
    expect(r.carryForward).toBe(0);
    expect(r.source).toBe("manual");
  });

  it("does not apply when the previous quarter had no Go Live, or the employee has no current records", () => {
    const none = calculateGoLiveCarryForward({ ...base, currentRecords: [record("a", "2026-07", 0)], previousRecords: [record("a", "2026-05", 0)], manualQuarterly: 0 });
    expect(none.carryForward).toBe(0);
    const empty = calculateGoLiveCarryForward({ ...base, currentRecords: [], previousRecords: [record("a", "2026-05", 10)], manualQuarterly: 0 });
    expect(empty.carryForward).toBe(0);
  });

  it("can be disabled and is capped at the KRA weight", () => {
    const off = calculateGoLiveCarryForward({
      ...base, config: { enabled: false, percentage: 5 },
      currentRecords: [record("a", "2026-07", 0)], previousRecords: [record("a", "2026-05", 10)], manualQuarterly: 0,
    });
    expect(off.carryForward).toBe(0);
    const capped = calculateGoLiveCarryForward({
      ...base, config: { enabled: true, percentage: 50 },
      currentRecords: [record("a", "2026-07", 0)], previousRecords: [record("a", "2026-05", 10)], manualQuarterly: 0,
    });
    expect(capped.total).toBe(10);
    const uncapped = calculateGoLiveCarryForward({
      ...base, config: { enabled: true, percentage: 50 }, allowOverCap: true,
      currentRecords: [record("a", "2026-07", 0)], previousRecords: [record("a", "2026-05", 10)], manualQuarterly: 0,
    });
    expect(uncapped.total).toBe(50);
  });

  it("flows through the quarterly summary across a year boundary and honours overrides", () => {
    const recs = [record("a", "2025-11", 10), record("a", "2026-02", 0, { "kra-timesheet": 8 })];
    const q = buildQuarterlyKRA({ id: "a", name: "A" }, 2026, 1, recs, kras, settings);
    expect(q.goLive?.source).toBe("carry-forward");
    expect(q.categories[GO_LIVE].final).toBe(5);
    expect(q.quarterlyAchievement).toBe(13);

    const overridden = buildQuarterlyKRA({ id: "a", name: "A" }, 2026, 1, recs, kras, settings, [
      { id: "x", kind: "goLiveOverride", employeeId: "a", year: 2026, quarter: 1, value: 2, createdAt: "", updatedAt: "" },
    ]);
    expect(overridden.goLiveOverride).toBe(2);
    expect(overridden.quarterlyAchievement).toBe(10);
  });
});

describe("validation", () => {
  it("requires active KRA weights to total 100", () => {
    expect(validateKRAWeights(kras)).toEqual([]);
    expect(validateKRAWeights([...kras, { ...kras[0], id: "x", weight: 5 }])).toHaveLength(1);
    const disabled: KRAConfig[] = kras.map((k, i) => (i === 0 ? { ...k, active: false } : k));
    expect(validateKRAWeights(disabled)).toHaveLength(1);
    expect(validateKRAWeights([...disabled, { ...kras[0], id: "y", weight: 20 }])).toEqual([]);
  });

  it("enforces 0 <= achievement <= weight unless overridden", () => {
    expect(validateAchievement(10, 10, "Go Live")).toEqual([]);
    expect(validateAchievement(0, 10, "Go Live")).toEqual([]);
    expect(validateAchievement(10.5, 10, "Go Live")).toHaveLength(1);
    expect(validateAchievement(-1, 10, "Go Live")).toHaveLength(1);
    expect(validateAchievement(Number.NaN, 10, "Go Live")).toHaveLength(1);
    expect(validateAchievement(12, 10, "Go Live", true)).toEqual([]);
    expect(validateMonthlyEntry({ [GO_LIVE]: 11 }, kras)).toHaveLength(1);
  });

  it("detects duplicate monthly records and duplicate employee names", () => {
    expect(findDuplicateMonthlyRecords(seeded)).toEqual([]);
    expect(findDuplicateMonthlyRecords([...seeded, seeded[0]])).toEqual([`${seeded[0].employeeId}|${seeded[0].month}`]);
    expect(validateEmployeeName("keshav", employees)).toHaveLength(1);
    expect(validateEmployeeName("Keshav", employees, KESHAV.id)).toEqual([]);
  });
});

describe("month normalization", () => {
  it("normalizes spreadsheet formats", () => {
    expect(normalizeMonth("Apr-26")).toBe("2026-04");
    expect(normalizeMonth("Jul-26")).toBe("2026-07");
    expect(normalizeMonth("May 2026")).toBe("2026-05");
    expect(normalizeMonth("2026-06")).toBe("2026-06");
    expect(normalizeMonth("2026-13")).toBeNull();
    expect(normalizeMonth("Foo-26")).toBeNull();
  });
});

describe("CSV import", () => {
  const header =
    "Employee,No Bugs in Development,Project Timeline,Timesheet,Ideation,Go Live,Team/Junior Developer Grooming/multi Platform Work task level,Documentation,Timesheet Review for Manager/ChatGpt code,Month,Total Achv.,Remarks";
  const ctx = (over = {}) => ({ kras, employees, existingRecords: [], settings, createMissingEmployees: false, ...over });

  it("parses multiline quoted remarks and maps the spreadsheet headers", () => {
    const csv = `${header}\r\nKeshav,15,5,5,5,5,10,0,10,Apr-26,55,"Client visit LG,\nASL"\r\n`;
    const table = parseCSV(csv);
    expect(table.rows).toHaveLength(1);
    const preview = analyzeImport(table, ctx());
    const row = preview.rows[0];
    expect(row.status).toBe("ready");
    expect(row.month).toBe("2026-04");
    expect(row.calculatedTotal).toBe(55);
    expect(row.remarks).toBe("Client visit LG,\nASL");
    expect(preview.missingKRAs).toEqual([]);
  });

  it("warns on total mismatch and errors on bad values, unknown employees and duplicates", () => {
    const csv = [
      header,
      "Keshav,15,5,5,5,5,10,0,10,Apr-26,99,x",
      "Keshav,15,5,5,5,5,10,0,10,Apr-26,55,dup",
      "Nobody,15,5,5,5,5,10,0,10,Apr-26,55,",
      "Keshav,25,abc,5,5,5,10,0,10,Smarch,55,",
    ].join("\n");
    const rows = analyzeImport(parseCSV(csv), ctx()).rows;
    expect(rows[0].status).toBe("warning");
    expect(rows[0].warnings.some((w) => w.field === "Total Achv.")).toBe(true);
    expect(rows[1].errors.some((e) => /Duplicate/.test(e.message))).toBe(true);
    expect(rows[2].errors.some((e) => /Unknown employee/.test(e.message))).toBe(true);
    expect(rows[3].errors.length).toBeGreaterThanOrEqual(3);
    expect(analyzeImport(parseCSV(csv), ctx({ createMissingEmployees: true })).rows[2].status).toBe("warning");
  });
});

describe("backup validation", () => {
  const good = { version: 1, exportedAt: "x", employees, kraConfig: kras, monthlyKRA: seeded, settings: [settings] };
  it("accepts a well-formed backup", () => {
    expect(validateBackup(good).ok).toBe(true);
  });
  it("rejects malformed backups", () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ ...good, version: 2 }).ok).toBe(false);
    expect(validateBackup({ ...good, employees: "no" }).ok).toBe(false);
    expect(validateBackup({ ...good, monthlyKRA: [{ ...seeded[0], employeeId: "ghost" }] }).ok).toBe(false);
    expect(validateBackup({ ...good, monthlyKRA: [...seeded, seeded[0]] }).ok).toBe(false);
    expect(validateBackup({ ...good, kraConfig: kras.slice(1) }).ok).toBe(false);
  });
});

describe("export", () => {
  it("builds a report whose values match the quarterly summary", () => {
    const q = [buildQuarterlyKRA(KESHAV, 2026, 2, seeded, kras, settings)];
    const report = buildQuarterlyReport(q, kras, 2026, 2, "2026-10-05T00:00:00Z");
    const summary = report.sections[0];
    expect(summary.rows[0]).toEqual(["Keshav", 55, 73, 68, 65.33, 100]);
    const monthly = report.sections[1];
    expect(monthly.header).toContain("Total Achv.");
    expect(monthly.rows.some((r) => r[0] === "Keshav" && r.includes("Jun-26") && r.includes(68))).toBe(true);
    expect(flattenReport(report).rows[0]).toEqual(["KRA Development"]);
  });

  it("writes a structurally valid zip/xlsx", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const bytes = buildXlsxBytes([["Employee", "Total"], ["A & B", 12.5]], [0]);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
});
