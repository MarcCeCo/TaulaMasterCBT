import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/storage";

export type Equipment = {
  id: string;
  gubimCode: string;
  equipCode: string;
  equipName: string;
  needsTable: boolean;
  tableCode: string;
  tableName: string;
  fieldCols: string[];
  parentEquipCode: string;
  createdAt: number;
};

const KEY = "cbt.equipments.v1";

const isLevel4 = (code: string) => code.split(".").length === 4;

function autoAssignParents(list: Equipment[]): Equipment[] {
  const groups = new Map<string, Equipment[]>();
  list.forEach((e) => {
    if (!isLevel4(e.gubimCode)) return;
    const g = groups.get(e.gubimCode) ?? [];
    g.push(e);
    groups.set(e.gubimCode, g);
  });

  const patches = new Map<string, string>();
  groups.forEach((group) => {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const pare = sorted[0];
    sorted.slice(1).forEach((child) => {
      if (!child.parentEquipCode && pare.equipCode) {
        patches.set(child.id, pare.equipCode);
      }
    });
  });

  if (patches.size === 0) return list;
  return list.map((e) => patches.has(e.id) ? { ...e, parentEquipCode: patches.get(e.id)! } : e);
}

// Conversió Supabase ↔ Equipment
const toEquip = (row: any): Equipment => ({
  id:              row.id,
  gubimCode:       row.gubim_code,
  equipCode:       row.equip_code ?? "",
  equipName:       row.equip_name,
  needsTable:      row.needs_table ?? false,
  tableCode:       row.table_code ?? "",
  tableName:       row.table_name ?? "",
  fieldCols:       row.field_cols ?? [],
  parentEquipCode: row.parent_equip_code ?? "",
  createdAt:       row.created_at,
});

const toRow = (e: Equipment) => ({
  id:               e.id,
  gubim_code:       e.gubimCode,
  equip_code:       e.equipCode || null,
  equip_name:       e.equipName,
  needs_table:      e.needsTable,
  table_code:       e.tableCode || null,
  table_name:       e.tableName || null,
  field_cols:       e.fieldCols,
  parent_equip_code: e.parentEquipCode || null,
  created_at:       e.createdAt,
});

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
    createdAt: Date.now() + 1,
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
    createdAt: Date.now() + 2,
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
    createdAt: Date.now() + 3,
  },
];

export function useEquipments() {
  const [items, setItems]     = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  // Càrrega inicial + seed si buit
  useEffect(() => {
    supabase
      .from("equipments")
      .select("*")
      .order("created_at")
      .then(({ data, error }) => {
        if (error) { console.error("useEquipments fetch:", error); setLoading(false); return; }
        setItems((data ?? []).map(toEquip));
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCodeTaken = useCallback(
    (code: string, excludeId?: string) =>
      items.some((e) => e.equipCode === code && e.id !== excludeId),
    [items],
  );

  const upsert = useCallback(async (e: Equipment) => {
    const row = toRow(e);
    const { error } = await supabase.from("equipments").upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === e.id);
      const next = idx >= 0 ? prev.map((p, i) => (i === idx ? e : p)) : [...prev, e];
      return autoAssignParents(next);
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("equipments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setItems((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addMany = useCallback(async (arr: Equipment[]) => {
    const seen   = new Set(items.map((e) => e.equipCode).filter(Boolean));
    const toAdd  = arr.filter((e) => {
      if (!e.equipCode) return true;
      if (seen.has(e.equipCode)) return false;
      seen.add(e.equipCode);
      return true;
    });
    if (toAdd.length === 0) return;
    const BATCH = 50;
    for (let i = 0; i < toAdd.length; i += BATCH) {
      const batch = toAdd.slice(i, i + BATCH);
      const { error } = await supabase.from("equipments").upsert(batch.map(toRow), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    setItems((prev) => autoAssignParents([...prev, ...toAdd]));
  }, [items]);

  const clearAll = useCallback(async () => {
    const { error } = await supabase.from("equipments").delete().neq("id", "");
    if (error) throw new Error(error.message);
    setItems([]);
  }, []);

  const removeFieldColFromAll = useCallback(async (col: string) => {
    const affected = items.filter((e) => e.fieldCols.includes(col));
    for (const e of affected) {
      const updated = { ...e, fieldCols: e.fieldCols.filter((c) => c !== col) };
      await supabase.from("equipments").update({ field_cols: updated.fieldCols }).eq("id", e.id);
    }
    setItems((prev) => prev.map((e) =>
      e.fieldCols.includes(col) ? { ...e, fieldCols: e.fieldCols.filter((c) => c !== col) } : e
    ));
  }, [items]);

  return { items, upsert, remove, addMany, clearAll, isCodeTaken, removeFieldColFromAll, loading };
}
