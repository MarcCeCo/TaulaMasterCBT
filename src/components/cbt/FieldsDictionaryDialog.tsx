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
    // Ordena: primer els sense codi, després per codi alfabètic
    currentChildren.sort((a, b) => {
      const ca = a.code ?? "";
      const cb = b.code ?? "";
      if (!ca && cb) return -1;
      if (ca && !cb) return 1;
      return ca.localeCompare(cb);
    });
    result.push(...currentChildren);
    currentChildren = [];
  };

  for (const f of fields) {
    if (isClassifier(f)) {
      flushChildren();
      currentClassifier = f; classifierAdded = false; continue;
    }
    if (grp !== "__all__" && f.group !== grp) continue;
    if (cls !== "__all__" && currentClassifier?.name !== cls) continue;
    if (t && !((f.code ?? "").toLowerCase().includes(t) || (f.name ?? "").toLowerCase().includes(t) || (f.cbt_name ?? "").toLowerCase().includes(t))) continue;
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
  const filtered = useMemo(() => filterWithClassifiers(fields, q, grp, cls), [fields, q, grp, cls]);

  const exportXlsx = () => {
    const rows = fields.filter(f => !isClassifier(f)).map((f) => ({
      Nom: f.name ?? "",
      Codi: f.code ?? "",
      "Taula associada": f.taulaAssoc ?? "",
      "Tipus dada": f.category ?? "",
      CBT: f.cbt_name ?? "",
      "Format paràmetre": f.type ?? "",
      "Agrupació Revit": f.group ?? "",
      "Grup .txt": f.unit ?? "",
      "Instància Revit": f.active,
      Disciplina: f.discipline ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Camps");
    XLSX.writeFile(wb, "diccionari_camps.xlsx");
    toast.success("Camps exportats");
  };

  const importXlsx = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);

      // col = Codi (clau interna). Si no hi ha Codi, el camp no es pot importar.
      const existingCols  = new Set(fields.map((f) => f.col));
      const existingNames = new Set(fields.map((f) => f.name).filter(Boolean) as string[]);
      const seenCols      = new Set<string>(); // codis ja processats en aquest Excel
      const seenNames     = new Set<string>(); // noms ja processats en aquest Excel

      const toAdd: FieldMeta[] = rows.map((r, i) => {
        const nom        = String(r["Nom"] ?? "").trim();
        const codi       = String(r["Codi"] ?? "").trim().toUpperCase();
        const cbt        = String(r["CBT"] ?? "").trim();
        const format     = String(r["Format paràmetre"] ?? "").trim();
        const agrupRevit = String(r["Agrupació Revit"] ?? r["Agrupació CBT"] ?? "").trim();
        const grupTxt    = String(r["Grup .txt"] ?? "").trim();
        const instancia  = String(r["Instància Revit"] ?? "Y").trim();
        const disciplina = String(r["Disciplina"] ?? "").trim();
        const taulaAssoc = String(r["Taula associada"] ?? "").trim();
        const tipusDada  = String(r["Tipus dada"] ?? "").trim();

        // Fila classificadora: nom present, resta de camps buits
        const isClsRow = nom && !codi && !cbt && !format && !agrupRevit && !disciplina;
        if (isClsRow) {
          const genCol = "CLS_" + nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 10);
          const isDup  = existingCols.has(genCol) || seenCols.has(genCol) || existingNames.has(nom) || seenNames.has(nom);
          seenCols.add(genCol);
          seenNames.add(nom);
          return {
            col: genCol,
            name: isDup ? nom + " (duplicat)" : nom,
            cbt_name: null, type: null, unit: null, code: null, category: null,
            group: null, active: "Y" as const, discipline: null, taulaAssoc: null,
            order: Date.now() + i, scope: "global",
          };
        }

        // Camp normal: Nom obligatori. Codi és opcional.
        if (!nom) return null;

        // Si no hi ha codi, generem una clau interna basada en el nom
        const colKey = codi || ("CAMP_" + nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 16) + "_" + String(Date.now() + i).slice(-4));

        // Duplicat si el codi (o colKey) O el nom ja existeixen (a la BD o en aquest Excel)
        const isDup = existingCols.has(colKey) || seenCols.has(colKey) || existingNames.has(nom) || seenNames.has(nom);
        seenCols.add(colKey);
        seenNames.add(nom);

        return {
          col:      colKey,
          name:     isDup ? nom + " (duplicat)" : nom,
          cbt_name: cbt || null, type: format || null, unit: grupTxt || null,
          code:     codi || null, category: tipusDada || null, group: agrupRevit || null,
          active:   (instancia === "N" ? "N" : "Y") as "Y" | "N",
          discipline: disciplina || null, taulaAssoc: taulaAssoc || null,
          order: Date.now() + i, scope: "global",
        };
      }).filter(Boolean) as FieldMeta[];

      const { inserted, duplicates } = await addMany(toAdd);
      const parts: string[] = [];
      if (inserted > 0) parts.push(`${inserted} camps inserits`);
      if (duplicates > 0) parts.push(`${duplicates} duplicats marcats amb "(duplicat)"`);
      if (inserted > 0) toast.success(parts.join(" · "));
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
          <Input placeholder="Cerca per codi, nom o CBT…" value={q} onChange={(e) => setQ(e.target.value)} />
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
              {classifiers.map((c) => <SelectItem key={c.col} value={c.name ?? c.col}>{c.name}</SelectItem>)}
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

        {/* Llegenda */}
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-[#0099A8]" /><span className="text-[#0099A8] font-medium">Revit (.txt)</span></span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full bg-violet-400" /><span className="text-violet-600 font-medium">Rosmiman</span></span>
        </div>

        <div className="border rounded-md flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-background sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="text-left">
                <th className="p-2 font-semibold text-xs">Nom</th>
                {/* Revit */}
                <th className="p-2 font-semibold text-xs text-[#0099A8] border-l-2 border-[#0099A8]/30">CBT</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Format par.</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Disciplina</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Instància</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Agrupació Revit</th>
                <th className="p-2 font-semibold text-xs text-[#0099A8]">Grup .txt</th>
                {/* Rosmiman */}
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
                      <div>{f.name}</div>
                      {c && <Badge variant="outline" className="mt-0.5 text-[10px] uppercase tracking-wide">Classificador</Badge>}
                    </td>
                    {/* Revit */}
                    <td className="p-2 font-mono text-xs text-muted-foreground border-l-2 border-[#0099A8]/20">{f.cbt_name ?? "—"}</td>
                    <td className="p-2 text-xs">{f.type ?? "—"}</td>
                    <td className="p-2 text-xs">{f.discipline ?? "—"}</td>
                    <td className="p-2 text-xs font-mono">{c ? "—" : f.active}</td>
                    <td className="p-2 text-xs">{f.group ?? "—"}</td>
                    <td className="p-2 text-xs">{f.unit ?? "—"}</td>
                    {/* Rosmiman */}
                    <td className="p-2 font-mono text-xs border-l-2 border-violet-100">{c ? "—" : (f.code ?? "—")}</td>
                    <td className="p-2 text-xs">{f.taulaAssoc ?? "—"}</td>
                    <td className="p-2 text-xs">{f.category ?? "—"}</td>
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
                                <AlertDialogDescription>S'eliminarà «{f.name}» i les seves referències en equips.</AlertDialogDescription>
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
