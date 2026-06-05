// src/lib/exportDadesTraspas.ts
//
// Exportació DADES TRASPÀS ROSMIMAN per projecte.
// Genera un .xlsx amb estructura equivalent a DADES_TAULES_TRASPAS_ROSMIMAN:
//   Col A → codiTaula
//   Col B → codiEquip (TAG de l'equip al projecte)
//   Col C → RIDLinea (codi del camp)
//   Col D → dadaText  (valor si tipus_dada != "1")
//   Col E → dadaNum   (valor si tipus_dada == "1")

import type { Equipment } from "@/hooks/useEquipments";
import type { FieldMeta } from "@/lib/fields";
import type { ProjectTag, Projecte } from "@/lib/useProjectes";

let _XLSX: any = null;
async function getXLSX() {
  if (!_XLSX) _XLSX = await import("xlsx");
  return _XLSX;
}

interface RowDades {
  codiTaula: string;
  codiEquip: string;
  RIDLinea: string | number;
  dadaText: string;
  dadaNum: string | number;
}

function isNumeric(tipusDada: string | null): boolean {
  // tipus_dada "1" = numèric (Number), la resta (0=Text, 2=TaulaAssociada, 3=?) → text
  return tipusDada === "1";
}

function buildRows(
  projecte: Projecte,
  equipments: Equipment[],
  fieldMap: Map<string, FieldMeta>,
): RowDades[] {
  const equipById = new Map(equipments.map((e) => [e.id, e]));
  const rows: RowDades[] = [];

  for (const tag of projecte.tags) {
    const equip = equipById.get(tag.equipId);
    if (!equip || !equip.needsTable || !equip.tableCode) continue;

    // Ordenem els camps per codi numèric (com fa l'Excel original)
    const fieldsOfEquip = equip.fieldCols
      .map((col) => ({ col, meta: fieldMap.get(col) ?? null }))
      .filter(({ meta }) => meta !== null && !!meta.codi) as { col: string; meta: FieldMeta }[];

    const sorted = [...fieldsOfEquip].sort((a, b) => {
      const na = parseFloat(a.meta.codi!);
      const nb = parseFloat(b.meta.codi!);
      if (isNaN(na) && isNaN(nb)) return 0;
      if (isNaN(na)) return -1;
      if (isNaN(nb)) return 1;
      return na - nb;
    });

    for (const { col, meta } of sorted) {
      const rawValue = tag.fieldValues?.[col] ?? "";
      const isNum = isNumeric(meta.tipus_dada);
      rows.push({
        codiTaula: equip.tableCode,
        codiEquip: tag.tagComplet,
        RIDLinea: meta.codi!,
        dadaText: isNum ? "" : rawValue,
        dadaNum: isNum && rawValue !== "" ? rawValue : "",
      });
    }
  }

  return rows;
}

function styleHeader(XLSX: any, ws: any, numCols: number) {
  const s = {
    font:      { bold: true, color: { rgb: "FFFFFF" }, name: "Arial", sz: 10 },
    fill:      { fgColor: { rgb: "375A7F" }, patternType: "solid" },
    alignment: { horizontal: "center", vertical: "center" },
  };
  for (let c = 0; c < numCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = s;
  }
}

export async function exportDadesTraspas(
  projecte: Projecte,
  equipments: Equipment[],
  fieldMap: Map<string, FieldMeta>,
): Promise<void> {
  const XLSX = await getXLSX();
  const rows = buildRows(projecte, equipments, fieldMap);

  const wsRows = rows.map((r) => ({
    "codiTaula": r.codiTaula,
    "codiEquip": r.codiEquip,
    "RIDLinea":  r.RIDLinea,
    "dadaText":  r.dadaText,
    "dadaNum":   r.dadaNum === "" ? "" : Number(r.dadaNum) || r.dadaNum,
  }));

  const ws = XLSX.utils.json_to_sheet(wsRows, {
    header: ["codiTaula", "codiEquip", "RIDLinea", "dadaText", "dadaNum"],
  });

  styleHeader(XLSX, ws, 5);
  ws["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 30 }, { wch: 16 }];
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DADES_TAULES_TRASPAS_ROSMIMAN");

  const filename = `${projecte.codiProjecte || projecte.nom}_rosmiman_dades.xlsx`
    .replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  XLSX.writeFile(wb, filename);
}
