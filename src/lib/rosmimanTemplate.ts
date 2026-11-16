// src/lib/rosmimanTemplate.ts
//
// Plantilla d'importació/exportació del llistat Rosmiman (pop-up «TAGs Rosmiman»).
// Les dades de jerarquia provenen del GMAO i es poden carregar amb aquesta plantilla.
//
// Columnes: TAG · DESCRIPCIÓ EQUIP · SISTEMA · SUBSISTEMA · LÍNIA DE TRACTAMENT
//           · PROCÉS · SUBPROCÉS
//
// Compatibilitat: un Excel sense capçalera es llegeix com abans
// (col A = TAG, col B = descripció).

import { norm } from "@/lib/tagImport/normalize";
import type { RosmimanJerarquiaKey } from "@/lib/useProjectes";

type CampPlantilla = "tag" | "descripcio" | RosmimanJerarquiaKey;

interface ColumnaPlantilla {
  camp: CampPlantilla;
  /** Capçalera que s'escriu a la plantilla */
  capcalera: string;
  /** Altres noms acceptats en importar (ja normalitzats amb norm()) */
  alies: string[];
  ample: number;
}

export const COLUMNES_PLANTILLA: ColumnaPlantilla[] = [
  { camp: "tag", capcalera: "TAG", alies: ["tag", "codi tag"], ample: 26 },
  {
    camp: "descripcio",
    capcalera: "DESCRIPCIÓ EQUIP",
    alies: [
      "descripcio equip",
      "descripcio",
      "descripcio de l equip",
      "denominacio",
      "nom equip",
      "equip",
    ],
    ample: 50,
  },
  { camp: "sistema", capcalera: "SISTEMA", alies: ["sistema"], ample: 24 },
  {
    camp: "subsistema",
    capcalera: "SUBSISTEMA",
    alies: ["subsistema", "sub sistema"],
    ample: 24,
  },
  {
    camp: "liniaTractament",
    capcalera: "LÍNIA DE TRACTAMENT",
    alies: ["linia de tractament", "linia tractament", "linia"],
    ample: 26,
  },
  { camp: "proces", capcalera: "PROCÉS", alies: ["proces"], ample: 24 },
  {
    camp: "subproces",
    capcalera: "SUBPROCÉS",
    alies: ["subproces", "sub proces"],
    ample: 24,
  },
];

export interface FilaPlantilla {
  tag: string;
  descripcio: string;
  sistema: string;
  subsistema: string;
  liniaTractament: string;
  proces: string;
  subproces: string;
}

/** Aliniació de nom de columna → camp (null si no es reconeix). */
function campDeCapcalera(text: unknown): CampPlantilla | null {
  const n = norm(text);
  if (!n) return null;
  for (const c of COLUMNES_PLANTILLA) {
    if (c.alies.includes(n)) return c.camp;
  }
  return null;
}

/**
 * Converteix les files crues d'un full Excel en files de plantilla.
 * - Si alguna de les primeres files té la capçalera «TAG», les columnes es
 *   mapegen pel nom (l'ordre no importa i les columnes extra s'ignoren).
 * - Si no, mode antic: col A = TAG, col B = descripció.
 */
export function llegeixFilesPlantilla(rows: unknown[][]): FilaPlantilla[] {
  const buida = (): FilaPlantilla => ({
    tag: "",
    descripcio: "",
    sistema: "",
    subsistema: "",
    liniaTractament: "",
    proces: "",
    subproces: "",
  });

  // Cerca de la fila de capçalera (només a les 10 primeres files)
  let filaCap = -1;
  let mapa: Map<number, CampPlantilla> | null = null;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const m = new Map<number, CampPlantilla>();
    (rows[r] ?? []).forEach((cel, i) => {
      const camp = campDeCapcalera(cel);
      if (camp && ![...m.values()].includes(camp)) m.set(i, camp);
    });
    if ([...m.values()].includes("tag")) {
      filaCap = r;
      mapa = m;
      break;
    }
  }

  const out: FilaPlantilla[] = [];
  if (mapa) {
    for (let r = filaCap + 1; r < rows.length; r++) {
      const fila = buida();
      for (const [i, camp] of mapa) {
        fila[camp] = String(rows[r]?.[i] ?? "").trim();
      }
      if (fila.tag) out.push(fila);
    }
    return out;
  }

  // Mode antic sense capçalera
  for (const row of rows) {
    const fila = buida();
    fila.tag = String(row?.[0] ?? "").trim();
    fila.descripcio = String(row?.[1] ?? "").trim();
    if (fila.tag) out.push(fila);
  }
  return out;
}

/** Descarrega la plantilla buida (.xlsx) amb les columnes del llistat Rosmiman. */
export async function exportaPlantillaRosmiman(): Promise<void> {
  // PERF: xlsx es carrega lazily
  const XLSX = await import("xlsx");

  const ws = XLSX.utils.aoa_to_sheet([
    COLUMNES_PLANTILLA.map((c) => c.capcalera),
  ]);
  ws["!cols"] = COLUMNES_PLANTILLA.map((c) => ({ wch: c.ample }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  const instruccions = [
    ["PLANTILLA TAGS ROSMIMAN"],
    [],
    ["Omple el full «TAGS» i importa'l des del pop-up «TAGs Rosmiman»."],
    ["TAG: obligatori. Format XXXXX_YYYYY_NNNL (p. ex. ED001_BC01_101A)."],
    [
      "DESCRIPCIÓ EQUIP, SISTEMA, SUBSISTEMA, LÍNIA DE TRACTAMENT, PROCÉS i SUBPROCÉS: opcionals (jerarquia del GMAO).",
    ],
    [
      "Si el TAG ja existeix, s'actualitzen les columnes omplertes; les cel·les buides no esborren dades.",
    ],
    [
      "No canviïs el nom de les capçaleres (l'ordre de les columnes és lliure).",
    ],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instruccions);
  wsInfo["!cols"] = [{ wch: 110 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TAGS");
  XLSX.utils.book_append_sheet(wb, wsInfo, "INSTRUCCIONS");
  XLSX.writeFile(wb, "plantilla_tags_rosmiman.xlsx");
}
