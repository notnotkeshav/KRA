/** CSV parsing / generation and browser download helpers. */

export type CSVCell = string | number;

/**
 * RFC 4180-style parser: quoted fields, escaped quotes, embedded newlines,
 * CRLF/LF, optional BOM. Returns raw records (including the header record).
 */
export function parseCSVRecords(content: string): string[][] {
  const text = content.replace(/^﻿/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((c) => c.trim() !== ""));
}

export type CSVTable = {
  headers: string[];
  /** 1-based line numbers are approximated by record index + 1 (header is row 1). */
  rows: { rowNumber: number; values: Record<string, string> }[];
};

export function parseCSV(content: string): CSVTable {
  const records = parseCSVRecords(content);
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((values, i) => {
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    return { rowNumber: i + 2, values: row };
  });
  return { headers, rows };
}

function escapeCell(value: CSVCell): string {
  const text = String(value);
  // Neutralize spreadsheet formula injection for text cells.
  const safe = typeof value === "string" && /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function generateCSV(rows: CSVCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(content: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename);
}
