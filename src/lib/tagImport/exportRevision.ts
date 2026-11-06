// src/lib/tagImport/exportRevision.ts
// Exporta la revisió amb el mateix format corporatiu que la plantilla
// (colors d'Estat i Confiança inclosos): carrega la plantilla estàtica amb
// ExcelJS, hi escriu les files i la descarrega. El resultat es pot tornar a
// importar. PERF: exceljs es carrega lazily, només en exportar.

import { TEMPLATE_SHEET, TEMPLATE_URL } from "./template";

export interface RevisionRow {
  ordre?: number;
  linia: string;
  denominacio: string;
  codiEquip: string;
  ccm: string;
  funcio: string;
  duplicitat: string;
  tag: string;
  estat: string;
  confianca: string;
  observacions: string;
}

const FIRST_ROW = 5; // primera fila de dades a la plantilla
const TEMPLATE_ROWS = 200; // files preformatades a la plantilla

function cellValue(v: string | number | undefined): string | number | null {
  if (v === undefined || v === "") return null;
  return v;
}

/** Omple la plantilla amb les files i retorna el .xlsx resultant. */
export async function buildRevisionWorkbook(
  template: ArrayBuffer,
  rows: RevisionRow[],
): Promise<ArrayBuffer> {
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template);
  const ws = wb.getWorksheet(TEMPLATE_SHEET);
  if (!ws) throw new Error(`La plantilla no té el full «${TEMPLATE_SHEET}».`);
  const example = wb.getWorksheet("Exemple");
  if (example) wb.removeWorksheet(example.id);

  // ExcelJS expandeix les validacions cel·la a cel·la i en torna a escriure
  // rangs que se superposen (Excel ho vol «reparar»). Les recompactem per
  // columna a un únic rang A5:A204, D5:D204...
  // (dataValidations no surt als tipus públics d'ExcelJS)
  const dvStore = (
    ws as unknown as { dataValidations: { model: Record<string, unknown> } }
  ).dataValidations;
  const dvModel = dvStore.model;
  const byColumn = new Map<string, unknown>();
  for (const [address, dv] of Object.entries(dvModel)) {
    const letter = address.replace(/\d+/g, "");
    if (!byColumn.has(letter)) byColumn.set(letter, dv);
  }
  const last = FIRST_ROW + TEMPLATE_ROWS - 1;
  const compact: Record<string, unknown> = {};
  for (const [letter, dv] of byColumn) {
    compact[`${letter}${FIRST_ROW}:${letter}${last}`] = dv;
  }
  dvStore.model = compact;

  const styleRow = ws.getRow(FIRST_ROW + TEMPLATE_ROWS - 1);
  rows.forEach((r, i) => {
    const row = ws.getRow(FIRST_ROW + i);
    if (i >= TEMPLATE_ROWS) {
      // Més files que les preformatades: copia l'estil de l'última
      for (let c = 1; c <= 11; c++) {
        row.getCell(c).style = { ...styleRow.getCell(c).style };
      }
    }
    const values = [
      r.ordre,
      r.linia,
      r.denominacio,
      r.codiEquip,
      r.ccm,
      r.funcio,
      r.duplicitat,
      r.tag,
      r.estat,
      r.confianca,
      r.observacions,
    ];
    values.forEach((v, c) => {
      row.getCell(c + 1).value = cellValue(v);
    });
    row.commit();
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function exportRevisionFile(
  rows: RevisionRow[],
  fileName: string,
): Promise<void> {
  const res = await fetch(TEMPLATE_URL);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("text/html")) {
    throw new Error("No s'ha trobat la plantilla al servidor.");
  }
  const out = await buildRevisionWorkbook(await res.arrayBuffer(), rows);
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
