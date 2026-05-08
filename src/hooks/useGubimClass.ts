/**
 * useGubimClass — wrapper de compatibilitat sobre DataStore centralitzat.
 */
import { useDataStore } from "@/lib/dataStore";

export type GubimNode = { id: string; code: string; name: string };

export const isValidCode = (code: string) => /^(\d{2})(\.(\d{2})){0,3}$/.test(code);
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
