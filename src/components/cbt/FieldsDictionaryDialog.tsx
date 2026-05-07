import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Plus, Trash2, Upload, Pencil } from "lucide-react";
import { FieldMeta, isClassifier } from "@/lib/fields";
import { useFields } from "@/hooks/useFields";
import { useEquipments } from "@/hooks/useEquipments";
import { AddFieldDialog } from "./AddFieldDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (b: boolean) => void; }

function filterWithClassifiers(fields: FieldMeta[], q: string, grp: string, cls: string): FieldMeta[] {
  const t = q.trim().toLowerCase();
  const result: FieldMeta[] = [];
  let currentClassifier: FieldMeta | null = null;
  let classifierAdded = false;
  let currentChildren: FieldMeta[] = [];

  const flushChildren = () => {
    result.push(...currentChildren);
    currentChildren = [];
  };

  for (const f of fields) {
    if (isClassifier(f)) {
      flushChildren();
      currentClassifier = f; classifierAdded = false; continue;
    }
    if (grp !== "__all__" && f.agrupacio_revit !== grp) continue;
    if (cls !== "__all__" && currentClassifier?.col !== cls) continue;
    if (t && !(
      (f.col ?? "").toLowerCase().includes(t) ||
      (f.codi ?? "").toLowerCase().includes(t) ||
      (f.cbt ?? "").toLowerCase().includes(t)
    )) continue;
    if (currentClassifier && !classifierAdded) { result.push(currentClassifier); classifierAdded = true; }
    currentChildren.push(f);
  }
  flushChildren();
  return result;
}

