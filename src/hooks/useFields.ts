import { useCallback, useMemo } from "react";
import { FieldMeta, sortByClassification } from "@/lib/fields";
import { useDebouncedLocalStorage } from "@/lib/storage";

// Ja no hi ha camps base: tot el diccionari és personalitzat
const KEY_CUSTOM = "cbt.customFields.v2";

export function useFields() {
  const [custom, setCustom] = useDebouncedLocalStorage<FieldMeta[]>(KEY_CUSTOM, []);

  const fields = useMemo(() => sortByClassification(custom), [custom]);

  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldMeta>();
    fields.forEach((f) => m.set(f.col, f));
    return m;
  }, [fields]);

  const exists = useCallback((col: string) => fieldMap.has(col.toUpperCase()), [fieldMap]);
  const isCustom = useCallback((_col: string) => true, []);

  const addField = useCallback(
    (f: FieldMeta) => {
      const col = f.col.toUpperCase();
      if (fieldMap.has(col)) throw new Error("El camp ja existeix");
      setCustom((prev) => [...prev, { ...f, col }]);
    },
    [fieldMap, setCustom],
  );

  const addMany = useCallback(
    (arr: FieldMeta[]) => {
      setCustom((prev) => {
        const seen = new Set(prev.map((p) => p.col));
        const toAdd = arr
          .map((f) => ({ ...f, col: f.col.toUpperCase() }))
          .filter((f) => f.col && !seen.has(f.col));
        return [...prev, ...toAdd];
      });
    },
    [setCustom],
  );

  const updateField = useCallback(
    (col: string, patch: Partial<FieldMeta>) => {
      setCustom((prev) => prev.map((f) => (f.col === col ? { ...f, ...patch, col } : f)));
    },
    [setCustom],
  );

  const removeField = useCallback(
    (col: string) => setCustom((prev) => prev.filter((f) => f.col !== col)),
    [setCustom],
  );

  const clearAll = useCallback(() => setCustom([]), [setCustom]);

  const groups = useMemo(
    () => Array.from(new Set(fields.map((f) => f.group).filter(Boolean) as string[])).sort(),
    [fields],
  );

  const disciplines = useMemo(
    () => Array.from(new Set(fields.map((f) => f.discipline).filter(Boolean) as string[])).sort(),
    [fields],
  );

  return { fields, fieldMap, addField, addMany, updateField, removeField, isCustom, exists, clearAll, groups, disciplines };
}
