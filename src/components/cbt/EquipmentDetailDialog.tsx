import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { Equipment } from "@/hooks/useEquipments";
import { GubimNode, codeLevel, parentCode } from "@/hooks/useGubimClass";
import { FieldMeta, isClassifier } from "@/lib/fields";
import { LevelBadge } from "./LevelBadge";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  equipment: Equipment | null;
  nodeMap: Map<string, GubimNode>;
  fieldMap: Map<string, FieldMeta>;
  fields: FieldMeta[];
  onEdit: () => void;
}

export function EquipmentDetailDialog({ open, onOpenChange, equipment, nodeMap, fieldMap, fields, onEdit }: Props) {
  if (!equipment) return null;

  const node = nodeMap.get(equipment.gubimCode);
  const lvl = node ? codeLevel(node.code) : 1;
  const pc = node ? parentCode(node.code) : null;
  const parentNode = pc ? nodeMap.get(pc) : null;

  // Camps assignats a aquest equip, en ordre de diccionari (preservant classificadors)
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
    if (currentClassifier && !classifierAdded) {
      tableRows.push({ classifier: true, classifierName: currentClassifier });
      classifierAdded = true;
    }
    tableRows.push({ field: f });
  }

  // Camps que no estaven al diccionari (orfes)
  const dictCols = new Set(fields.map((f) => f.col));
  const orphans = equipment.fieldCols.filter((c) => !dictCols.has(c));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Capçalera estàndard — igual que GubimClassManager i FieldsDictionaryDialog */}
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                Fitxa d'equip
              </p>
              <DialogTitle className="text-base font-semibold">
                {equipment.equipName}
              </DialogTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              className="mr-8 gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> Edita
            </Button>
          </div>
        </DialogHeader>

        {/* Metadades ràpides — mateix estil que el bloc de camps del EquipmentFormDialog */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 border rounded-md bg-muted/30">
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
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Categoria Revit</p>
            <p className="text-sm truncate">
              {equipment.revitCategory
                ? <Badge variant="outline" className="text-xs border-[#0099A8]/40 text-[#006E7A] bg-[#0099A8]/5">{equipment.revitCategory}</Badge>
                : <span className="text-muted-foreground italic text-xs">—</span>}
            </p>
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
          {equipment.needsTable && equipment.tableCode && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Codi taula</p>
              <p className="font-mono font-semibold text-sm">{equipment.tableCode}</p>
            </div>
          )}
        </div>

        {/* Taula de camps — mateix estil border/rounded que GubimClassManager i FieldsDictionaryDialog */}
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
                    <th className="px-4 py-2 font-semibold text-xs">Nom del paràmetre</th>
                    {/* Columnes Rosmiman */}
                    <th className="px-4 py-2 font-semibold text-xs text-violet-600 border-l-2 border-violet-200">Codi</th>
                    <th className="px-4 py-2 font-semibold text-xs text-violet-600">Taula assoc.</th>
                    <th className="px-4 py-2 font-semibold text-xs text-violet-600">Tipus dada</th>
                    {/* Columnes Revit (.txt) */}
                    <th className="px-4 py-2 font-semibold text-xs text-[#0099A8] border-l-2 border-[#0099A8]/30">Nom CBT</th>
                    <th className="px-4 py-2 font-semibold text-xs text-[#0099A8]">Format</th>
                    <th className="px-4 py-2 font-semibold text-xs text-[#0099A8]">Disciplina</th>
                    <th className="px-4 py-2 font-semibold text-xs text-[#0099A8]">Instància</th>
                    <th className="px-4 py-2 font-semibold text-xs text-[#0099A8]">Agrupació CBT</th>
                  </tr>
                  {/* Llegenda de colors */}
                  <tr className="bg-muted/30 border-t border-muted">
                    <td colSpan={1} />
                    <td colSpan={3} className="px-4 py-1 border-l-2 border-violet-200">
                      <span className="text-[10px] font-medium text-violet-600 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
                        Configuració camp Rosmiman
                      </span>
                    </td>
                    <td colSpan={5} className="px-4 py-1 border-l-2 border-[#0099A8]/30">
                      <span className="text-[10px] font-medium text-[#0099A8] flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#0099A8]" />
                        Configuració Revit
                      </span>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, i) => {
                    if (row.classifier) {
                      return (
                        <tr key={`cls-${i}`} className="bg-accent/30 border-t-2 border-muted font-semibold">
                          <td colSpan={9} className="px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                            {row.classifierName}
                          </td>
                        </tr>
                      );
                    }
                    const f = row.field!;
                    return (
                      <tr key={f.col} className="border-t hover:bg-muted/30 align-top">
                        <td className="px-4 py-2 font-medium break-words">{f.col}</td>
                        {/* Rosmiman */}
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground border-l-2 border-violet-100 break-words">{f.codi ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground break-words">{f.taula_assoc ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground break-words">{f.tipus_dada ?? "—"}</td>
                        {/* Revit */}
                        <td className="px-4 py-2 font-mono text-xs text-[#006E7A] border-l-2 border-[#0099A8]/20 break-words">{f.cbt ?? "—"}</td>
                        <td className="px-4 py-2 text-xs break-words">{f.format_param ?? "—"}</td>
                        <td className="px-4 py-2 text-xs break-words">{f.disciplina ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs break-words">{f.instancia_revit ?? "—"}</td>
                        <td className="px-4 py-2 text-xs break-words">{f.agrupacio_revit ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {orphans.length > 0 && (
                    <>
                      <tr className="bg-amber-50 border-t-2 border-amber-200">
                        <td colSpan={9} className="px-4 py-2 font-semibold text-xs uppercase tracking-widest text-amber-600">
                          ⚠ Camps no trobats al diccionari
                        </td>
                      </tr>
                      {orphans.map((col) => (
                        <tr key={col} className="border-t bg-amber-50/50">
                          <td className="px-4 py-2 font-mono text-xs font-semibold text-amber-700">{col}</td>
                          <td colSpan={8} className="px-4 py-2 text-xs text-amber-600 italic">Camp no trobat al diccionari</td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Peu — igual que EquipmentFormDialog (border-t pt-3 sense fons de color) */}
        <div className="border-t pt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {equipment.fieldCols.length} {equipment.fieldCols.length === 1 ? "camp assignat" : "camps assignats"}
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Tanca</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
