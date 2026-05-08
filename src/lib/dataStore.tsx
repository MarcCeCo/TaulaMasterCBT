/**
 * DataStore — magatzem centralitzat de dades de l'aplicació
 *
 * Per què:
 *  - Abans hi havia 3 hooks (useEquipments, useFields, useGubimClass) cadascun
 *    amb el seu propi useState + useEffect → 3 peticions seqüencialment
 *    i múltiples instàncies si el component es muntava en llocs diferents.
 *  - Ara: UNA sola càrrega paral·lela al inici, resultat compartit via Context.
 *    Tots els components llegeixen des d'aquí sense duplicar peticions ni estat.
 */

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/storage";
import { type FieldMeta, sortByClassification } from "@/lib/fields";
import { type GubimNode, isValidCode, parentCode } from "@/hooks/useGubimClass";
import { type Equipment } from "@/hooks/useEquipments";

// ─── Conversors ──────────────────────────────────────────────────────────────

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

const equipToRow = (e: Equipment) => {
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
  if (e.parentEquipCode) row.parent_equip_code = e.parentEquipCode;
  if (e.createdAt)       row.created_at        = e.createdAt;
  return row;
};

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

const fieldToRow = (f: FieldMeta) => ({
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

const toNode = (row: any): GubimNode => ({ id: row.id, code: row.code, name: row.name });

// ─── Tipus del Context ────────────────────────────────────────────────────────

export interface DataStoreValue {
  // Estat global
  loading: boolean;
  error:   string | null;
  retry:   () => void;

  // ── Equipments ──
  equipments:    Equipment[];
  upsertEquip:   (e: Equipment) => Promise<void>;
  removeEquip:   (id: string) => Promise<void>;
  addManyEquips: (arr: Equipment[]) => Promise<void>;
  clearEquips:   () => Promise<void>;
  isEquipCodeTaken: (code: string, excludeId?: string) => boolean;
  removeFieldColFromAll: (col: string) => Promise<void>;

  // ── Fields ──
  rawFields:    FieldMeta[];
  fields:       FieldMeta[];       // ordenats per classificació
  fieldMap:     Map<string, FieldMeta>;
  addField:     (f: FieldMeta) => Promise<void>;
  addManyFields:(arr: FieldMeta[]) => Promise<{ inserted: number; duplicates: number }>;
  updateField:  (col: string, patch: Partial<FieldMeta>) => Promise<void>;
  removeField:  (col: string) => Promise<void>;
  clearFields:  () => Promise<void>;
  fieldExists:  (col: string) => boolean;
  isCustomField:(_col: string) => boolean;
  fieldGroups:  string[];
  fieldDisciplines: string[];

  // ── GubimClass ──
  gubimNodes:   GubimNode[];
  gubimNodeMap: Map<string, GubimNode>;
  addGubimNode: (n: Omit<GubimNode, "id">) => Promise<void>;
  addManyGubim: (arr: Omit<GubimNode, "id">[]) => Promise<{ inserted: number; autoCreated: number; duplicates: number }>;
  updateGubimNode: (id: string, patch: Partial<GubimNode>) => Promise<void>;
  removeGubimNode: (id: string) => Promise<void>;
  clearGubim:   () => Promise<void>;
  gubimExists:  (code: string) => boolean;
  gubimHasChildren: (code: string) => boolean;
}

const DataStoreContext = createContext<DataStoreValue | null>(null);

export const useDataStore = (): DataStoreValue => {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useDataStore: cal DataStoreProvider");
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [rawFields,  setRawFields]  = useState<FieldMeta[]>([]);
  const [gubimRaw,   setGubimRaw]   = useState<GubimNode[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const loadingRef = useRef(false);

  // ── Càrrega paral·lela única ──────────────────────────────────────────────
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Les 3 peticions en PARAL·LEL — era el major coll d'ampolla
      const [equipRes, fieldsRes, gubimRes] = await Promise.all([
        supabase.from("equipments").select("*").order("equip_code"),
        supabase.from("fields").select("*"),
        supabase.from("gubim_class").select("*").order("code"),
      ]);

      const errs = [equipRes.error, fieldsRes.error, gubimRes.error].filter(Boolean);
      if (errs.length > 0) {
        setError(errs[0]!.message);
      } else {
        // PERF: startTransition marca aquestes actualitzacions com a no urgents
        // React pot interrompre el render si hi ha interaccions pendents (p.ex. click)
        startTransition(() => {
          setEquipments((equipRes.data ?? []).map(toEquip));
          setRawFields((fieldsRes.data ?? []).map(toMeta));
          setGubimRaw((gubimRes.data ?? []).map(toNode));
        });
      }
    } catch (e: any) {
      setError(e?.message ?? "Error de xarxa");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derivats amb memo ─────────────────────────────────────────────────────
  const fields = useMemo(() => sortByClassification(rawFields), [rawFields]);

  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldMeta>();
    rawFields.forEach((f) => m.set(f.col, f));
    return m;
  }, [rawFields]);

  const gubimNodes = useMemo(
    () => [...gubimRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [gubimRaw],
  );

  const gubimNodeMap = useMemo(() => {
    const m = new Map<string, GubimNode>();
    gubimNodes.forEach((n) => m.set(n.code, n));
    return m;
  }, [gubimNodes]);

  const fieldGroups = useMemo(
    () => Array.from(new Set(rawFields.map((f) => f.agrupacio_revit).filter(Boolean) as string[])).sort(),
    [rawFields],
  );

  const fieldDisciplines = useMemo(
    () => Array.from(new Set(rawFields.map((f) => f.disciplina).filter(Boolean) as string[])).sort(),
    [rawFields],
  );

  // ── Equipments: mutacions ─────────────────────────────────────────────────
  const upsertEquip = useCallback(async (e: Equipment) => {
    const { error } = await supabase.from("equipments").upsert(equipToRow(e), { onConflict: "id" });
    if (error) throw new Error(error.message);
    setEquipments((prev) => {
      const idx = prev.findIndex((p) => p.id === e.id);
      return idx >= 0 ? prev.map((p, i) => (i === idx ? e : p)) : [...prev, e];
    });
  }, []);

  const removeEquip = useCallback(async (id: string) => {
    const { error } = await supabase.from("equipments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setEquipments((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addManyEquips = useCallback(async (arr: Equipment[]) => {
    const seen  = new Set(equipments.map((e) => e.equipCode).filter(Boolean));
    const toAdd = arr.filter((e) => {
      if (!e.equipCode) return true;
      if (seen.has(e.equipCode)) return false;
      seen.add(e.equipCode);
      return true;
    });
    if (toAdd.length === 0) return;
    const BATCH = 50;
    for (let i = 0; i < toAdd.length; i += BATCH) {
      const { error } = await supabase.from("equipments").upsert(
        toAdd.slice(i, i + BATCH).map(equipToRow),
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
    }
    setEquipments((prev) => [...prev, ...toAdd]);
  }, [equipments]);

  const clearEquips = useCallback(async () => {
    const { error } = await supabase.from("equipments").delete().neq("id", "");
    if (error) throw new Error(error.message);
    setEquipments([]);
  }, []);

  const isEquipCodeTaken = useCallback(
    (code: string, excludeId?: string) =>
      equipments.some((e) => e.equipCode === code && e.id !== excludeId),
    [equipments],
  );

  const removeFieldColFromAll = useCallback(async (col: string) => {
    const affected = equipments.filter((e) => e.fieldCols.includes(col));
    if (affected.length === 0) return;
    const CONCURRENCY = 10;
    for (let i = 0; i < affected.length; i += CONCURRENCY) {
      await Promise.all(
        affected.slice(i, i + CONCURRENCY).map((e) =>
          supabase.from("equipments")
            .update({ field_cols: e.fieldCols.filter((c) => c !== col) })
            .eq("id", e.id),
        ),
      );
    }
    setEquipments((prev) =>
      prev.map((e) =>
        e.fieldCols.includes(col)
          ? { ...e, fieldCols: e.fieldCols.filter((c) => c !== col) }
          : e,
      ),
    );
  }, [equipments]);

  // ── Fields: mutacions ─────────────────────────────────────────────────────
  const addField = useCallback(async (f: FieldMeta) => {
    const col = f.col.toUpperCase();
    if (fieldMap.has(col)) throw new Error("El camp ja existeix");
    const { error } = await supabase.from("fields").upsert(fieldToRow({ ...f, col }), { onConflict: "col" });
    if (error) throw new Error(error.message);
    setRawFields((prev) => [...prev, { ...f, col }]);
  }, [fieldMap]);

  const addManyFields = useCallback(async (arr: FieldMeta[]): Promise<{ inserted: number; duplicates: number }> => {
    const existingCols  = new Set(rawFields.map((f) => f.col));
    const existingCodis = new Map(rawFields.filter((f) => f.codi).map((f) => [f.codi!, f.col]));
    let duplicates = 0;

    const toAdd = arr.map((f) => {
      let col = f.col.toUpperCase();
      if (!col) return null;
      if (existingCols.has(col)) { col = col + " (DUPLICAT)"; duplicates++; }
      existingCols.add(col);
      let codi = f.codi;
      if (codi && existingCodis.has(codi) && existingCodis.get(codi) !== f.col) {
        codi = codi + " (DUPLICAT)";
      }
      if (codi) existingCodis.set(codi, col);
      return { ...f, col, codi };
    }).filter(Boolean) as FieldMeta[];

    if (toAdd.length > 0) {
      const BATCH = 50;
      for (let i = 0; i < toAdd.length; i += BATCH) {
        const { error } = await supabase.from("fields").upsert(
          toAdd.slice(i, i + BATCH).map(fieldToRow),
          { onConflict: "col" },
        );
        if (error) throw new Error(error.message);
      }
      setRawFields((prev) => {
        const prevCols = new Set(prev.map((f) => f.col));
        return [...prev, ...toAdd.filter((f) => !prevCols.has(f.col))];
      });
    }
    return { inserted: toAdd.length, duplicates };
  }, [rawFields]);

  const updateField = useCallback(async (col: string, patch: Partial<FieldMeta>) => {
    const merged = { ...fieldMap.get(col), ...patch, col } as FieldMeta;
    const { error } = await supabase.from("fields").update(fieldToRow(merged)).eq("col", col);
    if (error) throw new Error(error.message);
    setRawFields((prev) => prev.map((f) => (f.col === col ? merged : f)));
  }, [fieldMap]);

  const removeField = useCallback(async (col: string) => {
    const { error } = await supabase.from("fields").delete().eq("col", col);
    if (error) throw new Error(error.message);
    setRawFields((prev) => prev.filter((f) => f.col !== col));
  }, []);

  const clearFields = useCallback(async () => {
    const { error } = await supabase.from("fields").delete().neq("col", "");
    if (error) throw new Error(error.message);
    setRawFields([]);
  }, []);

  // ── GubimClass: mutacions ─────────────────────────────────────────────────
  const addGubimNode = useCallback(async (n: Omit<GubimNode, "id">) => {
    if (!isValidCode(n.code)) throw new Error("Format de codi invàlid");
    const p = parentCode(n.code);
    if (p && !gubimNodeMap.has(p)) throw new Error(`El node pare ${p} no existeix`);
    // Duplicats permesos a tots els nivells: un codi duplicat indica equip mare + components
    const row = { id: uid(), code: n.code, name: n.name };
    const { error } = await supabase.from("gubim_class").insert(row);
    if (error) throw new Error(error.message);
    setGubimRaw((prev) => [...prev, row]);
  }, [gubimNodeMap]);

  const addManyGubim = useCallback(async (
    arr: Omit<GubimNode, "id">[],
  ): Promise<{ inserted: number; autoCreated: number; duplicates: number }> => {
    // seenCodes: tots els codis que ja existeixen (per validar pares)
    // Ara els duplicats estan permesos a TOTS els nivells (equip mare + components)
    const seenCodes    = new Set(gubimRaw.map((n) => n.code));
    const seenCodeName = new Set(gubimRaw.map((n) => `${n.code}||${n.name}`));

    const candidates = arr
      .map((n) => ({ ...n, code: n.code.trim() }))
      .filter((n) => n.code && n.name && isValidCode(n.code));

    // Tots els nodes nous (inclosos nivells 1-3 duplicats) van a toInsert
    const toInsert: GubimNode[] = [];
    let duplicates = 0;
    let remaining = candidates;
    let prevLength = -1;

    const processNode = (n: Omit<GubimNode, "id">) => {
      const key = `${n.code}||${n.name}`;
      if (seenCodeName.has(key)) { duplicates++; return; }
      seenCodeName.add(key);
      seenCodes.add(n.code);
      // Tots els nivells usen insert (duplicats permesos)
      toInsert.push({ id: uid(), code: n.code, name: n.name });
    };

    while (remaining.length > 0 && remaining.length !== prevLength) {
      prevLength = remaining.length;
      const next: typeof remaining = [];
      for (const n of remaining) {
        const p = parentCode(n.code);
        if (!p || seenCodes.has(p)) processNode(n);
        else next.push(n);
      }
      remaining = next;
    }

    let autoCreated = 0;
    for (const n of remaining) {
      let cursor = parentCode(n.code);
      const ancestors: Omit<GubimNode, "id">[] = [];
      while (cursor && !seenCodes.has(cursor)) {
        ancestors.unshift({ code: cursor, name: cursor });
        cursor = parentCode(cursor);
      }
      for (const anc of ancestors) {
        const k = `${anc.code}||${anc.name}`;
        if (!seenCodeName.has(k)) {
          seenCodeName.add(k);
          seenCodes.add(anc.code);
          toInsert.push({ id: uid(), code: anc.code, name: anc.name });
          autoCreated++;
        }
      }
      processNode(n);
    }

    const BATCH = 50;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error } = await supabase.from("gubim_class").insert(toInsert.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
    }

    if (toInsert.length > 0) {
      setGubimRaw((prev) => [...prev, ...toInsert]);
    }
    return { inserted: toInsert.length - autoCreated, autoCreated, duplicates };
  }, [gubimRaw]);

  const updateGubimNode = useCallback(async (id: string, patch: Partial<GubimNode>) => {
    const target = gubimRaw.find((n) => n.id === id);
    if (!target) return;
    const oldCode = target.code;
    const newCode = patch.code ?? oldCode;
    const newName = patch.name ?? target.name;

    if (newCode !== oldCode) {
      const descendants = gubimRaw.filter((n) => n.code.startsWith(oldCode + "."));
      for (const d of descendants) {
        const updatedCode = newCode + d.code.slice(oldCode.length);
        await supabase.from("gubim_class").update({ code: updatedCode }).eq("id", d.id);
      }
    }
    const { error } = await supabase.from("gubim_class").update({ code: newCode, name: newName }).eq("id", id);
    if (error) throw new Error(error.message);
    setGubimRaw((prev) => prev.map((n) => {
      if (n.id === id) return { ...n, code: newCode, name: newName };
      if (newCode !== oldCode && n.code.startsWith(oldCode + "."))
        return { ...n, code: newCode + n.code.slice(oldCode.length) };
      return n;
    }));
  }, [gubimRaw]);

  const removeGubimNode = useCallback(async (id: string) => {
    const { error } = await supabase.from("gubim_class").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setGubimRaw((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearGubim = useCallback(async () => {
    const { error } = await supabase.from("gubim_class").delete().neq("id", "");
    if (error) throw new Error(error.message);
    setGubimRaw([]);
  }, []);

  const gubimExists      = useCallback((code: string) => gubimNodeMap.has(code), [gubimNodeMap]);
  const gubimHasChildren = useCallback(
    (code: string) => gubimNodes.some((n) => n.code !== code && n.code.startsWith(code + ".")),
    [gubimNodes],
  );
  const fieldExists   = useCallback((col: string) => fieldMap.has(col.toUpperCase()), [fieldMap]);
  const isCustomField = useCallback((_col: string) => true, []);

  const value: DataStoreValue = {
    loading, error, retry: load,
    // Equipments
    equipments, upsertEquip, removeEquip, addManyEquips, clearEquips,
    isEquipCodeTaken, removeFieldColFromAll,
    // Fields
    rawFields, fields, fieldMap,
    addField, addManyFields, updateField, removeField, clearFields,
    fieldExists, isCustomField, fieldGroups, fieldDisciplines,
    // GubimClass
    gubimNodes, gubimNodeMap,
    addGubimNode, addManyGubim, updateGubimNode, removeGubimNode, clearGubim,
    gubimExists, gubimHasChildren,
  };

  return (
    <DataStoreContext.Provider value={value}>
      {children}
    </DataStoreContext.Provider>
  );
}
