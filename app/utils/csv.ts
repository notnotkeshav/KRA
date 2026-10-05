/** CSV generation and browser download helpers. */

export type CSVCell = string | number;

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
