/**
 * useFields — wrapper de compatibilitat sobre DataStore centralitzat.
 */
import { useDataStore } from "@/lib/dataStore";
import type { FieldMeta } from "@/lib/fields";

export type { FieldMeta };

export function useFields() {
  const ds = useDataStore();
  return {
    fields:      ds.fields,
    fieldMap:    ds.fieldMap,
    loading:     ds.loading,
    error:       ds.error,
    retry:       ds.retry,
    addField:    ds.addField,
    addMany:     ds.addManyFields,
    updateField: ds.updateField,
    removeField: ds.removeField,
    clearAll:    ds.clearFields,
    exists:      ds.fieldExists,
    isCustom:    ds.isCustomField,
    groups:      ds.fieldGroups,
    disciplines: ds.fieldDisciplines,
  };
}
