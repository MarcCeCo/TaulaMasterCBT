// src/lib/tagImport/readWorkbook.ts
// Llegeix un Excel/CSV i el converteix en una graella de text per full.
// PERF: xlsx (≈750 KB) es carrega lazily, només quan l'usuari importa un fitxer.

import type { Grid, SheetData } from "./types";

const MAX_ROWS = 5000;

export async function readWorkbook(file: File): Promise<SheetData[]> {
  const mod = await import("xlsx");
  const XLSX = mod.default ?? mod;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets: SheetData[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const grid: Grid = raw
      .slice(0, MAX_ROWS)
      .map((row) => row.map((c) => String(c ?? "").trim()));
    if (grid.some((r) => r.some((c) => c !== ""))) sheets.push({ name, grid });
  }
  return sheets;
}
