import { useCallback, useEffect, useMemo, useState } from "react";
import { FieldMeta, sortByClassification } from "@/lib/fields";
import { supabase } from "@/lib/supabase";

// Conversió entre FieldMeta (camelCase) i columnes Supabase (snake_case)
const toMeta = (row: any): FieldMeta => ({
  col:        row.col,
  name:       row.name,
  cbt_name:   row.cbt_name,
  type:       row.type,
  unit:       row.unit,
  code:       row.code,
  category:   row.category,
  group:      row.group,
  active:     row.active ?? "Y",
  discipline: row.discipline,
  taulaAssoc: row.taula_assoc,
  order:      row.order,
  scope:      row.scope ?? "custom",
});

const toRow = (f: FieldMeta) => ({
  col:        f.col,
  name:       f.name,
  cbt_name:   f.cbt_name,
  type:       f.type,
  unit:       f.unit,
  code:       f.code,
  category:   f.category,
  group:      f.group,
  active:     f.active,
  discipline: f.discipline,
  taula_assoc: f.taulaAssoc,
  order:      f.order,
  scope:      f.scope,
});

export function useFields() {
  const [raw, setRaw]         = useState<FieldMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // Càrrega inicial
  useEffect(() => {
    supabase
      .from("fields")
      .select("*")
      .then(({ data, error }) => {
        if (error) console.error("useFields fetch:", error);
        else setRaw((data ?? []).map(toMeta));
        setLoading(false);
      });
  }, []);

  const fields = useMemo(() => sortByClassification(raw), [raw]);

  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldMeta>();
    fields.forEach((f) => m.set(f.col, f));
    return m;
  }, [fields]);

  const exists   = useCallback((col: string) => fieldMap.has(col.toUpperCase()), [fieldMap]);
  const isCustom = useCallback((_col: string) => true, []);

  const addField = useCallback(async (f: FieldMeta) => {
    const col = f.col.toUpperCase();
    if (fieldMap.has(col)) throw new Error("El camp ja existeix");
    const row = toRow({ ...f, col });
    const { error } = await supabase.from("fields").upsert(row, { onConflict: "col" });
    if (error) throw new Error(error.message);
    setRaw((prev) => [...prev, { ...f, col }]);
  }, [fieldMap]);

  const addMany = useCallback(async (arr: FieldMeta[]): Promise<{ inserted: number; duplicates: number }> => {
    const existingCols = new Set(raw.map((f) => f.col));

    // Per als duplicats (col ja existent), generem un nou col únic i marquem el nom amb "(duplicat)"
    let duplicates = 0;
    const toAdd: FieldMeta[] = arr.map((f) => {
      const col = f.col.toUpperCase();
      if (existingCols.has(col)) {
        duplicates++;
        const newCol = col + "_DUP_" + Date.now().toString().slice(-6);
        return { ...f, col: newCol, name: (f.name ?? col) + " (duplicat)" };
      }
      existingCols.add(col); // evita col·lisions dins el propi lot
      return { ...f, col };
    }).filter((f) => f.col);

    if (toAdd.length > 0) {
      // Insereix en lots de 50 per evitar errors de límit
      const BATCH = 50;
      for (let i = 0; i < toAdd.length; i += BATCH) {
        const batch = toAdd.slice(i, i + BATCH);
        const { error } = await supabase.from("fields").upsert(batch.map(toRow), { onConflict: "col" });
        if (error) throw new Error(error.message);
      }
      setRaw((prev) => {
        const prevCols = new Set(prev.map((f) => f.col));
        return [...prev, ...toAdd.filter((f) => !prevCols.has(f.col))];
      });
    }

    return { inserted: toAdd.length, duplicates };
  }, [raw]);

  const updateField = useCallback(async (col: string, patch: Partial<FieldMeta>) => {
    const merged = { ...fieldMap.get(col), ...patch, col } as FieldMeta;
    const { error } = await supabase.from("fields").update(toRow(merged)).eq("col", col);
    if (error) throw new Error(error.message);
    setRaw((prev) => prev.map((f) => (f.col === col ? merged : f)));
  }, [fieldMap]);

  const removeField = useCallback(async (col: string) => {
    const { error } = await supabase.from("fields").delete().eq("col", col);
    if (error) throw new Error(error.message);
    setRaw((prev) => prev.filter((f) => f.col !== col));
  }, []);

  const clearAll = useCallback(async () => {
    const { error } = await supabase.from("fields").delete().neq("col", "");
    if (error) throw new Error(error.message);
    setRaw([]);
  }, []);

  const groups = useMemo(
    () => Array.from(new Set(fields.map((f) => f.group).filter(Boolean) as string[])).sort(),
    [fields],
  );

  const disciplines = useMemo(
    () => Array.from(new Set(fields.map((f) => f.discipline).filter(Boolean) as string[])).sort(),
    [fields],
  );

  return { fields, fieldMap, addField, addMany, updateField, removeField, isCustom, exists, clearAll, groups, disciplines, loading };
}
