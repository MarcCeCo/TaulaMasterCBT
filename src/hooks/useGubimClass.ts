import { useCallback, useMemo } from "react";
import { useDebouncedLocalStorage, uid } from "@/lib/storage";

export type GubimNode = { id: string; code: string; name: string };

const KEY = "cbt.gubimClass.v1";

export const isValidCode = (code: string) => /^(\d{2})(\.(\d{2})){0,3}$/.test(code);
export const codeLevel = (code: string) => code.split(".").length as 1 | 2 | 3 | 4;
export const parentCode = (code: string) => {
  const parts = code.split(".");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
};

const SEED: GubimNode[] = [
  { id: uid(), code: "30", name: "Instal·lacions" },
  { id: uid(), code: "30.50", name: "Climatització" },
  { id: uid(), code: "30.50.10", name: "Producció de fred i calor" },
  { id: uid(), code: "30.50.10.10", name: "Refredadores" },
  { id: uid(), code: "30.50.10.20", name: "Bombes de calor" },
  { id: uid(), code: "30.50.20", name: "Distribució i moviment d'aire" },
  { id: uid(), code: "30.50.20.10", name: "Ventiladors" },
];

export function useGubimClass() {
  const [nodes, setNodes] = useDebouncedLocalStorage<GubimNode[]>(KEY, SEED);

  const sorted = useMemo(() => [...nodes].sort((a, b) => a.code.localeCompare(b.code)), [nodes]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, GubimNode>();
    sorted.forEach((n) => m.set(n.code, n));
    return m;
  }, [sorted]);

  const exists = useCallback((code: string) => nodeMap.has(code), [nodeMap]);
  const hasChildren = useCallback(
    (code: string) => sorted.some((n) => n.code !== code && n.code.startsWith(code + ".")),
    [sorted],
  );

  const addNode = useCallback(
    (n: Omit<GubimNode, "id">) => {
      if (!isValidCode(n.code)) throw new Error("Format de codi invàlid");
      const p = parentCode(n.code);
      if (p && !nodeMap.has(p)) throw new Error("El node pare no existeix");
      if (nodeMap.has(n.code)) throw new Error("El codi ja existeix");
      setNodes((prev) => [...prev, { ...n, id: uid() }]);
    },
    [nodeMap, setNodes],
  );

  // Multi-pass addMany per gestionar imports desordenats
  const addMany = useCallback(
    (arr: Omit<GubimNode, "id">[]) => {
      setNodes((prev) => {
        const seen = new Set(prev.map((p) => p.code));
        const out = [...prev];
        const candidates = arr
          .map((n) => ({ ...n, code: n.code.trim() }))
          .filter((n) => n.code && n.name && isValidCode(n.code) && !seen.has(n.code));
        let remaining = candidates;
        let prevLength = -1;
        while (remaining.length > 0 && remaining.length !== prevLength) {
          prevLength = remaining.length;
          const nextRemaining: typeof remaining = [];
          for (const n of remaining) {
            const p = parentCode(n.code);
            if (!p || seen.has(p)) {
              out.push({ ...n, id: uid() });
              seen.add(n.code);
            } else {
              nextRemaining.push(n);
            }
          }
          remaining = nextRemaining;
        }
        return out;
      });
    },
    [setNodes],
  );

  // Actualitza en cascada els fills quan canvia el codi d'un node
  const updateNode = useCallback(
    (id: string, patch: Partial<GubimNode>) => {
      setNodes((prev) => {
        const target = prev.find((n) => n.id === id);
        if (!target || !patch.code || patch.code === target.code) {
          return prev.map((n) => (n.id === id ? { ...n, ...patch } : n));
        }
        const oldCode = target.code;
        const newCode = patch.code;
        return prev.map((n) => {
          if (n.id === id) return { ...n, ...patch };
          if (n.code.startsWith(oldCode + ".")) {
            return { ...n, code: newCode + n.code.slice(oldCode.length) };
          }
          return n;
        });
      });
    },
    [setNodes],
  );

  const removeNode = useCallback((id: string) => setNodes((prev) => prev.filter((n) => n.id !== id)), [setNodes]);
  const clearAll = useCallback(() => setNodes([]), [setNodes]);

  return { nodes: sorted, nodeMap, addNode, addMany, updateNode, removeNode, exists, hasChildren, clearAll };
}
