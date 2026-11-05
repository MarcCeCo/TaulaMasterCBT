// src/lib/tagImport/template.ts
// Plantilla d'importació (public/docs/Plantilla_importacio_tags.xlsx).
// Columnes: Ordre procés, Línia, Denominació, Codi equip, CCM, Funció,
// Duplicitat, TAG, Estat, Confiança, Observacions.
// Obligatòries: Ordre procés, Denominació i CCM. La resta són opcionals;
// TAG, Estat, Confiança i Observacions les omple la plataforma.

import { isNumeric, norm } from "./normalize";
import type { Grid, SourceRow } from "./types";

export const TEMPLATE_URL = "/docs/Plantilla_importacio_tags.xlsx";
export const TEMPLATE_SHEET = "Equips";

export const TEMPLATE_HEADERS = [
  "Ordre procés",
  "Línia",
  "Denominació",
  "Codi equip",
  "CCM",
  "Funció",
  "Duplicitat",
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

/** La fila és de plantilla si té les columnes obligatòries. */
export function isTemplateHeader(header: string[]): boolean {
  return (
    col(header, "Ordre procés") >= 0 &&
    col(header, "Denominació") >= 0 &&
    col(header, "CCM") >= 0
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
      presetCodi: get(row, c("Codi equip")).toUpperCase() || undefined,
      presetCcm: get(row, c("CCM")) || undefined,
      presetFuncio: get(row, c("Funció")).replace(/\D/g, "") || undefined,
      presetDuplicitat:
        get(row, c("Duplicitat")).toUpperCase().slice(0, 1) || undefined,
      ordre,
      fromTemplate: true,
    });
  }
  return out;
}

/** CCM detectats a la plantilla (dígits únics, ordenats). */
export function detectCcms(rows: SourceRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows)
    if (r.presetCcm && /^\d$/.test(r.presetCcm)) set.add(r.presetCcm);
  return [...set].sort();
}

/** Descarrega la plantilla corporativa (fitxer estàtic de public/docs). */
export async function downloadTemplate(): Promise<void> {
  const res = await fetch(TEMPLATE_URL);
  const type = res.headers.get("content-type") ?? "";
  // vercel.json redirigeix tot a index.html: si no existeix, arriba HTML
  if (!res.ok || type.includes("text/html")) {
    throw new Error("No s'ha trobat la plantilla al servidor.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Plantilla_importacio_tags.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
