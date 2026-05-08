/**
 * useEquipments — wrapper de compatibilitat sobre DataStore centralitzat.
 * Mantenim l'API pública idèntica perquè cap component s'hagi de modificar.
 */
import { useDataStore } from "@/lib/dataStore";

export type Equipment = {
  id:              string;
  gubimCode:       string;
  equipCode:       string;
  equipName:       string;
  needsTable:      boolean;
  tableCode:       string;
  tableName:       string;
  fieldCols:       string[];
  parentEquipCode: string;
  createdAt:       number;
};

export function useEquipments() {
  const ds = useDataStore();
  return {
    items:                ds.equipments,
    loading:              ds.loading,
    error:                ds.error,
    retry:                ds.retry,
    upsert:               ds.upsertEquip,
    remove:               ds.removeEquip,
    addMany:              ds.addManyEquips,
    clearAll:             ds.clearEquips,
    isCodeTaken:          ds.isEquipCodeTaken,
    removeFieldColFromAll:ds.removeFieldColFromAll,
  };
}
