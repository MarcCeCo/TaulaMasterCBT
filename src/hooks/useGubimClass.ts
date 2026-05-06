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
    // Nivells 1-3: codi ÚNIC a la BD → upsert (actualitza si ja existeix)
    // Nivell 4: permet duplicats → si el codi ja existeix, afegim sufix _2, _3...
    const seenCodes = new Set(nodes.map((n) => n.code));
    const candidates = arr
      .map((n) => ({ ...n, code: n.code.trim() }))
      .filter((n) => n.code && n.name && isValidCode(n.code));

    // Un node és duplicat NOMÉS si codi I nom coincideixen alhora.
    // Nivells 1-3: codi únic a BD → upsert si el codi existeix però nom diferent; ometre si codi+nom iguals.
    // Nivell 4: permet múltiples entrades amb el mateix codi si el nom és diferent.
    //           Si codi+nom ja existeixen → és un duplicat real → sufix _2, _3...
    const seenCodeName = new Set(nodes.map((n) => `${n.code}||${n.name}`));
    const dupCounters = new Map<string, number>();

    const resolveCode = (code: string, name: string): { finalCode: string; isDup: boolean } => {
      const key = `${code}||${name}`;
      const codeDup = seenCodes.has(code);
      const exactDup = seenCodeName.has(key);

      if (!codeDup) return { finalCode: code, isDup: false };
      if (codeLevel(code) < 4) {
        // Nivells 1-3: codi existeix → upsert (actualitza nom). No és duplicat si nom diferent.
        return { finalCode: code, isDup: exactDup };
      }
      // Nivell 4: codi existeix
      if (!exactDup) return { finalCode: code, isDup: false }; // mateix codi, nom diferent → ok, insereix
      // Codi + nom iguals → duplicat real → sufix
      const base = code;
      const count = (dupCounters.get(base) ?? 1) + 1;
      dupCounters.set(base, count);
      let candidate = `${base}_${count}`;
      while (seenCodes.has(candidate)) {
        dupCounters.set(base, ++dupCounters.get(base)!);
        candidate = `${base}_${dupCounters.get(base)}`;
      }
      return { finalCode: candidate, isDup: true };
    };

    const toUpsert: GubimNode[] = []; // nivells 1-3
    const toInsert: GubimNode[] = []; // nivell 4
    let duplicates = 0;
    let remaining = candidates;
    let prevLength = -1;

    // Pas 1: ordenació topològica
    while (remaining.length > 0 && remaining.length !== prevLength) {
      prevLength = remaining.length;
      const nextRemaining: typeof remaining = [];
      for (const n of remaining) {
        const p = parentCode(n.code);
        if (!p || seenCodes.has(p)) {
          const { finalCode, isDup } = resolveCode(n.code, n.name);
          if (isDup) duplicates++;
          const row = toRow({ ...n, code: finalCode });
          if (codeLevel(n.code) < 4) { toUpsert.push(row); } else { toInsert.push(row); }
          seenCodes.add(finalCode);
          seenCodeName.add(`${finalCode}||${n.name}`);
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
        toUpsert.push(toRow(anc));
        seenCodes.add(anc.code);
        seenCodeName.add(`${anc.code}||${anc.name}`);
        autoCreated++;
      }
      const { finalCode, isDup } = resolveCode(n.code, n.name);
      if (isDup) duplicates++;
      const row = toRow({ ...n, code: finalCode });
      if (codeLevel(n.code) < 4) { toUpsert.push(row); } else { toInsert.push(row); }
      seenCodes.add(finalCode);
      seenCodeName.add(`${finalCode}||${n.name}`);
    }

    const BATCH = 50;
    for (let i = 0; i < toUpsert.length; i += BATCH) {
      const batch = toUpsert.slice(i, i + BATCH);
      const { error } = await supabase.from("gubim_class").upsert(batch, { onConflict: "code" });
      if (error) throw new Error(error.message);
    }
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
        const brandNew = allNew.filter((n) => !existingCodes.has(n.code) || codeLevel(n.code) === 4);
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
