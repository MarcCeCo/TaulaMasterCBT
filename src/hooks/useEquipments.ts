import { useCallback, useMemo } from "react";
import { useDebouncedLocalStorage, uid } from "@/lib/storage";

export type Equipment = {
  id: string;
  gubimCode: string;
  equipCode: string;          // opcional, màx 4 alfanumèric
  equipName: string;
  needsTable: boolean;
  tableCode: string;          // "T" + equipCode si te codi, sinó buit
  tableName: string;          // = equipName (sense prefix TAULA_)
  fieldCols: string[];
  parentEquipCode: string;    // codi de l'equip pare (jerarquia intra-gubim)
  createdAt: number;
};

const KEY = "cbt.equipments.v1";

// Retorna true si el codi GuBIMClass és de nivell 4 (XX.XX.XX.XX)
const isLevel4 = (code: string) => code.split(".").length === 4;

// Dona la llista actualitzada amb el parentEquipCode assignat automàticament:
// Per cada grup de guinimCode nivell 4, el primer equip (createdAt més antic) és el pare,
// i tots els altres (que no tinguin ja un pare manual) apunten a ell.
function autoAssignParents(list: Equipment[]): Equipment[] {
  // Agrupa per gubimCode de nivell 4
  const groups = new Map<string, Equipment[]>();
  list.forEach((e) => {
    if (!isLevel4(e.gubimCode)) return;
    const g = groups.get(e.gubimCode) ?? [];
    g.push(e);
    groups.set(e.gubimCode, g);
  });

  // Construeix un mapa de canvis: id -> parentEquipCode
  const patches = new Map<string, string>();
  groups.forEach((group) => {
    if (group.length < 2) return;
    // Ordena per createdAt per determinar el pare (el més antic)
    const sorted = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const pare = sorted[0];
    sorted.slice(1).forEach((child) => {
      // Només assigna si no té un pare ja definit manualment
      if (!child.parentEquipCode && pare.equipCode) {
        patches.set(child.id, pare.equipCode);
      }
    });
  });

  if (patches.size === 0) return list;
  return list.map((e) => patches.has(e.id) ? { ...e, parentEquipCode: patches.get(e.id)! } : e);
}

const SEED: Equipment[] = [
  {
    id: uid(),
    gubimCode: "30.50.10.10",
    equipCode: "RNA",
    equipName: "Refredadora aire-aigua",
    needsTable: true,
    tableCode: "TRNA",
    tableName: "Refredadora aire-aigua",
    fieldCols: ["TAG", "SISTEMA", "FABRICANT", "MODEL", "NUMSERIE", "POTNOM", "CABAL"],
    parentEquipCode: "",
    createdAt: Date.now(),
  },
  {
    id: uid(),
    gubimCode: "30.50.10.10",
    equipCode: "COND",
    equipName: "Condensador (component refredadora)",
    needsTable: false,
    tableCode: "",
    tableName: "",
    fieldCols: ["TAG", "FABRICANT", "MODEL"],
    parentEquipCode: "RNA",
    createdAt: Date.now(),
  },
  {
    id: uid(),
    gubimCode: "30.50.10.20",
    equipCode: "BMC",
    equipName: "Bomba de calor",
    needsTable: true,
    tableCode: "TBMC",
    tableName: "Bomba de calor",
    fieldCols: ["TAG", "SISTEMA", "FABRICANT", "MODEL", "POTNOM", "TENSNOM"],
    parentEquipCode: "",
    createdAt: Date.now(),
  },
  {
    id: uid(),
    gubimCode: "30.50.20.10",
    equipCode: "VTM",
    equipName: "Ventilador",
    needsTable: false,
    tableCode: "",
    tableName: "",
    fieldCols: [],
    parentEquipCode: "",
    createdAt: Date.now(),
  },
];

export function useEquipments() {
  const [items, setItems] = useDebouncedLocalStorage<Equipment[]>(KEY, SEED);

  const upsert = useCallback(
    (e: Equipment) => {
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.id === e.id);
        const next = idx >= 0
          ? prev.map((p, i) => (i === idx ? e : p))
          : [...prev, e];
        return autoAssignParents(next);
      });
    },
    [setItems],
  );

  const remove = useCallback((id: string) => setItems((p) => p.filter((e) => e.id !== id)), [setItems]);

  const addMany = useCallback(
    (arr: Equipment[]) => {
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.equipCode).filter(Boolean));
        const toAdd = arr.filter((e) => {
          if (!e.equipCode) return true;
          if (seen.has(e.equipCode)) return false;
          seen.add(e.equipCode);
          return true;
        });
        return autoAssignParents([...prev, ...toAdd]);
      });
    },
    [setItems],
  );

  const clearAll = useCallback(() => setItems([]), [setItems]);

  const removeFieldColFromAll = useCallback(
    (col: string) => {
      setItems((prev) =>
        prev.map((e) =>
          e.fieldCols.includes(col) ? { ...e, fieldCols: e.fieldCols.filter((c) => c !== col) } : e,
        ),
      );
    },
    [setItems],
  );

  const byCode = useMemo(() => {
    const m = new Map<string, Equipment>();
    items.forEach((e) => { if (e.equipCode) m.set(e.equipCode, e); });
    return m;
  }, [items]);

  return { items, upsert, remove, addMany, clearAll, byCode, removeFieldColFromAll };
}
