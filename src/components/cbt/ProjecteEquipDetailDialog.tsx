// src/components/cbt/ProjecteEquipDetailDialog.tsx
// Versió simplificada del detall d'equip per usar DINS DE PROJECTES:
//  - Sense columnes de configuració Rosmiman ni Revit
//  - Columna "Valor" editable quan el TAG associat és validat

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Save, X } from "lucide-react";
import { Equipment } from "@/hooks/useEquipments";
import { GubimNode, codeLevel, parentCode } from "@/hooks/useGubimClass";
import { FieldMeta, isClassifier } from "@/lib/fields";
import { LevelBadge } from "./LevelBadge";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  equipment: Equipment | null;
  nodeMap: Map<string, GubimNode>;
  fieldMap: Map<string, FieldMeta>;
  fields: FieldMeta[];
  onEdit: () => void;
  canEditEquip?: boolean;
  canEditValues?: boolean;
  fieldValues?: Record<string, string>;
  onSaveValues?: (values: Record<string, string>) => void;
  multiSelectCount?: number; // si > 0, estem en mode edició múltiple
}

export function ProjecteEquipDetailDialog({
  open, onOpenChange, equipment, nodeMap, fields, onEdit,
  canEditEquip = false, canEditValues = false, fieldValues = {}, onSaveValues,
  multiSelectCount,
}: Props) {
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const handleOpenChange = (b: boolean) => {
    if (b) { setEditingValues({ ...fieldValues }); setDirty(false); }
    onOpenChange(b);
  };

  if (!equipment) return null;

  const node = nodeMap.get(equipment.gubimCode);
  const lvl = node ? codeLevel(node.code) : 1;
  const pc = node ? parentCode(node.code) : null;
  const parentNode = pc ? nodeMap.get(pc) : null;

  const assignedCols = new Set(equipment.fieldCols);
  const tableRows: { classifier?: true; field?: FieldMeta; classifierName?: string }[] = [];
  let currentClassifier: string | null = null;
  let classifierAdded = false;

  for (const f of fields) {
    if (isClassifier(f)) {
      currentClassifier = f.col;
      classifierAdded = false;
      continue;
    }
    if (!assignedCols.has(f.col)) continue;
    // Només mostrar camps que tenen codi
    if (!f.codi) continue;
    if (currentClassifier && !classifierAdded) {
      tableRows.push({ classifier: true, classifierName: currentClassifier });
      classifierAdded = true;
    }
    tableRows.push({ field: f });
  }

  const dictCols = new Set(fields.map((f) => f.col));
  const orphans = equipment.fieldCols.filter((c) => !dictCols.has(c));

  function handleValueChange(col: string, val: string) {
    setEditingValues(prev => ({ ...prev, [col]: val }));
    setDirty(true);
  }

  function handleSave() {
    onSaveValues?.(editingValues);
    setDirty(false);
    toast.success("Valors dels camps guardats");
  }

  function handleDiscard() {
    setEditingValues({ ...fieldValues });
    setDirty(false);
  }

  const colSpanTotal = canEditValues ? 2 : 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-[1300px] w-full max-h-[90vh] overflow-hidden flex flex-col">

        {/* Capçalera */}
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                {multiSelectCount ? `Edició múltiple · ${multiSelectCount} tags seleccionats` : "Fitxa d'equip · Projecte"}
              </p>
              <DialogTitle className="text-base font-semibold">{equipment.equipName}</DialogTitle>
            </div>
            <div className="flex items-center gap-2 mr-8">
              {canEditValues && dirty && (
                <>
                  <Button size="sm" variant="ghost" onClick={handleDiscard} className="gap-1.5 text-slate-500">
                    <X className="h-3.5 w-3.5" /> Descartar
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave}>
                    <Save className="h-3.5 w-3.5" /> {multiSelectCount ? `Aplica als ${multiSelectCount} tags` : "Guardar valors"}
                  </Button>
                </>
              )}
              {!multiSelectCount && canEditEquip && (
                <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Edita equip
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Metadades */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border rounded-md bg-muted/30 shrink-0">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Codi equip</p>
            <p className="font-mono font-semibold text-sm">
              {equipment.equipCode || <span className="text-muted-foreground italic text-xs">sense codi</span>}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Necessita taula</p>
            <div>
              {equipment.needsTable
                ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">Sí</Badge>
                : <Badge variant="secondary" className="text-xs">No</Badge>}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Nom taula</p>
            <p className="font-semibold text-sm truncate">{equipment.tableName || "—"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">GuBIMClass</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {node ? (
                <>
                  <LevelBadge level={lvl as 1 | 2 | 3 | 4} />
                  <span className="font-mono text-xs text-muted-foreground">{equipment.gubimCode}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-sm truncate">{node.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </div>
          </div>
          {parentNode && (
            <div className="col-span-2 md:col-span-4 space-y-1 border-t pt-2 mt-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">GuBIMClass pare</p>
              <p className="text-sm text-muted-foreground">{parentNode.code} · {parentNode.name}</p>
            </div>
          )}
        </div>

        {/* Banner mode edició */}
        {canEditValues && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-700 shrink-0">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            {multiSelectCount
              ? <>Edició múltiple — omple els camps que vols aplicar als <strong>{multiSelectCount} tags</strong>. Els camps buits <strong>no sobreescriuran</strong> valors existents.</>
              : <>TAG validat — introdueix els valors dels camps a la columna <strong>Valor</strong>.</>
            }
            {dirty && <span className="ml-auto font-medium text-emerald-600">· Canvis sense guardar</span>}
          </div>
        )}

        {/* Taula de camps */}
        <div className="border rounded-md flex-1 overflow-hidden flex flex-col min-h-0">
          {!equipment.needsTable || equipment.fieldCols.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              {!equipment.needsTable
                ? "Aquest equip no té taula de propietats assignada."
                : "Cap camp assignat a la taula."}
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white border-b shadow-sm">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-semibold text-xs text-slate-600">Nom del paràmetre</th>
                    {canEditValues && (
                      <th className="px-4 py-2.5 font-semibold text-xs text-emerald-700 border-l-2 border-emerald-200 min-w-[180px]">
                        Valor
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, i) => {
                    if (row.classifier) {
                      return (
                        <tr key={`cls-${i}`} className="bg-accent/30 border-t-2 border-muted font-semibold">
                          <td colSpan={colSpanTotal} className="px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                            {row.classifierName}
                          </td>
                        </tr>
                      );
                    }
                    const f = row.field!;
                    const currentVal = editingValues[f.col] ?? fieldValues[f.col] ?? "";
                    return (
                      <tr key={f.col} className="border-t hover:bg-muted/30 align-middle">
                        <td className="px-4 py-2 font-medium break-words">{f.col}</td>
                        {canEditValues && (
                          <td className="px-4 py-1.5 border-l-2 border-emerald-100">
                            <Input
                              value={currentVal}
                              onChange={e => handleValueChange(f.col, e.target.value)}
                              placeholder="Introdueix valor..."
                              className="h-7 text-xs font-mono border-slate-200 focus:border-emerald-400"
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {orphans.length > 0 && (
                    <>
                      <tr className="bg-amber-50 border-t-2 border-amber-200">
                        <td colSpan={colSpanTotal} className="px-4 py-2 font-semibold text-xs uppercase tracking-widest text-amber-600">
                          ⚠ Camps no trobats al diccionari
                        </td>
                      </tr>
                      {orphans.map((col) => {
                        const currentVal = editingValues[col] ?? fieldValues[col] ?? "";
                        return (
                          <tr key={col} className="border-t bg-amber-50/50">
                            <td className="px-4 py-2 font-mono text-xs font-semibold text-amber-700">{col}</td>
                            {canEditValues && (
                              <td className="px-4 py-1.5 border-l-2 border-emerald-100">
                                <Input
                                  value={currentVal}
                                  onChange={e => handleValueChange(col, e.target.value)}
                                  placeholder="Introdueix valor..."
                                  className="h-7 text-xs font-mono border-slate-200 focus:border-emerald-400"
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Peu */}
        <div className="border-t pt-3 flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            {equipment.fieldCols.length} {equipment.fieldCols.length === 1 ? "camp assignat" : "camps assignats"}
          </span>
          <div className="flex gap-2">
            {canEditValues && dirty && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleSave}>
                <Save className="h-3.5 w-3.5" /> {multiSelectCount ? `Aplica als ${multiSelectCount} tags` : "Guardar valors"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>Tanca</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
