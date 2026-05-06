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
    if (p && !nodeMap.has(p)) throw new Error("El node pare no existeix");
    if (nodeMap.has(n.code))  throw new Error("El codi ja existeix");
    const row = toRow(n);
    const { error } = await supabase.from("gubim_class").upsert(row, { onConflict: "code" });
    if (error) throw new Error(error.message);
    setNodes((prev) => [...prev, { id: row.id, code: row.code, name: row.name }]);
  }, [nodeMap]);

  const addMany = useCallback(async (arr: Omit<GubimNode, "id">[]): Promise<{ inserted: number; autoCreated: number; duplicates: number }> => {
    // Tots els codis són únics a la BD (constraint code_key). Estratègia:
    // - Si el codi ja existeix → upsert (actualitza el nom si ha canviat)
    // - Si el codi és nou → insereix
    // - Duplicats dins de l'Excel (mateix codi) → es queda l'última ocurrència
    const seenCodes = new Set(nodes.map((n) => n.code));
    const candidates = arr
      .map((n) => ({ ...n, code: n.code.trim() }))
      .filter((n) => n.code && n.name && isValidCode(n.code));

    // Mapa codi→node per deduplicar l'Excel (última ocurrència guanya)
    const byCode = new Map<string, Omit<GubimNode, "id">>();
    for (const n of candidates) byCode.set(n.code, n);
    const unique = Array.from(byCode.values());

    // Ordenació topològica: un node només es pot processar si el seu pare ja és conegut
    const toProcess: Omit<GubimNode, "id">[] = [];
    let remaining = unique;
    let prevLength = -1;
    while (remaining.length > 0 && remaining.length !== prevLength) {
      prevLength = remaining.length;
      const nextRemaining: typeof remaining = [];
      for (const n of remaining) {
        const p = parentCode(n.code);
        if (!p || seenCodes.has(p)) {
          toProcess.push(n);
          seenCodes.add(n.code);
        } else {
          nextRemaining.push(n);
        }
      }
      remaining = nextRemaining;
    }

    // Nodes orfes → crear antecessors automàticament
    let autoCreated = 0;
    for (const n of remaining) {
      const ancestors: Omit<GubimNode, "id">[] = [];
      let cursor = parentCode(n.code);
      while (cursor && !seenCodes.has(cursor)) {
        ancestors.unshift({ code: cursor, name: cursor });
        cursor = parentCode(cursor);
      }
      for (const anc of ancestors) {
        if (!seenCodes.has(anc.code)) {
          toProcess.push(anc);
          seenCodes.add(anc.code);
          autoCreated++;
        }
      }
      toProcess.push(n);
      seenCodes.add(n.code);
    }

    // Preservar l'id existent si el codi ja és a la BD (per no crear duplicats d'id)
    const existingByCode = new Map(nodes.map((n) => [n.code, n]));
    const rows = toProcess.map((n) => {
      const existing = existingByCode.get(n.code);
      return toRow({ ...n, id: existing?.id });
    });

    // Deduplicar per codi (seguretat extra) i fer upsert per code
    const deduped = Array.from(
      rows.reduce((map, row) => map.set(row.code, row), new Map<string, GubimNode>()).values()
    );

    const BATCH = 50;
    for (let i = 0; i < deduped.length; i += BATCH) {
      const batch = deduped.slice(i, i + BATCH);
      const { error } = await supabase.from("gubim_class").upsert(batch, { onConflict: "code" });
      if (error) throw new Error(error.message);
    }

    const inserted = deduped.length - autoCreated;
    const duplicates = candidates.length - unique.length; // files redundants dins l'Excel

    if (deduped.length > 0) {
      setNodes((prev) => {
        const prevMap = new Map(prev.map((n) => [n.code, n]));
        for (const r of deduped) prevMap.set(r.code, r);
        return Array.from(prevMap.values());
      });
    }

    return { inserted, autoCreated, duplicates };
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
