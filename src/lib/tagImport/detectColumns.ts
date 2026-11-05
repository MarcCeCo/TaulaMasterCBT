// src/lib/tagImport/detectColumns.ts
// Detecció automàtica de la fila de capçalera i del rol de cada columna
// (denominació i línia). Combina el nom de la capçalera amb
// el perfil del contingut. L'usuari sempre pot corregir el resultat.

import { classifyDenominacio } from "./rules";
import { isNumeric, norm } from "./normalize";
import type {
  ColumnGuess,
  ColumnRole,
  DetectedLayout,
  Grid,
  SourceRow,
} from "./types";

const SYNONYMS: Record<Exclude<ColumnRole, "ignorar">, string[]> = {
  denominacio: [
    "denominacio",
    "descripcio",
    "designacio",
    "nom",
    "nom equip",
    "equip",
    "equips",
    "concepte",
    "element",
    "denominacion",
    "descripcion",
    "nombre",
    "description",
    "name",
  ],
  linia: ["linia", "line", "ref", "referencia", "id", "codi linia", "n linia"],
};

const MAX_SCAN = 300;

function headerMatch(header: string, role: keyof typeof SYNONYMS): number {
  const h = norm(header)
    .replace(/\(.*?\)/g, "")
    .trim();
  if (!h) return 0;
  const syn = SYNONYMS[role];
  if (syn.includes(h)) return 1;
  if (syn.some((s) => s.length > 2 && h.includes(s))) return 0.6;
  return 0;
}

function allSynonyms(): string[] {
  return Object.values(SYNONYMS).flat();
}

/** Fila de capçalera: la que té més textos curts i coincidències amb sinònims */
export function detectHeaderRow(grid: Grid): number {
  const syn = allSynonyms();
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(grid.length, 30);
  for (let i = 0; i < limit; i++) {
    const cells = grid[i].map((c) => c.trim()).filter((c) => c !== "");
    if (cells.length < 2) continue;
    const hasData = grid
      .slice(i + 1, i + 4)
      .some((r) => r.filter((c) => c.trim() !== "").length >= 2);
    if (!hasData) continue;
    const textCells = cells.filter((c) => !isNumeric(c)).length;
    const hits = cells.filter((c) => {
      const h = norm(c)
        .replace(/\(.*?\)/g, "")
        .trim();
      return syn.some((s) => h === s || (s.length > 2 && h.includes(s)));
    }).length;
    const score = hits * 4 + textCells;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

interface ColumnProfile {
  filled: number;
  textRatio: number;
  avgLen: number;
  distinct: number;
  vocab: number;
  shortCode: number;
}

function profileColumn(grid: Grid, headerRow: number, col: number) {
  const values = grid
    .slice(headerRow + 1, headerRow + 1 + MAX_SCAN)
    .map((r) => (r[col] ?? "").trim())
    .filter((v) => v !== "");
  const filled = values.length;
  if (filled === 0) return null;
  const set = new Set(values.map(norm));
  const p: ColumnProfile = {
    filled,
    textRatio: values.filter((v) => !isNumeric(v)).length / filled,
    avgLen: values.reduce((s, v) => s + v.length, 0) / filled,
    distinct: set.size / filled,
    vocab:
      values.filter((v) => classifyDenominacio(v).kind !== "desconegut")
        .length / filled,
    shortCode:
      values.filter((v) => v.length <= 8 && /\d/.test(v) && /[a-z]/i.test(v))
        .length / filled,
  };
  return p;
}

function scoreRole(
  role: Exclude<ColumnRole, "ignorar">,
  header: string,
  p: ColumnProfile | null,
): number {
  const hm = headerMatch(header, role);
  if (!p) return hm * 0.3;
  switch (role) {
    case "denominacio":
      if (p.textRatio < 0.6 || p.shortCode > 0.6) return 0;
      return (
        0.45 * hm +
        0.3 * p.vocab +
        0.15 * Math.min(p.avgLen / 30, 1) +
        0.1 * p.distinct
      );
    case "linia":
      return 0.5 * hm + 0.5 * p.shortCode * (p.avgLen <= 8 ? 1 : 0);
  }
}

export function detectColumns(grid: Grid, headerRow: number): DetectedLayout {
  const header = grid[headerRow] ?? [];
  const width = Math.max(
    header.length,
    ...grid.slice(headerRow + 1, headerRow + 20).map((r) => r.length),
    0,
  );
  const profiles = Array.from({ length: width }, (_, c) =>
    profileColumn(grid, headerRow, c),
  );
  const roles: ColumnRole[] = Array.from({ length: width }, () => "ignorar");
  const scores: number[] = Array.from({ length: width }, () => 0);

  const order: Exclude<ColumnRole, "ignorar">[] = ["denominacio", "linia"];
  const minScore: Record<(typeof order)[number], number> = {
    denominacio: 0.3,
    linia: 0.6,
  };
  for (const role of order) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < width; c++) {
      if (roles[c] !== "ignorar") continue;
      const s = scoreRole(role, header[c] ?? "", profiles[c]);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best >= 0 && bestScore >= minScore[role]) {
      roles[best] = role;
      scores[best] = Math.min(bestScore, 1);
    }
  }
  return {
    headerRow,
    columns: Array.from({ length: width }, (_, c) => ({
      index: c,
      header: header[c] ?? "",
      role: roles[c],
      score: scores[c],
    })) satisfies ColumnGuess[],
  };
}

/** Aplica els rols a la graella i produeix les files d'origen. */
export function buildSourceRows(
  grid: Grid,
  headerRow: number,
  roles: ColumnRole[],
): SourceRow[] {
  const idx = (role: ColumnRole) => roles.findIndex((r) => r === role);
  const iDen = idx("denominacio");
  if (iDen < 0) return [];
  const iLin = idx("linia");
  const out: SourceRow[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const den = (row[iDen] ?? "").trim();
    const linia = iLin >= 0 ? (row[iLin] ?? "").trim() : "";
    if (!den) continue;
    const isContinuation = out.length > 0 && !linia && /^\(.*\)$/.test(den);
    if (isContinuation) {
      out[out.length - 1].denominacio += ` ${den}`;
      continue;
    }
    out.push({
      id: `r${r}`,
      sourceRow: r + 1,
      linia,
      denominacio: den,
    });
  }
  return out;
}