export function FieldsDictionaryDialog({ open, onOpenChange }: Props) {
  const { fields, addField, addMany, updateField, removeField, isCustom, exists, clearAll, groups, disciplines } = useFields();
  const { removeFieldColFromAll } = useEquipments();
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState("__all__");
  const [cls, setCls] = useState("__all__");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FieldMeta | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const classifiers = useMemo(() => fields.filter(isClassifier), [fields]);
  const filtered    = useMemo(() => filterWithClassifiers(fields, q, grp, cls), [fields, q, grp, cls]);

  const exportXlsx = () => {
    const rows = fields.filter(f => !isClassifier(f)).map((f) => ({
      "Nom":              f.col,
      "Codi":             f.codi            ?? "",
      "Taula associada":  f.taula_assoc     ?? "",
      "Tipus dada":       f.tipus_dada      ?? "",
      "CBT":              f.cbt             ?? "",
      "Format paràmetre": f.format_param    ?? "",
      "Agrupació Revit":  f.agrupacio_revit ?? "",
      "Grup .txt":        f.grup_txt        ?? "",
      "Instància Revit":  f.instancia_revit ?? "",
      "Disciplina":       f.disciplina      ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Camps");
    XLSX.writeFile(wb, "diccionari_camps.xlsx");
    toast.success("Camps exportats");
  };

  const importXlsx = async (file: File) => {
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);

      const existingCols = new Set(fields.map((f) => f.col));
      const seenCols     = new Set<string>();

      const toAdd: FieldMeta[] = rows.map((r) => {
        const nom        = String(r["Nom"]              ?? "").trim().toUpperCase();
        const codi       = String(r["Codi"]             ?? "").trim() || null;
        const taulaAssoc = String(r["Taula associada"]  ?? "").trim() || null;
        const tipusDada  = String(r["Tipus dada"]       ?? "").trim() || null;
        const cbt        = String(r["CBT"]              ?? "").trim() || null;
        const formatP    = String(r["Format paràmetre"] ?? "").trim() || null;
        const agrupRevit = String(r["Agrupació Revit"]  ?? "").trim() || null;
        const grupTxt    = String(r["Grup .txt"]        ?? "").trim() || null;
        const instancia  = String(r["Instància Revit"]  ?? "").trim() || null;
        const disciplina = String(r["Disciplina"]       ?? "").trim() || null;

        if (!nom) return null;
        if (existingCols.has(nom) || seenCols.has(nom)) return null;
        seenCols.add(nom);

        return {
          col:             nom,
          codi,
          taula_assoc:     taulaAssoc,
          tipus_dada:      tipusDada,
          cbt,
          format_param:    formatP,
          agrupacio_revit: agrupRevit,
          grup_txt:        grupTxt,
          instancia_revit: instancia,
          disciplina,
        } as FieldMeta;
      }).filter(Boolean) as FieldMeta[];

      const { inserted, duplicates } = await addMany(toAdd);
      if (inserted > 0) toast.success(`${inserted} camps inserits` + (duplicates > 0 ? ` · ${duplicates} duplicats omesos` : ""));
      else toast.warning("Cap camp nou per importar");
    } catch (e: any) {
      toast.error(`Error en importar: ${e?.message ?? "error desconegut"}`);
    }
  };

  const handleDeleteField = async (col: string) => {
    try {
      await removeField(col);
      await removeFieldColFromAll(col);
      toast.success("Camp esborrat i referències eliminades");
    } catch { toast.error("Error esborrant camp"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>Diccionari de camps</DialogTitle></DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input placeholder="Cerca per nom, codi o CBT…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={grp} onValueChange={setGrp}>
            <SelectTrigger><SelectValue placeholder="Agrupació Revit" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Totes les agrupacions</SelectItem>
              {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger><SelectValue placeholder="Classificador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tots els classificadors</SelectItem>
              {classifiers.map((c) => <SelectItem key={c.col} value={c.col}>{c.col}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportXlsx}><Download className="h-4 w-4 mr-1" /> Exporta Excel</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> Importa Excel</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.currentTarget.value = ""; }} />
          <Button size="sm" onClick={() => { setEditing(null); setAddOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Nou camp</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" /> Esborra tots</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Esborrar tots els camps?</AlertDialogTitle>
                <AlertDialogDescription>S'eliminaran tots els camps del diccionari. Aquesta acció no es pot desfer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                <AlertDialogAction onClick={async () => { try { await clearAll(); toast.success("Tots els camps eliminats"); } catch { toast.error("Error esborrant camps"); } }}>Esborra</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="border rounded-md flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-background sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="text-left">
                <th className="p-2 font-semibold text-xs">Nom</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8] border-l-2 border-[#0099A8]/30">CBT</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Format par.</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Agrupació Revit</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Grup .txt</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Instància Revit</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Disciplina</th>
                <th className="p-2 font-semibold text-xs text-violet-600 border-l-2 border-violet-200">Codi</th>
                <th className="p-2 font-semibold text-xs text-violet-600">Taula assoc.</th>
                <th className="p-2 font-semibold text-xs text-violet-600">Tipus dada</th>
                <th className="p-2 w-20 font-semibold text-xs">Accions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const c = isClassifier(f);
                return (
                  <tr key={f.col} className={cn("border-t", c && "bg-accent/30 font-semibold")}>
                    <td className="p-2">
                      <div>{f.col}</div>
                      {c && <Badge variant="outline" className="mt-0.5 text-[10px] uppercase tracking-wide">Classificador</Badge>}
                    </td>
                    <td className="p-2 font-mono text-xs text-muted-foreground border-l-2 border-[#0099A8]/20">{f.cbt ?? "—"}</td>
                    <td className="p-2 text-xs">{f.format_param ?? "—"}</td>
                    <td className="p-2 text-xs">{f.agrupacio_revit ?? "—"}</td>
                    <td className="p-2 text-xs">{f.grup_txt ?? "—"}</td>
                    <td className="p-2 text-xs font-mono">{c ? "—" : (f.instancia_revit ?? "—")}</td>
                    <td className="p-2 text-xs">{f.disciplina ?? "—"}</td>
                    <td className="p-2 font-mono text-xs border-l-2 border-violet-100">{c ? "—" : (f.codi ?? "—")}</td>
                    <td className="p-2 text-xs">{f.taula_assoc ?? "—"}</td>
                    <td className="p-2 text-xs">{f.tipus_dada ?? "—"}</td>
                    <td className="p-2">
                      {isCustom(f.col) && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(f); setAddOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Esborrar camp?</AlertDialogTitle>
                                <AlertDialogDescription>S'eliminarà «{f.col}» i les seves referències en equips.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteField(f.col)}>Esborra</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Cap camp al diccionari. Crea un camp nou o importa un Excel.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <AddFieldDialog
          open={addOpen} onOpenChange={setAddOpen} groups={groups} disciplines={disciplines}
          editing={editing} existsCol={exists}
          onSubmit={async (f) => {
            try {
              if (editing) { await updateField(editing.col, f); toast.success("Camp actualitzat"); }
              else { await addField(f); toast.success("Camp creat"); }
            } catch (e: any) { toast.error(e.message ?? "Error"); }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
