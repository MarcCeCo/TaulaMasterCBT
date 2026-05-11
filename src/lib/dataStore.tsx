/**
 * DataStore — magatzem centralitzat de dades de l'aplicació
 *
 * Per què:
 *  - Abans hi havia 3 hooks (useEquipments, useFields, useGubimClass) cadascun
 *    amb el seu propi useState + useEffect → 3 peticions seqüencialment
 *    i múltiples instàncies si el component es muntava en llocs diferents.
 *  - Ara: UNA sola càrrega paral·lela al inici, resultat compartit via Context.
 *    Tots els components llegeixen des d'aquí sense duplicar peticions ni estat.
 *
 * Token / reconnexió:
 *  - TOTES les operacions (lectura i escriptura) usen fetch directe amb Bearer
 *    token llegit del ref via getToken() — igual que UserManagerDialog.
 *  - Això evita que el client supabase quedi bloquejat mentre reconecta el
 *    WebSocket en tornar a una pestanya inactiva.
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
import { useAuth } from "@/lib/auth";
import { uid } from "@/lib/storage";
import { type FieldMeta, sortByClassification } from "@/lib/fields";
import { type GubimNode, isValidCode, parentCode } from "@/hooks/useGubimClass";
import { type Equipment } from "@/hooks/useEquipments";

// URL i clau anon — per construir les URLs de la REST API de Supabase
const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string).trim();
const SUPA_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string).trim();

// ─── Helper: fetch directe a Supabase REST API ────────────────────────────────
// Mateix patró que UserManagerDialog: token síncron del ref, mai getSession().
// method: GET | POST | PATCH | DELETE
// path: p.ex. "equipments?id=eq.xxx" (sense /rest/v1/)
// body: objecte que es serialitza a JSON (opcional)
// extraHeaders: capçaleres addicionals (p.ex. Prefer per a upsert)
async function supa(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<any[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    signal: controller.signal,
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": SUPA_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[${method} ${path}] ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

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
  loading: boolean;
  error:   string | null;
  retry:   () => void;

  equipments:    Equipment[];
  upsertEquip:   (e: Equipment) => Promise<void>;
  removeEquip:   (id: string) => Promise<void>;
  addManyEquips: (arr: Equipment[]) => Promise<void>;
  clearEquips:   () => Promise<void>;
  isEquipCodeTaken: (code: string, excludeId?: string) => boolean;
  removeFieldColFromAll: (col: string) => Promise<void>;

  rawFields:    FieldMeta[];
  fields:       FieldMeta[];
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
  const { getToken } = useAuth();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [rawFields,  setRawFields]  = useState<FieldMeta[]>([]);
  const [gubimRaw,   setGubimRaw]   = useState<GubimNode[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const loadingRef     = useRef(false);
  const needsReloadRef = useRef(false);

  // ── Càrrega ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const token = getToken();
    console.log("[DataStore.load] token:", token ? "OK" : "BUIT");

    try {
      const [equipData, fieldsData] = await Promise.all([
        supa(token, "GET", "equipments?select=*&order=equip_code.asc"),
        supa(token, "GET", "fields?select=*"),
      ]);

      // gubim_class: paginació (Supabase limita a 1000 files per defecte)
      const all: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const page = await supa(
          token, "GET",
          `gubim_class?select=*&order=code.asc&offset=${from}&limit=${PAGE}`
        );
        all.push(...page);
        if (page.length < PAGE) break;
        from += PAGE;
      }

      startTransition(() => {
        setEquipments(equipData.map(toEquip));
        setRawFields(fieldsData.map(toMeta));
        setGubimRaw(all.map(toNode));
      });
    } catch (e: any) {
      setError(e?.message ?? "Error de xarxa");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  // TOKEN_REFRESHED + visibilitychange — mateix patró que AuthProvider
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") {
        if (document.hidden) {
          needsReloadRef.current = true;
        } else {
          load();
        }
      }
    });

    const handleVisibility = () => {
      if (!document.hidden && needsReloadRef.current) {
        needsReloadRef.current = false;
        load();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  // ── Derivats ──────────────────────────────────────────────────────────────
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
    gubimNodes.forEach((n) => { if (!m.has(n.code)) m.set(n.code, n); });
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
    const token = getToken();
    await supa(token, "POST", "equipments?on_conflict=id", equipToRow(e), {
      "Prefer": "return=representation,resolution=merge-duplicates",
    });
    setEquipments((prev) => {
      const idx = prev.findIndex((p) => p.id === e.id);
      return idx >= 0 ? prev.map((p, i) => (i === idx ? e : p)) : [...prev, e];
    });
  }, [getToken]);

  const removeEquip = useCallback(async (id: string) => {
    const token = getToken();
    await supa(token, "DELETE", `equipments?id=eq.${id}`);
    setEquipments((prev) => prev.filter((e) => e.id !== id));
  }, [getToken]);

  const addManyEquips = useCallback(async (arr: Equipment[]) => {
    const seen = new Set(
      equipments.map((e) => `${e.gubimCode}::${e.equipCode}`).filter((k) => !k.endsWith("::"))
    );
    const toAdd = arr.filter((e) => {
      if (!e.equipCode) return true;
      const key = `${e.gubimCode}::${e.equipCode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (toAdd.length === 0) return;
    const token = getToken();
    const BATCH = 50;
    for (let i = 0; i < toAdd.length; i += BATCH) {
      await supa(token, "POST", "equipments?on_conflict=id",
        toAdd.slice(i, i + BATCH).map(equipToRow),
        { "Prefer": "return=representation,resolution=merge-duplicates" },
      );
    }
    setEquipments((prev) => [...prev, ...toAdd]);
  }, [getToken, equipments]);

  const clearEquips = useCallback(async () => {
    const token = getToken();
    await supa(token, "DELETE", `equipments?id=neq.`);
    setEquipments([]);
  }, [getToken]);

  const isEquipCodeTaken = useCallback(
    (code: string, excludeId?: string) =>
      equipments.some((e) => e.equipCode === code && e.id !== excludeId),
    [equipments],
  );

  const removeFieldColFromAll = useCallback(async (col: string) => {
    const affected = equipments.filter((e) => e.fieldCols.includes(col));
    if (affected.length === 0) return;
    const token = getToken();
    const CONCURRENCY = 10;
    for (let i = 0; i < affected.length; i += CONCURRENCY) {
      await Promise.all(
        affected.slice(i, i + CONCURRENCY).map((e) =>
          supa(token, "PATCH", `equipments?id=eq.${e.id}`,
            { field_cols: e.fieldCols.filter((c) => c !== col) }
          )
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
  }, [getToken, equipments]);

  // ── Fields: mutacions ─────────────────────────────────────────────────────

  const addField = useCallback(async (f: FieldMeta) => {
    const col = f.col.toUpperCase();
    if (fieldMap.has(col)) throw new Error("El camp ja existeix");
    const token = getToken();
    await supa(token, "POST", "fields?on_conflict=col", fieldToRow({ ...f, col }), {
      "Prefer": "return=representation,resolution=merge-duplicates",
    });
    setRawFields((prev) => [...prev, { ...f, col }]);
  }, [getToken, fieldMap]);

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
      const token = getToken();
      const BATCH = 50;
      for (let i = 0; i < toAdd.length; i += BATCH) {
        await supa(token, "POST", "fields?on_conflict=col",
          toAdd.slice(i, i + BATCH).map(fieldToRow),
          { "Prefer": "return=representation,resolution=merge-duplicates" },
        );
      }
      setRawFields((prev) => {
        const prevCols = new Set(prev.map((f) => f.col));
        return [...prev, ...toAdd.filter((f) => !prevCols.has(f.col))];
      });
    }
    return { inserted: toAdd.length, duplicates };
  }, [getToken, rawFields]);

  const updateField = useCallback(async (col: string, patch: Partial<FieldMeta>) => {
    const merged = { ...fieldMap.get(col), ...patch, col } as FieldMeta;
    const token = getToken();
    await supa(token, "PATCH", `fields?col=eq.${encodeURIComponent(col)}`, fieldToRow(merged));
    setRawFields((prev) => prev.map((f) => (f.col === col ? merged : f)));
  }, [getToken, fieldMap]);

  const removeField = useCallback(async (col: string) => {
    const token = getToken();
    await supa(token, "DELETE", `fields?col=eq.${encodeURIComponent(col)}`);
    setRawFields((prev) => prev.filter((f) => f.col !== col));
  }, [getToken]);

  const clearFields = useCallback(async () => {
    const token = getToken();
    await supa(token, "DELETE", `fields?col=neq.`);
    setRawFields([]);
  }, [getToken]);

  // ── GubimClass: mutacions ─────────────────────────────────────────────────

  const addGubimNode = useCallback(async (n: Omit<GubimNode, "id">) => {
    if (!isValidCode(n.code)) throw new Error("Format de codi invàlid");
    const p = parentCode(n.code);
    if (p && !gubimNodeMap.has(p)) throw new Error(`El node pare ${p} no existeix`);
    const alreadyExists = gubimRaw.some((x) => x.code === n.code && x.name === n.name);
    if (alreadyExists) throw new Error("Aquest node (codi + nom) ja existeix");
    const row = { id: uid(), code: n.code, name: n.name };
    const token = getToken();
    await supa(token, "POST", "gubim_class", row);
    setGubimRaw((prev) => [...prev, row]);
  }, [getToken, gubimNodeMap, gubimRaw]);

  const addManyGubim = useCallback(async (
    arr: Omit<GubimNode, "id">[],
  ): Promise<{ inserted: number; autoCreated: number; duplicates: number }> => {
    const seenCodes    = new Set(gubimRaw.map((n) => n.code));
    const seenCodeName = new Set(gubimRaw.map((n) => `${n.code}||${n.name}`));

    const candidates = arr
      .map((n) => ({ ...n, code: n.code.trim() }))
      .filter((n) => n.code && n.name && isValidCode(n.code));

    const toUpsert: GubimNode[] = [];
    let duplicates = 0;
    let remaining = candidates;
    let prevLength = -1;

    const processNode = (n: Omit<GubimNode, "id">) => {
      const key = `${n.code}||${n.name}`;
      if (seenCodeName.has(key)) { duplicates++; return; }
      seenCodeName.add(key);
      seenCodes.add(n.code);
      toUpsert.push({ id: uid(), code: n.code, name: n.name });
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
          toUpsert.push({ id: uid(), code: anc.code, name: anc.name });
          autoCreated++;
        }
      }
      processNode(n);
    }

    const token = getToken();
    const BATCH = 50;
    for (let i = 0; i < toUpsert.length; i += BATCH) {
      await supa(token, "POST", "gubim_class", toUpsert.slice(i, i + BATCH));
    }

    if (toUpsert.length > 0) {
      setGubimRaw((prev) => [...prev, ...toUpsert]);
    }
    return { inserted: toUpsert.length - autoCreated, autoCreated, duplicates };
  }, [getToken, gubimRaw]);

  const updateGubimNode = useCallback(async (id: string, patch: Partial<GubimNode>) => {
    const target = gubimRaw.find((n) => n.id === id);
    if (!target) return;
    const oldCode = target.code;
    const newCode = patch.code ?? oldCode;
    const newName = patch.name ?? target.name;
    const token = getToken();

    if (newCode !== oldCode) {
      const descendants = gubimRaw.filter((n) => n.code.startsWith(oldCode + "."));
      await Promise.all(
        descendants.map((d) =>
          supa(token, "PATCH", `gubim_class?id=eq.${d.id}`,
            { code: newCode + d.code.slice(oldCode.length) }
          )
        )
      );
    }
    await supa(token, "PATCH", `gubim_class?id=eq.${id}`, { code: newCode, name: newName });
    setGubimRaw((prev) => prev.map((n) => {
      if (n.id === id) return { ...n, code: newCode, name: newName };
      if (newCode !== oldCode && n.code.startsWith(oldCode + "."))
        return { ...n, code: newCode + n.code.slice(oldCode.length) };
      return n;
    }));
  }, [getToken, gubimRaw]);

  const removeGubimNode = useCallback(async (id: string) => {
    const token = getToken();
    await supa(token, "DELETE", `gubim_class?id=eq.${id}`);
    setGubimRaw((prev) => prev.filter((n) => n.id !== id));
  }, [getToken]);

  const clearGubim = useCallback(async () => {
    const token = getToken();
    await supa(token, "DELETE", `gubim_class?id=neq.`);
    setGubimRaw([]);
  }, [getToken]);

  const gubimExists      = useCallback((code: string) => gubimNodeMap.has(code), [gubimNodeMap]);
  const gubimHasChildren = useCallback(
    (code: string) => gubimNodes.some((n) => n.code !== code && n.code.startsWith(code + ".")),
    [gubimNodes],
  );
  const fieldExists   = useCallback((col: string) => fieldMap.has(col.toUpperCase()), [fieldMap]);
  const isCustomField = useCallback((_col: string) => true, []);

  const value: DataStoreValue = {
    loading, error, retry: load,
    equipments, upsertEquip, removeEquip, addManyEquips, clearEquips,
    isEquipCodeTaken, removeFieldColFromAll,
    rawFields, fields, fieldMap,
    addField, addManyFields, updateField, removeField, clearFields,
    fieldExists, isCustomField, fieldGroups, fieldDisciplines,
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
