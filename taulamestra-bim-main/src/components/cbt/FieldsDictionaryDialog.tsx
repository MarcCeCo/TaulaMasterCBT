import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  for (const f of fields) {
    if (isClassifier(f)) { currentClassifier = f; classifierAdded = false; continue; }
    if (grp !== "__all__" && f.group !== grp) continue;
    if (cls !== "__all__" && currentClassifier?.name !== cls) continue;
    if (t && !(f.col.toLowerCase().includes(t) || (f.name ?? "").toLowerCase().includes(t) || (f.cbt_name ?? "").toLowerCase().includes(t))) continue;
    if (currentClassifier && !classifierAdded) { result.push(currentClassifier); classifierAdded = true; }
    result.push(f);
  }
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
  const filtered = useMemo(() => filterWithClassifiers(fields, q, grp, cls), [fields, q, grp, cls]);

  const exportXlsx = () => {
    const rows = fields.filter(f => !isClassifier(f)).map((f) => ({
      Nom: f.name ?? "",
      "Taula associada": f.taulaAssoc ?? "",
      Codi: f.col,
      CBT: f.cbt_name ?? "",
      "Format paràmetre": f.type ?? "",
      "Agrupació de paràmetre": f.category ?? "",
      Grup: f.group ?? "",
      "Instància Revit": f.active,
      "Disciplina paràmetre": f.discipline ?? "",
      Unitat: f.unit ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Camps");
    XLSX.writeFile(wb, "diccionari_camps.xlsx");
    toast.success("Camps exportats");
  };

  // Import: si només el camp "Nom" té valor → classificador
  const importXlsx = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      const toAdd: FieldMeta[] = rows.map((r, i) => {
        const nom = String(r["Nom"] ?? "").trim();
        const codi = String(r["Codi"] ?? "").trim().toUpperCase();
        const cbt = String(r["CBT"] ?? "").trim();
        const format = String(r["Format paràmetre"] ?? r["Tipus"] ?? "").trim();
        const agrup = String(r["Agrupació de paràmetre"] ?? "").trim();
        const grup = String(r["Grup"] ?? "").trim();
        const instancia = String(r["Instància Revit"] ?? "Y").trim();
        const disciplina = String(r["Disciplina paràmetre"] ?? "").trim();
        const unitat = String(r["Unitat"] ?? "").trim();
        const taulaAssoc = String(r["Taula associada"] ?? "").trim();
        // Si només el nom té valor → classificador
        const isClsRow = nom && !codi && !cbt && !format && !agrup && !grup && !disciplina;
        if (isClsRow) {
          const genCol = "CLS_" + nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 10);
          if (exists(genCol)) return null;
          return { col: genCol, name: nom, cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y" as const, discipline: null, taulaAssoc: null, order: Date.now() + i, scope: "global" };
        }
        if (!codi || exists(codi)) return null;
        return { col: codi, name: nom || null, cbt_name: cbt || null, type: format || null, unit: unitat || null, code: codi || null, category: agrup || null, group: grup || null, active: (instancia === "N" ? "N" : "Y") as "Y" | "N", discipline: disciplina || null, taulaAssoc: taulaAssoc || null, order: Date.now() + i, scope: "global" };
      }).filter(Boolean) as FieldMeta[];
      addMany(toAdd);
      toast.success(`${toAdd.length} camps importats`);
    } catch { toast.error("Error en importar"); }
  };

  const toggleActive = (f: FieldMeta) => {
    updateField(f.col, { active: f.active === "Y" ? "N" : "Y" });
    toast.success(`Camp ${f.col} ${f.active === "Y" ? "desactivat" : "activat"}`);
  };

  const handleDeleteField = (col: string) => {
    removeField(col);
    removeFieldColFromAll(col);
    toast.success("Camp esborrat i referències eliminades");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>Diccionari de camps</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={grp} onValueChange={setGrp}>
            <SelectTrigger><SelectValue placeholder="Grup" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tots els grups</SelectItem>
              {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger><SelectValue placeholder="Classificador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tots els classificadors</SelectItem>
              {classifiers.map((c) => <SelectItem key={c.col} value={c.name ?? c.col}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportXlsx}><Download className="h-4 w-4" /> Exporta Excel</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importa Excel</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.currentTarget.value = ""; }} />
          <Button size="sm" onClick={() => { setEditing(null); setAddOpen(true); }}><Plus className="h-4 w-4" /> Nou camp</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button size="sm" variant="destructive"><Trash2 className="h-4 w-4" /> Esborra tots</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Esborrar tots els camps personalitzats?</AlertDialogTitle><AlertDialogDescription>Els camps base es conservaran.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel·la</AlertDialogCancel><AlertDialogAction onClick={() => { clearAll(); toast.success("Camps personalitzats esborrats"); }}>Esborra</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Llegenda */}
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-[#0099A8]" /><span className="text-[#0099A8] font-medium">Revit (.txt)</span></span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-violet-400" /><span className="text-violet-600 font-medium">Rosmiman</span></span>
        </div>

        <div className="border rounded-md flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0">
              <tr className="text-left">
                <th className="p-2 font-semibold text-xs">Codi</th>
                <th className="p-2 font-semibold text-xs">Nom</th>
                {/* Revit */}
                <th className="p-2 font-semibold text-xs text-[#0099A8] border-l-2 border-[#0099A8]/30">CBT</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Format paràmetre</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Disciplina</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Instància</th>
                {/* Rosmiman */}
                <th className="p-2 font-semibold text-xs text-violet-600 border-l-2 border-violet-200">Unitat</th>
                <th className="p-2 font-semibold text-xs text-violet-600">Agrupació</th>
                <th className="p-2 font-semibold text-xs text-violet-600">Grup</th>
                <th className="p-2 font-semibold text-xs text-violet-600">Taula assoc.</th>
                <th className="p-2 w-20 font-semibold text-xs">Accions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const c = isClassifier(f);
                return (
                  <tr key={f.col} className={cn("border-t", c && "bg-accent/30 font-semibold uppercase", !c && f.active === "N" && "opacity-50")}>
                    <td className="p-2 font-mono text-xs">{f.col}</td>
                    <td className="p-2">
                      {f.name}
                      {c && <Badge variant="outline" className="ml-2 text-[10px]">CLASSIFICADOR</Badge>}
                    </td>
                    <td className="p-2 font-mono text-xs text-muted-foreground border-l-2 border-[#0099A8]/20">{f.cbt_name ?? "—"}</td>
                    <td className="p-2 text-xs">{f.type ?? "—"}</td>
                    <td className="p-2 text-xs">{f.discipline ?? "—"}</td>
                    <td className="p-2 text-center">
                      {!c && isCustom(f.col) ? (
                        <Switch checked={f.active === "Y"} onCheckedChange={() => toggleActive(f)} className="scale-75" />
                      ) : <span className="text-xs text-muted-foreground">{c ? "—" : f.active}</span>}
                    </td>
                    <td className="p-2 text-xs border-l-2 border-violet-100">{f.unit ?? "—"}</td>
                    <td className="p-2 text-xs">{f.category ?? "—"}</td>
                    <td className="p-2 text-xs">{f.group ?? "—"}</td>
                    <td className="p-2 text-xs">{f.taulaAssoc ?? "—"}</td>
                    <td className="p-2">
                      {isCustom(f.col) && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(f); setAddOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Esborrar camp {f.col}?</AlertDialogTitle><AlertDialogDescription>Les referències en equips també s'eliminaran.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel·la</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteField(f.col)}>Esborra</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <AddFieldDialog
          open={addOpen} onOpenChange={setAddOpen} groups={groups} disciplines={disciplines}
          editing={editing} existsCol={exists}
          onSubmit={(f) => {
            try {
              if (editing) { updateField(editing.col, f); toast.success("Camp actualitzat"); }
              else { addField(f); toast.success("Camp creat"); }
            } catch (e: any) { toast.error(e.message ?? "Error"); }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
