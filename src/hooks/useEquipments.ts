import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/storage";

export type Equipment = {
  id:              string;
  gubimCode:       string;
  equipCode:       string;
  equipName:       string;
  needsTable:      boolean;
  tableCode:       string;
  tableName:       string;
  fieldCols:       string[];
  parentEquipCode: string;
  createdAt:       number;
};

// Conversió Supabase ↔ Equipment
const toEquip = (row: any): Equipment => ({
  id:              row.id,
  gubimCode:       row.gubim_code,
  equipCode:       row.equip_code       ?? "",
  equipName:       row.equip_name,
  needsTable:      row.needs_table      ?? false,
  tableCode:       row.table_code       ?? "",
  tableName:       row.table_name       ?? "",
  fieldCols:       row.field_cols       ?? [],
  parentEquipCode: row.parent_equip_code ?? "",
  createdAt:       row.created_at       ?? Date.now(),
});

const toRow = (e: Equipment) => ({
  id:               e.id,
  gubim_code:       e.gubimCode,
  equip_code:       e.equipCode       || null,
  equip_name:       e.equipName,
  needs_table:      e.needsTable,
  table_code:       e.tableCode       || null,
  table_name:       e.tableName       || null,
  field_cols:       e.fieldCols,
  parent_equip_code: e.parentEquipCode || null,
  created_at:       e.createdAt       ?? Date.now(),
});

export function useEquipments() {
  const [items, setItems]     = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("equipments")
      .select("*")
      .order("equip_code")
      .then(({ data, error }) => {
        if (error) { console.error("useEquipments fetch:", error); setLoading(false); return; }
        setItems((data ?? []).map(toEquip));
        setLoading(false);
      });
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
      return idx >= 0 ? prev.map((p, i) => (i === idx ? e : p)) : [...prev, e];
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("equipments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setItems((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addMany = useCallback(async (arr: Equipment[]) => {
    const seen  = new Set(items.map((e) => e.equipCode).filter(Boolean));
    const toAdd = arr.filter((e) => {
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
    setItems((prev) => [...prev, ...toAdd]);
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
