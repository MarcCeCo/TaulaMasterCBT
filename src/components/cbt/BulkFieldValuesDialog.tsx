// src/components/cbt/BulkFieldValuesDialog.tsx
// Permet editar els valors dels camps de múltiples tags amb el mateix codi d'equip
// alhora. Mostra la llista de tags seleccionats, i un formulari amb tots els camps
// de l'equip. En guardar, aplica els valors a tots els tags seleccionats.

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Save, X, Users, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Equipment } from "@/hooks/useEquipments";
import { FieldMeta, isClassifier } from "@/lib/fields";
import { ProjectTag } from "@/lib/useProjectes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  equipment: Equipment | null;
  fields: FieldMeta[];
  tags: ProjectTag[];           // tots els tags del projecte amb aquest equipId
  onSave: (updates: { tagId: string; values: Record<string, string> }[]) => Promise<void>;
}

export function BulkFieldValuesDialog({
  open, onOpenChange, equipment, fields, tags, onSave,
}: Props) {
  // Tags seleccionats (per defecte tots els validats)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Valors dels camps (compartits, s'apliquen a tots els seleccionats)
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showTags, setShowTags] = useState(true);

  // Inicialitzar quan s'obre
  const handleOpenChange = (b: boolean) => {
    if (b) {
      // Pre-seleccionar tots els tags validats; si cap, tots
      const validats = tags.filter(t => t.status === "validat");
      const inicial = validats.length > 0 ? validats : tags;
      setSelectedIds(new Set(inicial.map(t => t.id)));
      // Valors inicials: si tots els seleccionats coincideixen en un camp, mostrar-lo
      const mergedValues: Record<string, string> = {};
      setValues(mergedValues);
      setShowTags(true);
    }
    onOpenChange(b);
  };

  // Construir les files de la taula de camps (igual que ProjecteEquipDetailDialog)
  const tableRows = useMemo(() => {
    if (!equipment) return [];
    const assignedCols = new Set(equipment.fieldCols);
    const rows: { classifier?: true; field?: FieldMeta; classifierName?: string }[] = [];
    let currentClassifier: string | null = null;
    let classifierAdded = false;
    for (const f of fields) {
      if (isClassifier(f)) {
        currentClassifier = f.col;
        classifierAdded = false;
        continue;
      }
      if (!assignedCols.has(f.col)) continue;
      if (!f.codi) continue;
      if (currentClassifier && !classifierAdded) {
        rows.push({ classifier: true, classifierName: currentClassifier });
        classifierAdded = true;
      }
      rows.push({ field: f });
    }
    // Camps orfes (no al diccionari)
    const dictCols = new Set(fields.map(f => f.col));
    const orphans = equipment.fieldCols.filter(c => !dictCols.has(c));
    if (orphans.length > 0) {
      rows.push({ classifier: true, classifierName: "⚠ Camps no trobats al diccionari" });
      for (const col of orphans) rows.push({ field: { col, codi: null, taula_assoc: null, tipus_dada: null, cbt: null, format_param: null, agrupacio_revit: null, grup_txt: null, instancia_revit: null, disciplina: null, classificador: null } });
    }
    return rows;
  }, [equipment, fields]);

  const fieldCount = tableRows.filter(r => r.field).length;

  function toggleTag(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === tags.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(tags.map(t => t.id)));
  }

  async function handleSave() {
    if (selectedIds.size === 0) {
      toast.error("Selecciona almenys un tag per aplicar els valors.");
      return;
    }
    setSaving(true);
    try {
      const updates = [...selectedIds].map(tagId => {
        const existing = tags.find(t => t.id === tagId)?.fieldValues ?? {};
        // Merge: mantenim els valors existents, sobreescrivim amb els nous
        const merged = { ...existing };
        for (const [col, val] of Object.entries(values)) {
          if (val !== "") merged[col] = val; // Només apliquem camps que l'usuari ha omplert
        }
        return { tagId, values: merged };
      });
      await onSave(updates);
      toast.success(`Valors aplicats a ${selectedIds.size} tag${selectedIds.size !== 1 ? "s" : ""} ✓`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error en guardar els valors.");
    } finally {
      setSaving(false);
    }
  }

  if (!equipment) return null;

  const hasValues = Object.values(values).some(v => v !== "");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">

        {/* Capçalera */}
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium flex items-center gap-1.5">
                <Users className="h-3 w-3" /> Edició massiva · {equipment.equipCode}
              </p>
              <DialogTitle className="text-base font-semibold">{equipment.equipName}</DialogTitle>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="secondary" className="text-xs font-mono">
                {selectedIds.size}/{tags.length} tags
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {fieldCount} camp{fieldCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">

          {/* Secció: Tags seleccionats */}
          <div className="px-5 pt-3 shrink-0">
            <button
              type="button"
              className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-800 mb-2 w-full text-left"
              onClick={() => setShowTags(v => !v)}
            >
              {showTags ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Tags als quals s'aplicaran els valors
              <span className="ml-auto font-normal text-slate-400 text-[11px] mr-1">
                {showTags ? "Amaga" : "Mostra"}
              </span>
            </button>

            {showTags && (
              <div className="border rounded-md overflow-hidden mb-3">
                {/* Capçalera amb toggle-all */}
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b">
                  <Checkbox
                    id="bulk-toggle-all"
                    checked={selectedIds.size === tags.length && tags.length > 0}
                    onCheckedChange={toggleAll}
                    className="h-3.5 w-3.5"
                  />
                  <label htmlFor="bulk-toggle-all" className="text-xs font-medium text-slate-600 cursor-pointer select-none">
                    Seleccionar tots ({tags.length})
                  </label>
                </div>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100">
                  {tags.map(tag => (
                    <label
                      key={tag.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors",
                        selectedIds.has(tag.id) ? "bg-[#0099A8]/5" : ""
                      )}
                    >
                      <Checkbox
                        checked={selectedIds.has(tag.id)}
                        onCheckedChange={() => toggleTag(tag.id)}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700 shrink-0">
                        {tag.tagComplet}
                      </span>
                      {tag.status === "validat" && (
                        <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">Validat</span>
                      )}
                      {tag.status === "rebutjat" && (
                        <span className="text-[10px] text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded shrink-0">Rebutjat</span>
                      )}
                      {tag.status === "pendent" && (
                        <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Pendent</span>
                      )}
                      {tag.descripcioEquip && (
                        <span className="text-xs text-slate-400 truncate">{tag.descripcioEquip}</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Banner informatiu */}
            <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700 mb-3 shrink-0">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Omple els camps que vols aplicar. Els camps buits <strong>no sobreescriuran</strong> valors existents.
                S'aplicarà als <strong>{selectedIds.size} tag{selectedIds.size !== 1 ? "s" : ""} seleccionats</strong>.
              </span>
            </div>
          </div>

          {/* Taula de camps */}
          <div className="px-5 pb-1 flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="border rounded-md flex-1 overflow-hidden flex flex-col min-h-0">
              {!equipment.needsTable || equipment.fieldCols.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                  {!equipment.needsTable
                    ? "Aquest equip no té taula de propietats assignada."
                    : "Cap camp assignat a la taula."}
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-white border-b shadow-sm">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-xs text-slate-600">Paràmetre</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-xs text-[#0099A8] border-l-2 border-[#0099A8]/20 min-w-[200px]">
                          Valor (s'aplica a tots els tags seleccionats)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, i) => {
                        if (row.classifier) {
                          return (
                            <tr key={`cls-${i}`} className="bg-accent/30 border-t-2 border-muted font-semibold">
                              <td colSpan={2} className="px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                                {row.classifierName}
                              </td>
                            </tr>
                          );
                        }
                        const f = row.field!;
                        const val = values[f.col] ?? "";
                        return (
                          <tr key={f.col} className="border-t hover:bg-muted/30 align-middle">
                            <td className="px-4 py-2 font-medium text-xs break-words">{f.col}</td>
                            <td className="px-4 py-1.5 border-l-2 border-[#0099A8]/10">
                              <Input
                                value={val}
                                onChange={e => setValues(prev => ({ ...prev, [f.col]: e.target.value }))}
                                placeholder="Deixa buit per no modificar..."
                                className="h-7 text-xs font-mono border-slate-200 focus:border-[#0099A8] placeholder:text-slate-300"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Peu */}
        <DialogFooter className="px-5 py-3 border-t shrink-0 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {hasValues
              ? `Aplicarà valors a ${selectedIds.size} tag${selectedIds.size !== 1 ? "s" : ""}`
              : "Cap valor introduït"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel·la
            </Button>
            <Button
              size="sm"
              className="bg-[#0099A8] hover:bg-[#006E7A] text-white gap-1.5"
              onClick={handleSave}
              disabled={saving || selectedIds.size === 0 || !hasValues}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Guardant..." : `Aplica a ${selectedIds.size} tag${selectedIds.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
