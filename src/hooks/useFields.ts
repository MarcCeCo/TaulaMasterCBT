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

    // Subscripció temps real
    const channel = supabase
      .channel("fields_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "fields" }, () => {
        supabase.from("fields").select("*").then(({ data }) => {
          if (data) setRaw(data.map(toMeta));
        });
      })
      .subscribe((status, err) => {
        if (err) console.warn("Realtime fields no disponible:", err);
      });

    return () => { supabase.removeChannel(channel); };
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
    const { error } = await supabase.from("fields").insert(row);
    if (error) throw new Error(error.message);
    setRaw((prev) => [...prev, { ...f, col }]);
  }, [fieldMap]);

  const addMany = useCallback(async (arr: FieldMeta[]) => {
    const seen   = new Set(raw.map((f) => f.col));
    const toAdd  = arr
      .map((f) => ({ ...f, col: f.col.toUpperCase() }))
      .filter((f) => f.col && !seen.has(f.col));
    if (toAdd.length === 0) return;
    const { error } = await supabase.from("fields").insert(toAdd.map(toRow));
    if (error) throw new Error(error.message);
    setRaw((prev) => [...prev, ...toAdd]);
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
