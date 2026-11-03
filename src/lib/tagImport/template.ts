// src/lib/tagImport/template.ts
// Plantilla d'importació. Té les mateixes columnes que l'exportació de la
// revisió, de manera que un fitxer revisat es pot tornar a importar.

import { isNumeric, norm } from "./normalize";
import type { Grid, SourceRow } from "./types";

export const TEMPLATE_HEADERS = [
  "Línia",
  "Denominació",
  "Tensió",
  "Potència",
  "Codi equip",
  "CCM",
  "Funció",
  "Duplicitat",
  "Ordre procés",
  "TAG",
  "Estat",
  "Confiança",
  "Observacions",
] as const;

type Header = (typeof TEMPLATE_HEADERS)[number];

function col(header: string[], name: Header): number {
  const n = norm(name);
  return header.findIndex((h) => norm(h) === n);
}

/** La fila és de plantilla si té les columnes clau de la plantilla. */
export function isTemplateHeader(header: string[]): boolean {
  return (
    col(header, "Línia") >= 0 &&
    col(header, "Denominació") >= 0 &&
    col(header, "Codi equip") >= 0
  );
}

export function readTemplateRows(grid: Grid, headerRow: number): SourceRow[] {
  const header = grid[headerRow] ?? [];
  const c = (name: Header) => col(header, name);
  const get = (row: string[], i: number) =>
    i >= 0 ? (row[i] ?? "").trim() : "";
  const out: SourceRow[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const den = get(row, c("Denominació"));
    if (!den) continue;
    const ordreTxt = get(row, c("Ordre procés")).replace(",", ".");
    const ordre =
      ordreTxt !== "" && isNumeric(ordreTxt) ? Number(ordreTxt) : undefined;
    out.push({
      id: `r${r}`,
      sourceRow: r + 1,
      linia: get(row, c("Línia")),
      denominacio: den,
      potencia: get(row, c("Potència")),
      tensio: get(row, c("Tensió")),
      presetCodi: get(row, c("Codi equip")).toUpperCase() || undefined,
      presetCcm: get(row, c("CCM")) || undefined,
      presetFuncio: get(row, c("Funció")).replace(/\D/g, "") || undefined,
      presetDuplicitat:
        get(row, c("Duplicitat")).toUpperCase().slice(0, 1) || undefined,
      ordre,
    });
  }
  return out;
}

const INSTRUCCIONS: string[][] = [
  ["Instruccions"],
  [""],
  [
    "1. Omple el full «Equips»: una fila per equip. Només són obligatòries Línia i Denominació.",
  ],
  [
    "2. Línia: la referència del teu llistat (L-5, VF 1.1...). Es desa als comentaris del tag.",
  ],
  [
    "3. Codi equip, CCM, Funció i Duplicitat són opcionals: si els omples, la plataforma els respecta; si els deixes buits, els proposa.",
  ],
  [
    "4. Ordre procés: número (1, 2, 3...) segons el sentit del fluid del P&ID. La numeració de les funcions segueix aquest ordre.",
  ],
  [
    "5. Les columnes TAG, Estat, Confiança i Observacions les omple la plataforma a l'exportar la revisió; a la importació s'ignoren.",
  ],
  [
    "6. No canviïs els noms de les capçaleres ni n'afegeixis de nous entre mig.",
  ],
  [""],
  ["Exemple"],
  [
    "Línia",
    "Denominació",
    "Codi equip",
    "CCM",
    "Funció",
    "Duplicitat",
    "Ordre procés",
  ],
  ["L-23", "Bomba recirculació de fangs", "BCCS", "6", "", "", "1"],
  ["L-24", "Bomba recirculació de fangs (reserva)", "BCCS", "6", "", "", "1"],
  ["L-8", "Cabalímetre sortida digestió", "", "", "", "", "2"],
];

export async function downloadTemplate(): Promise<void> {
  const mod = await import("xlsx");
  const XLSX = mod.default ?? mod;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS]]);
  ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({
    wch: h === "Denominació" ? 46 : h === "Observacions" ? 40 : 14,
  }));
  XLSX.utils.book_append_sheet(wb, ws, "Equips");
  const wi = XLSX.utils.aoa_to_sheet(INSTRUCCIONS);
  wi["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wi, "Instruccions");
  XLSX.writeFile(wb, "plantilla_importacio_tags.xlsx");
}
