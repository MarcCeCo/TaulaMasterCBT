// src/lib/exportRosmiman.ts
//
// Exportació ROSMIMAN — genera un .xlsx amb dos fulls:
//   1. CARACTERISTIQUES TECNIQUES  (equivalent a CREA_TAULA_BASE_ROSMIMAN)
//   2. LLISTAT TAULES               (equivalent a LLISTA_TAULA_BASE_ROSMIMAN)
//
// Ús:
//   import { exportRosmiman } from "@/lib/exportRosmiman";
//   exportRosmiman(equipments, fieldMap);

import * as XLSX from "xlsx";
import type { Equipment } from "@/hooks/useEquipments";
import type { FieldMeta } from "@/lib/fields";

// ─── Tipus dada: mapatge numèric ──────────────────────────────────────────────
// La taula Supabase guarda el tipus_dada com a string ("0","1","2","3"…).
// Rosmiman vol el valor numèric directament; si no és parsejable, es deixa buit.
function tipusDadaNum(raw: string | null): number | "" {
  if (!raw) return "";
  const n = parseInt(raw, 10);
  return isNaN(n) ? "" : n;
}

// ─── Full 1: CARACTERISTIQUES TECNIQUES ──────────────────────────────────────
//
// Una fila per cada camp (fieldCol) de cada equip que tingui taula (needsTable).
// Columnes:
//   codi taula    → equipment.tableCode
//   RID LINIA     → equipment.fieldCols[i] → field.codi
//   CARACTERISTICA TÈCNICA → field.col  (nom del paràmetre)
//   TIPUS DADA    → field.tipus_dada (numèric)
//   ORDRE LINIA   → índex seqüencial (1-based) dins de la taula, ordenat per codi numèric
//   TAULA ASSOCIADA → field.taula_assoc

interface RowCaracteristiques {
  "codi taula": string;
  "RID LINIA": string | null;
  "CARACTERISTICA TÈCNICA": string;
  "TIPUS DADA": number | "";
  "ORDRE LINIA": number;
  "TAULA ASSOCIADA": string | null;
}

function buildCaracteristiques(
  equipments: Equipment[],
  fieldMap: Map<string, FieldMeta>,
): RowCaracteristiques[] {
  const rows: RowCaracteristiques[] = [];

  // Només equips que necessiten taula i tenen tableCode
  const withTable = equipments.filter((e) => e.needsTable && e.tableCode);

  for (const equip of withTable) {
    // Agafem els camps de l'equip i els ordenem per codi numèric (com fa el full Excel original)
    const fieldsOfEquip = equip.fieldCols
      .map((col) => ({ col, meta: fieldMap.get(col) ?? null }))
      .filter(({ meta }) => meta !== null && !!meta.codi) as { col: string; meta: FieldMeta }[];

    // Ordenació: camps sense codi primer, després per codi numèric ascending
    const sorted = [...fieldsOfEquip].sort((a, b) => {
      const na = a.meta.codi ? parseFloat(a.meta.codi) : -Infinity;
      const nb = b.meta.codi ? parseFloat(b.meta.codi) : -Infinity;
      if (na === -Infinity && nb === -Infinity) return 0;
      if (na === -Infinity) return -1;
      if (nb === -Infinity) return 1;
      return na - nb;
    });

    sorted.forEach(({ col, meta }, idx) => {
      rows.push({
        "codi taula":            equip.tableCode,
        "RID LINIA":             meta.codi ?? null,
        "CARACTERISTICA TÈCNICA": col,
        "TIPUS DADA":            tipusDadaNum(meta.tipus_dada),
        "ORDRE LINIA":           idx + 1,
        "TAULA ASSOCIADA":       meta.taula_assoc ?? null,
      });
    });
  }

  return rows;
}

// ─── Full 2: LLISTAT TAULES ───────────────────────────────────────────────────
//
// Una fila per cada equip únic que tingui taula (needsTable + tableCode).
// Columnes:
//   NÚM        → índex seqüencial (1-based)
//   codi taula → equipment.tableCode
//   Nom taula  → equipment.tableName

interface RowLlistat {
  "NÚM": number;
  "codi taula": string;
  "Nom taula": string;
}

function buildLlistat(equipments: Equipment[]): RowLlistat[] {
  // Deduplicar per tableCode (pot haver-hi equips fills amb el mateix tableCode que el pare)
  const seen = new Set<string>();
  const rows: RowLlistat[] = [];
  let num = 1;

  for (const equip of equipments) {
    if (!equip.needsTable || !equip.tableCode) continue;
    if (seen.has(equip.tableCode)) continue;
    seen.add(equip.tableCode);

    rows.push({
      "NÚM":        num++,
      "codi taula": equip.tableCode,
      "Nom taula":  equip.tableName ?? "",
    });
  }

  return rows;
}

// ─── Estil de capçalera ───────────────────────────────────────────────────────
// Aplica fons gris fosc + lletra blanca + negreta a la fila de capçaleres
function styleHeader(ws: XLSX.WorkSheet, numCols: number) {
  const headerStyle = {
    font:      { bold: true, color: { rgb: "FFFFFF" }, name: "Arial", sz: 10 },
    fill:      { fgColor: { rgb: "375A7F" }, patternType: "solid" },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      bottom: { style: "thin", color: { rgb: "CCCCCC" } },
    },
  };

  for (let c = 0; c < numCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = headerStyle;
  }
}

// ─── Amplades de columna per defecte ─────────────────────────────────────────
function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((wch) => ({ wch }));
}

// ─── Exportació principal ─────────────────────────────────────────────────────
export function exportRosmiman(
  equipments: Equipment[],
  fieldMap: Map<string, FieldMeta>,
  filename = "rosmiman_export.xlsx",
): void {
  const rowsCaract  = buildCaracteristiques(equipments, fieldMap);
  const rowsLlistat = buildLlistat(equipments);

  const wb = XLSX.utils.book_new();

  // ── Full 1 ──
  const wsCaract = XLSX.utils.json_to_sheet(rowsCaract, {
    header: [
      "codi taula",
      "RID LINIA",
      "CARACTERISTICA TÈCNICA",
      "TIPUS DADA",
      "ORDRE LINIA",
      "TAULA ASSOCIADA",
    ],
  });
  styleHeader(wsCaract, 6);
  setColWidths(wsCaract, [18, 14, 35, 14, 14, 18]);
  // Freeze primera fila
  wsCaract["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsCaract, "CARACTERISTIQUES TECNIQUES");

  // ── Full 2 ──
  const wsLlistat = XLSX.utils.json_to_sheet(rowsLlistat, {
    header: ["NÚM", "codi taula", "Nom taula"],
  });
  styleHeader(wsLlistat, 3);
  setColWidths(wsLlistat, [8, 18, 50]);
  wsLlistat["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsLlistat, "LLISTAT TAULES");

  XLSX.writeFile(wb, filename);
}
