import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/storage";

export type GubimNode = { id: string; code: string; name: string };

export const isValidCode = (code: string) => /^(\d{2})(\.(\d{2})){0,3}$/.test(code);
export const codeLevel   = (code: string) => code.split(".").length as 1 | 2 | 3 | 4;
export const parentCode  = (code: string) => {
  const parts = code.split(".");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
};

const toNode = (row: any): GubimNode => ({ id: row.id, code: row.code, name: row.name });
const toRow  = (n: Omit<GubimNode, "id"> & { id?: string }) => ({
  id:   n.id ?? uid(),
  code: n.code,
  name: n.name,
});

export function useGubimClass() {
  const [nodes, setNodes]     = useState<GubimNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("gubim_class")
      .select("*")
      .order("code")
      .then(({ data, error }) => {
        if (error) console.error("useGubimClass fetch:", error);
        else setNodes((data ?? []).map(toNode));
        setLoading(false);
      });
  }, []);

  const sorted = useMemo(() => [...nodes].sort((a, b) => a.code.localeCompare(b.code)), [nodes]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, GubimNode>();
    sorted.forEach((n) => m.set(n.code, n));
    return m;
  }, [sorted]);

  const exists      = useCallback((code: string) => nodeMap.has(code), [nodeMap]);
  const hasChildren = useCallback(
    (code: string) => sorted.some((n) => n.code !== code && n.code.startsWith(code + ".")),
    [sorted],
  );

  const addNode = useCallback(async (n: Omit<GubimNode, "id">) => {
    if (!isValidCode(n.code)) throw new Error("Format de codi invàlid");
    const p = parentCode(n.code);
    if (p && !nodeMap.has(p)) throw new Error(`El node pare ${p} no existeix`);
    // Codi duplicat: PERMÈS per al nivell 4, BLOQUEJAT per als nivells 1-3
    const lvl = codeLevel(n.code);
    if (lvl < 4 && nodeMap.has(n.code)) throw new Error("El codi ja existeix");
    const row = toRow(n);
    const { error } = await supabase.from("gubim_class").insert(row);
    if (error) throw new Error(error.message);
    setNodes((prev) => [...prev, { id: row.id, code: row.code, name: row.name }]);
  }, [nodeMap]);

  const addMany = useCallback(async (arr: Omit<GubimNode, "id">[]): Promise<{ inserted: number; autoCreated: number; duplicates: number }> => {
    // Duplicat real (tots els nivells) = codi + nom EXACTAMENT iguals → s'omet
    // Mateix codi, nom diferent:
    //   - Nivells 1-3: actualitza el nom
    //   - Nivell 4:    crea entrada nova (duplicats de codi permesos)

    const seenCodes    = new Set(nodes.map((n) => n.code));
    const seenCodeName = new Set(nodes.map((n) => `${n.code}||${n.name}`));
    // Mapa codi→id dels nodes existents a la BD (per fer update en lloc d'insert)
    const existingIdByCode = new Map(nodes.map((n) => [n.code, n.id]));

    const candidates = arr
      .map((n) => ({ ...n, code: n.code.trim() }))
      .filter((n) => n.code && n.name && isValidCode(n.code));

    // nivells 1-3: Map codi→row (última ocurrència guanya, deduplicat)
    const upsertMap = new Map<string, GubimNode>();
    const toInsert:  GubimNode[] = []; // nivell 4
    let duplicates = 0;
    let remaining = candidates;
    let prevLength = -1;

    const process = (n: Omit<GubimNode, "id">) => {
      const key = `${n.code}||${n.name}`;
      if (seenCodeName.has(key)) { duplicates++; return; } // duplicat real
      seenCodeName.add(key);
      seenCodes.add(n.code);
      const lvl = codeLevel(n.code);
      // Preserva l'id existent si el codi ja era a la BD (update en lloc d'insert)
      const existingId = existingIdByCode.get(n.code);
      const row = toRow({ ...n, id: existingId });
      if (lvl < 4) { upsertMap.set(n.code, row); }
      else         { toInsert.push(row); }
    };

    // Pas 1: ordenació topològica
    while (remaining.length > 0 && remaining.length !== prevLength) {
      prevLength = remaining.length;
      const nextRemaining: typeof remaining = [];
      for (const n of remaining) {
        const p = parentCode(n.code);
        if (!p || seenCodes.has(p)) { process(n); }
        else { nextRemaining.push(n); }
      }
      remaining = nextRemaining;
    }

    // Pas 2: nodes orfes → crear antecessors automàticament
    let autoCreated = 0;
    for (const n of remaining) {
      let cursor = parentCode(n.code);
      const ancestors: Omit<GubimNode, "id">[] = [];
      while (cursor && !seenCodes.has(cursor)) {
        ancestors.unshift({ code: cursor, name: cursor });
        cursor = parentCode(cursor);
      }
      for (const anc of ancestors) {
        const ancKey = `${anc.code}||${anc.name}`;
        if (!seenCodeName.has(ancKey)) {
          seenCodeName.add(ancKey);
          seenCodes.add(anc.code);
          const existingId = existingIdByCode.get(anc.code);
          upsertMap.set(anc.code, toRow({ ...anc, id: existingId }));
          autoCreated++;
        }
      }
      process(n);
    }

    const toUpsert = Array.from(upsertMap.values());
    const BATCH = 50;

    // Nivells 1-3: update si el codi ja existeix, insert si és nou
    // (evitem onConflict perquè la constraint és parcial i Supabase no la reconeix)
    const toUpdate = toUpsert.filter((r) => existingIdByCode.has(r.code));
    const toInsert13 = toUpsert.filter((r) => !existingIdByCode.has(r.code));

    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const batch = toUpdate.slice(i, i + BATCH);
      for (const row of batch) {
        const { error } = await supabase.from("gubim_class")
          .update({ name: row.name })
          .eq("code", row.code);
        if (error) throw new Error(error.message);
      }
    }
    for (let i = 0; i < toInsert13.length; i += BATCH) {
      const batch = toInsert13.slice(i, i + BATCH);
      const { error } = await supabase.from("gubim_class").insert(batch);
      if (error) throw new Error(error.message);
    }

    // Nivell 4: insert (duplicats de codi permesos, sense cap constraint)
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error } = await supabase.from("gubim_class").insert(batch);
      if (error) throw new Error(error.message);
    }

    const allNew = [...toUpsert, ...toInsert];
    if (allNew.length > 0) {
      setNodes((prev) => {
        const updated = prev.map((n) => {
          const u = upsertMap.get(n.code);
          return u ? { ...n, name: u.name } : n;
        });
        const existingCodes = new Set(prev.map((n) => n.code));
        const brandNew = allNew.filter(
          (n) => !existingCodes.has(n.code) || codeLevel(n.code) === 4
        );
        return [...updated, ...brandNew];
      });
    }

    return { inserted: toUpsert.length + toInsert.length - autoCreated, autoCreated, duplicates };
  }, [nodes]);

  const updateNode = useCallback(async (id: string, patch: Partial<GubimNode>) => {
    const target = nodes.find((n) => n.id === id);
    if (!target) return;
    const oldCode = target.code;
    const newCode = patch.code ?? oldCode;
    const newName = patch.name ?? target.name;

    if (newCode !== oldCode) {
      const descendants = nodes.filter((n) => n.code.startsWith(oldCode + "."));
      for (const d of descendants) {
        const updatedCode = newCode + d.code.slice(oldCode.length);
        await supabase.from("gubim_class").update({ code: updatedCode }).eq("id", d.id);
      }
    }

    const { error } = await supabase.from("gubim_class").update({ code: newCode, name: newName }).eq("id", id);
    if (error) throw new Error(error.message);

    setNodes((prev) => prev.map((n) => {
      if (n.id === id) return { ...n, code: newCode, name: newName };
      if (newCode !== oldCode && n.code.startsWith(oldCode + ".")) {
        return { ...n, code: newCode + n.code.slice(oldCode.length) };
      }
      return n;
    }));
  }, [nodes]);

  const removeNode = useCallback(async (id: string) => {
    const { error } = await supabase.from("gubim_class").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setNodes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(async () => {
    const { error } = await supabase.from("gubim_class").delete().neq("id", "");
    if (error) throw new Error(error.message);
    setNodes([]);
  }, []);

  return { nodes: sorted, nodeMap, addNode, addMany, updateNode, removeNode, exists, hasChildren, clearAll, loading };
}
