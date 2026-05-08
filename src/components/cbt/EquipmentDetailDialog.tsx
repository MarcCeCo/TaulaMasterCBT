import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, X } from "lucide-react";
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
  // Construïm la llista amb classificadors intercalats
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

  // Afegir camps que no estaven al diccionari (orfes)
  const dictCols = new Set(fields.map((f) => f.col));
  const orphans = equipment.fieldCols.filter((c) => !dictCols.has(c));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        {/* Capçalera d'estil CBT */}
        <div className="bg-gradient-to-r from-[#006E7A] to-[#0099A8] text-white px-6 py-4 flex items-start justify-between rounded-t-lg">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs text-teal-200 uppercase tracking-widest font-medium">
              <span>Fitxa d'equip</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">{equipment.equipName}</h2>
            <div className="flex items-center gap-3 text-sm text-teal-100 mt-1 flex-wrap">
              {equipment.equipCode && (
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-xs">{equipment.equipCode}</span>
              )}
              {equipment.needsTable && equipment.tableCode && (
                <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-xs">{equipment.tableCode}</span>
              )}
              {node && (
                <span className="flex items-center gap-1.5">
                  <LevelBadge level={lvl as 1|2|3|4} />
                  <span className="font-mono text-xs">{equipment.gubimCode}</span>
                  <span className="text-teal-200">·</span>
                  <span>{node.name}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Button size="sm" variant="secondary" onClick={onEdit} className="bg-white/10 hover:bg-white/20 text-white border-0">
              <Pencil className="h-4 w-4" /> Edita
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Metadades ràpides */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b bg-muted/30">
          <div className="px-5 py-3 border-r">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Codi equip</div>
            <div className="font-mono font-semibold text-sm mt-0.5">{equipment.equipCode || <span className="text-muted-foreground italic text-xs">sense codi</span>}</div>
          </div>
          <div className="px-5 py-3 border-r">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Necessita taula</div>
            <div className="mt-0.5">
              {equipment.needsTable
                ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">Sí</Badge>
                : <Badge variant="secondary" className="text-xs">No</Badge>}
            </div>
          </div>
          <div className="px-5 py-3 border-r">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Nom taula</div>
            <div className="font-semibold text-sm mt-0.5 truncate">{equipment.tableName || "—"}</div>
          </div>
          <div className="px-5 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">GuBIMClass pare</div>
            <div className="text-sm mt-0.5 truncate text-muted-foreground">{parentNode ? `${parentNode.code} · ${parentNode.name}` : "—"}</div>
          </div>
        </div>

        {/* Taula de camps */}
        <div className="flex-1 overflow-auto">
          {!equipment.needsTable || equipment.fieldCols.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              {!equipment.needsTable ? "Aquest equip no té taula de propietats assignada." : "Cap camp assignat a la taula."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/60 sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Nom del paràmetre</th>
                  {/* Columnes Rosmiman */}
                  <th className="px-4 py-2 font-semibold text-xs text-violet-600 uppercase tracking-wide border-l-2 border-violet-200">Codi</th>
                  <th className="px-4 py-2 font-semibold text-xs text-violet-600 uppercase tracking-wide">Taula assoc.</th>
                  <th className="px-4 py-2 font-semibold text-xs text-violet-600 uppercase tracking-wide">Tipus dada</th>
                  {/* Columnes Revit (.txt) */}
                  <th className="px-4 py-2 font-semibold text-xs text-[#0099A8] uppercase tracking-wide border-l-2 border-[#0099A8]/30">Nom CBT</th>
                  <th className="px-4 py-2 font-semibold text-xs text-[#0099A8] uppercase tracking-wide">Format</th>
                  <th className="px-4 py-2 font-semibold text-xs text-[#0099A8] uppercase tracking-wide">Disciplina</th>
                  <th className="px-4 py-2 font-semibold text-xs text-[#0099A8] uppercase tracking-wide">Instància</th>
                  <th className="px-4 py-2 font-semibold text-xs text-[#0099A8] uppercase tracking-wide">Agrupació CBT</th>
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
                      Configuració paràmetre Revit (.txt)
                    </span>
                  </td>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => {
                  if (row.classifier) {
                    return (
                      <tr key={`cls-${i}`} className="bg-[#0099A8]/5 border-t-2 border-[#0099A8]/20">
                        <td colSpan={9} className="px-4 py-2 font-semibold text-xs uppercase tracking-widest text-[#006E7A]">
                          {row.classifierName}
                        </td>
                      </tr>
                    );
                  }
                  const f = row.field!;
                  return (
                    <tr key={f.col} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{f.col}</td>
                      {/* Rosmiman */}
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground border-l-2 border-violet-100">{f.codi ?? "—"}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{f.taula_assoc ?? "—"}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{f.tipus_dada ?? "—"}</td>
                      {/* Revit */}
                      <td className="px-4 py-2 font-mono text-xs text-[#006E7A] border-l-2 border-[#0099A8]/20">{f.cbt ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{f.format_param ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{f.disciplina ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{f.instancia_revit ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{f.agrupacio_revit ?? "—"}</td>
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
          )}
        </div>

        {/* Peu */}
        <div className="border-t px-6 py-3 flex items-center justify-between bg-muted/20 rounded-b-lg">
          <span className="text-xs text-muted-foreground">
            {equipment.fieldCols.length} camps assignats
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Tanca</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
