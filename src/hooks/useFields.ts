import { useCallback, useEffect, useMemo, useState } from "react";
import { FieldMeta, sortByClassification } from "@/lib/fields";
import { supabase } from "@/lib/supabase";

// Conversió entre FieldMeta (camelCase) i columnes Supabase (snake_case)
const toMeta = (row: any): FieldMeta => ({
  col:             row.col,
  codi:            row.codi            ?? null,
  taula_assoc:     row.taula_assoc     ?? null,
  tipus_dada:      row.tipus_dada      ?? null,
  cbt:             row.cbt             ?? null,
  format_param:    row.format_param    ?? null,
  agrupacio_revit: row.agrupacio_revit ?? null,
  grup_txt:        row.grup_txt        ?? null,
  instancia_revit: row.instancia_revit ?? null,
  disciplina:      row.disciplina      ?? null,
});

const toRow = (f: FieldMeta) => ({
  col:             f.col,
  codi:            f.codi            || null,
  taula_assoc:     f.taula_assoc     || null,
  tipus_dada:      f.tipus_dada      || null,
  cbt:             f.cbt             || null,
  format_param:    f.format_param    || null,
  agrupacio_revit: f.agrupacio_revit || null,
  grup_txt:        f.grup_txt        || null,
  instancia_revit: f.instancia_revit || null,
  disciplina:      f.disciplina      || null,
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
    const existingCodis = new Map(raw.filter(f => f.codi).map((f) => [f.codi!, f.col]));
    let duplicates = 0;

    const toAdd = arr
      .map((f) => {
        let col = f.col.toUpperCase();
        if (!col) return null;

        // Si el nom (col) ja existeix → marcar com a duplicat
        if (existingCols.has(col)) {
          col = col + " (DUPLICAT)";
          duplicates++;
        }
        existingCols.add(col);

        // Si el codi ja existeix en un altre camp → marcar com a duplicat
        let codi = f.codi;
        if (codi && existingCodis.has(codi) && existingCodis.get(codi) !== f.col) {
          codi = codi + " (DUPLICAT)";
        }
        if (codi) existingCodis.set(codi, col);

        return { ...f, col, codi };
      })
      .filter(Boolean) as FieldMeta[];

    if (toAdd.length > 0) {
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
    () => Array.from(new Set(fields.map((f) => f.agrupacio_revit).filter(Boolean) as string[])).sort(),
    [fields],
  );

  const disciplines = useMemo(
    () => Array.from(new Set(fields.map((f) => f.disciplina).filter(Boolean) as string[])).sort(),
    [fields],
  );

  return { fields, fieldMap, addField, addMany, updateField, removeField, isCustom, exists, clearAll, groups, disciplines, loading };
}
