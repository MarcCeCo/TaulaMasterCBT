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

// Columnes segures que sempre existeixen a la taula equipments
const toRow = (e: Equipment) => {
  const row: any = {
    id:          e.id,
    gubim_code:  e.gubimCode,
    equip_code:  e.equipCode  || null,
    equip_name:  e.equipName,
    needs_table: e.needsTable,
    table_code:  e.tableCode  || null,
    table_name:  e.tableName  || null,
    field_cols:  e.fieldCols,
  };
  // Afegim columnes opcionals només si tenen valor (per evitar 400 si no existeixen a la BD)
  if (e.parentEquipCode) row.parent_equip_code = e.parentEquipCode;
  if (e.createdAt)       row.created_at        = e.createdAt;
  return row;
};

export function useEquipments() {
  const [items, setItems]     = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    supabase
      .from("equipments")
      .select("*")
      .order("equip_code")
      .then(({ data, error: err }) => {
        if (err) {
          console.error("useEquipments fetch:", err);
          setError(err.message);
        } else {
          setItems((data ?? []).map(toEquip));
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

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
    // Obtenim els IDs afectats localment per evitar un SELECT addicional
    const affected = items.filter((e) => e.fieldCols.includes(col));
    if (affected.length === 0) return;

    // Actualització en paral·lel (màxim 10 concurrents) en lloc de seqüencial
    // Evita N peticions seqüencials i redueix el temps total dràsticament
    const CONCURRENCY = 10;
    for (let i = 0; i < affected.length; i += CONCURRENCY) {
      await Promise.all(
        affected.slice(i, i + CONCURRENCY).map((e) =>
          supabase
            .from("equipments")
            .update({ field_cols: e.fieldCols.filter((c) => c !== col) })
            .eq("id", e.id)
        )
      );
    }

    setItems((prev) =>
      prev.map((e) =>
        e.fieldCols.includes(col)
          ? { ...e, fieldCols: e.fieldCols.filter((c) => c !== col) }
          : e
      )
    );
  }, [items]);

  return { items, upsert, remove, addMany, clearAll, isCodeTaken, removeFieldColFromAll, loading, error, retry: load };
}
