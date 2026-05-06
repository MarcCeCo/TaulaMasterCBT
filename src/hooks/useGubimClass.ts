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
    // Regles de la BD:
    //   - Nivells 1-3: codi ÚNIC → upsert per "code" (actualitza nom si ja existeix)
    //   - Nivell 4:    codi pot repetir-se (equip mare + components) → insert per "id"
    //                  Duplicat real = codi+nom ja existeixen alhora → s'omet
    const seenCodes    = new Set(nodes.map((n) => n.code));
    const seenCodeName = new Set(nodes.map((n) => `${n.code}||${n.name}`));

    const candidates = arr
      .map((n) => ({ ...n, code: n.code.trim() }))
      .filter((n) => n.code && n.name && isValidCode(n.code));

    const toUpsert: GubimNode[] = []; // nivells 1-3: upsert per code
    const toInsert: GubimNode[] = []; // nivell 4:    insert per id (duplicats permesos)
    let duplicates = 0;
    let remaining = candidates;
    let prevLength = -1;

    // Pas 1: ordenació topològica (un node es processa quan el seu pare ja és conegut)
    while (remaining.length > 0 && remaining.length !== prevLength) {
      prevLength = remaining.length;
      const nextRemaining: typeof remaining = [];
      for (const n of remaining) {
        const p = parentCode(n.code);
        if (!p || seenCodes.has(p)) {
          const key = `${n.code}||${n.name}`;
          const lvl = codeLevel(n.code);
          if (lvl < 4) {
            // Nivells 1-3: deduplicar per codi dins l'Excel (última guanya)
            const existing = toUpsert.findIndex((r) => r.code === n.code);
            const row = toRow(n);
            if (existing >= 0) { toUpsert[existing] = row; } else { toUpsert.push(row); }
            seenCodes.add(n.code);
          } else {
            // Nivell 4: duplicat real si codi+nom ja existeixen
            if (seenCodeName.has(key)) { duplicates++; }
            else { toInsert.push(toRow(n)); seenCodeName.add(key); }
            seenCodes.add(n.code); // marca el codi com a vist per als fills
          }
        } else {
          nextRemaining.push(n);
        }
      }
      remaining = nextRemaining;
    }

    // Pas 2: nodes orfes → crear antecessors manquants automàticament
    let autoCreated = 0;
    for (const n of remaining) {
      const ancestors: Omit<GubimNode, "id">[] = [];
      let cursor = parentCode(n.code);
      while (cursor && !seenCodes.has(cursor)) {
        ancestors.unshift({ code: cursor, name: cursor });
        cursor = parentCode(cursor);
      }
      for (const anc of ancestors) {
        const existing = toUpsert.findIndex((r) => r.code === anc.code);
        const row = toRow(anc);
        if (existing >= 0) { toUpsert[existing] = row; } else { toUpsert.push(row); autoCreated++; }
        seenCodes.add(anc.code);
        seenCodeName.add(`${anc.code}||${anc.name}`);
      }
      const key = `${n.code}||${n.name}`;
      const lvl = codeLevel(n.code);
      if (lvl < 4) {
        const existing = toUpsert.findIndex((r) => r.code === n.code);
        const row = toRow(n);
        if (existing >= 0) { toUpsert[existing] = row; } else { toUpsert.push(row); }
      } else {
        if (seenCodeName.has(key)) { duplicates++; }
        else { toInsert.push(toRow(n)); seenCodeName.add(key); }
      }
      seenCodes.add(n.code);
    }

    const BATCH = 50;

    // Nivells 1-3: upsert per code (ja deduplicats, cap risc de conflicte doble)
    for (let i = 0; i < toUpsert.length; i += BATCH) {
      const batch = toUpsert.slice(i, i + BATCH);
      const { error } = await supabase.from("gubim_class").upsert(batch, { onConflict: "code" });
      if (error) throw new Error(error.message);
    }

    // Nivell 4: insert pur — la BD NO té UNIQUE(code) per a nivell 4 (vegeu migració SQL)
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error } = await supabase.from("gubim_class").insert(batch);
      if (error) throw new Error(error.message);
    }

    const allNew = [...toUpsert, ...toInsert];
    if (allNew.length > 0) {
      setNodes((prev) => {
        const updated = prev.map((n) => {
          const u = toUpsert.find((r) => r.code === n.code);
          return u ? { ...n, name: u.name } : n;
        });
        const existingCodes = new Set(prev.map((n) => n.code));
        // Nivell 4: sempre afegim (duplicats permesos); nivells 1-3: només si nou
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
