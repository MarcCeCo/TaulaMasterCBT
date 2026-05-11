/**
 * useGubimClass — wrapper de compatibilitat sobre DataStore centralitzat.
 */
import { useDataStore } from "@/lib/dataStore";

export type GubimNode = { id: string; code: string; name: string };

// Cada segment pot ser:
//   - "00"         → cas especial (category 00 de la classificació)
//   - 1–4 dígits   → sense zero inicial (ex: 10, 100, 1000)
// Màxim 4 nivells separats per punt.
// Vàlid:   00 · 00.10 · 10 · 10.20 · 50.100 · 90.40.10.390
// Invàlid: 0010 · 010 · 12345 · 10.20.30.40.50
export const isValidCode = (code: string): boolean =>
  /^(00|[1-9]\d{0,3})(\.(00|[1-9]\d{0,3})){0,3}$/.test(code);

export const codeLevel   = (code: string) => code.split(".").length as 1 | 2 | 3 | 4;
export const parentCode  = (code: string) => {
  const parts = code.split(".");
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
};

export function useGubimClass() {
  const ds = useDataStore();
  return {
    nodes:       ds.gubimNodes,
    nodeMap:     ds.gubimNodeMap,
    loading:     ds.loading,
    error:       ds.error,
    retry:       ds.retry,
    addNode:     ds.addGubimNode,
    addMany:     ds.addManyGubim,
    updateNode:  ds.updateGubimNode,
    removeNode:  ds.removeGubimNode,
    clearAll:    ds.clearGubim,
    exists:      ds.gubimExists,
    hasChildren: ds.gubimHasChildren,
  };
}
