import { useMemo, useRef, useState, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";

// PERF: xlsx (≈750 KB) es carrega lazily només quan l'usuari fa export/import
// → no bloqueja el chunk inicial quan s'obre el pop-up Diccionari de camps
async function getXLSX() {
  const mod = await import("xlsx");
  return mod.default ?? mod;
}
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Plus, Trash2, Upload, Pencil } from "lucide-react";
import { FieldMeta, isClassifier, autoClassifierForCodi } from "@/lib/fields";
import { useFields } from "@/hooks/useFields";
import { useDataStore } from "@/lib/dataStore";
import { AddFieldDialog } from "./AddFieldDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Props {}

const ROW_H = 38;
const OVERSCAN = 8;
const CONTAINER_H = 560;

function filterWithClassifiers(fields: FieldMeta[], q: string, grp: string, cls: string): FieldMeta[] {
  const t = q.trim().toLowerCase();
  const result: FieldMeta[] = [];
  let currentClassifier: FieldMeta | null = null;
  let classifierAdded = false;
  let currentChildren: FieldMeta[] = [];

  const flush = () => { result.push(...currentChildren); currentChildren = []; };

  for (const f of fields) {
    if (isClassifier(f)) {
      flush();
      currentClassifier = f; classifierAdded = false; continue;
    }
    if (grp !== "__all__" && f.agrupacio_revit !== grp) continue;
    if (cls !== "__all__" && currentClassifier?.col !== cls) continue;
    if (t && !((f.col ?? "").toLowerCase().includes(t) || (f.codi ?? "").toLowerCase().includes(t) || (f.cbt ?? "").toLowerCase().includes(t))) continue;
    if (currentClassifier && !classifierAdded) { result.push(currentClassifier); classifierAdded = true; }
    currentChildren.push(f);
  }
  flush();
  return result;
}

export function FieldsDictionaryDialog(_props: Props = {}) {
  const { fields, addField, addMany, updateField, removeField, isCustom, exists, clearAll, groups, disciplines } = useFields();
  // PERF FIX: llegim removeFieldColFromAll del DataStore centralitzat en lloc de
  // subscriure un useEquipments() addicional — evita un re-render extra per cada mutació
  const { removeFieldColFromAll } = useDataStore();
  const { canEditView } = useAuth();
  const canEdit = canEditView("fields");
  const [q, setQ]             = useState("");
  const [grp, setGrp]         = useState("__all__");
  const [cls, setCls]         = useState("__all__");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FieldMeta | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset filtres quan es desmunta el component (al tancar el Dialog pare)
  useEffect(() => {
    return () => { setQ(""); setGrp("__all__"); setCls("__all__"); };
  }, []);

  const debouncedQ = useDebounce(q, 180);

  const classifiers = useMemo(() => fields.filter(isClassifier), [fields]);
  // L'ordenació correcta (sense codi primer, per codi numèric dins cada grup) la fa sortByClassification al dataStore
  const filtered    = useMemo(() => filterWithClassifiers(fields, debouncedQ, grp, cls), [fields, debouncedQ, grp, cls]);

  // Reset scroll when filters change
  useEffect(() => { setScrollTop(0); containerRef.current?.scrollTo(0, 0); }, [debouncedQ, grp, cls]);

  // Virtualització
  const startIdx   = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx     = Math.min(filtered.length - 1, Math.ceil((scrollTop + CONTAINER_H) / ROW_H) + OVERSCAN);
  const visibleRows = filtered.slice(startIdx, endIdx + 1);
  const padTop     = startIdx * ROW_H;
  const padBot     = Math.max(0, (filtered.length - endIdx - 1) * ROW_H);

  const exportXlsx = async () => {
    const XLSX = await getXLSX();
    const rows = fields.filter((f) => !isClassifier(f)).map((f) => ({
      "Nom": f.col, "Codi": f.codi ?? "", "Taula associada": f.taula_assoc ?? "", "Classificador": f.classificador ?? "",
      "Tipus dada": f.tipus_dada ?? "", "CBT": f.cbt ?? "",
      "Format paràmetre": f.format_param ?? "", "Agrupació Revit": f.agrupacio_revit ?? "",
      "Grup .txt": f.grup_txt ?? "", "Instància Revit": f.instancia_revit ?? "",
      "Disciplina": f.disciplina ?? "",
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
      const XLSX = await getXLSX();
      const wb   = XLSX.read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);

      const toAdd: FieldMeta[] = rows.map((r) => {
        const nom = String(r["Nom"] ?? "").trim().toUpperCase();
        if (!nom) return null;

        const codi            = String(r["Codi"]             ?? "").trim() || null;
        const taula_assoc     = String(r["Taula associada"]  ?? "").trim() || null;
        const tipus_dada      = String(r["Tipus dada"]       ?? "").trim() || null;
        const cbt             = String(r["CBT"]              ?? "").trim() || null;
        const format_param    = String(r["Format parèmetre"] ?? "").trim() || null;
        const agrupacio_revit = String(r["Agrupació Revit"]  ?? "").trim() || null;
        const grup_txt        = String(r["Grup .txt"]        ?? "").trim() || null;
        const instancia_revit = String(r["Instància Revit"]  ?? "").trim() || null;
        const disciplina      = String(r["Disciplina"]       ?? "").trim() || null;

        // Si tots els camps tècnics estan buits → classificador explícit
        const isExplicitClassifier = !codi && !cbt && !format_param && !agrupacio_revit && !disciplina;

        // Classificador automàtic per rang numèric del codi
        const classificador = isExplicitClassifier ? null : autoClassifierForCodi(codi);

        return {
          col: nom,
          codi,
          taula_assoc,
          tipus_dada,
          cbt,
          format_param,
          agrupacio_revit,
          grup_txt,
          instancia_revit,
          disciplina,
          classificador,
        } as FieldMeta;
      }).filter(Boolean) as FieldMeta[];

      const { inserted, duplicates } = await addMany(toAdd);
      const parts: string[] = [];
      if (inserted > 0) parts.push(`${inserted} camps inserits`);
      if (duplicates > 0) parts.push(`${duplicates} duplicats importats amb el sufix (DUPLICAT)`);
      if (inserted > 0 || duplicates > 0) toast.success(parts.join(" · "));
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
    <div className="flex flex-col gap-4 overflow-hidden flex-1 min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Diccionari de camps</h1>
        <p className="text-sm text-slate-500 mt-1">Defineix i organitza els paràmetres tècnics CBT</p>
      </div>

        {/* Filtres: 3 columnes iguals que omplen exactament l'ample del popup — mai es tallen */}
        <div className="grid grid-cols-3 gap-2 shrink-0">
          <Input placeholder="Cerca per nom, codi o CBT…" value={q} onChange={(e) => setQ(e.target.value)} className="border-slate-200 min-w-0" />
          <Select value={grp} onValueChange={setGrp}>
            <SelectTrigger className="min-w-0 w-full"><SelectValue placeholder="Totes les agrupacions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Totes les agrupacions</SelectItem>
              {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger className="min-w-0 w-full"><SelectValue placeholder="Tots els classificadors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tots els classificadors</SelectItem>
              {classifiers.map((c) => <SelectItem key={c.col} value={c.col}>{c.col}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 border-slate-200 text-slate-600 hover:text-slate-800" onClick={exportXlsx}><Download className="h-4 w-4" /> Exporta Excel</Button>
          {canEdit && <Button variant="outline" size="sm" className="gap-1.5 border-slate-200 text-slate-600 hover:text-slate-800" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importa Excel</Button>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.currentTarget.value = ""; }} />
          {canEdit && <Button size="sm" className="gap-1.5 bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => { setEditing(null); setAddOpen(true); }}><Plus className="h-4 w-4" /> Nou camp</Button>}
          {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" /> Esborra tots</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Esborrar tots els camps?</AlertDialogTitle><AlertDialogDescription>S'eliminaran tots els camps del diccionari.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => { try { await clearAll(); toast.success("Tots els camps eliminats"); } catch { toast.error("Error esborrant camps"); } }}>Esborra</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="ml-auto text-xs text-muted-foreground self-center">{filtered.length} camps</div>
        </div>

        {/* Taula: scroll horitzontal (←→) i vertical (↑↓) propi — filtres sempre visibles */}
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden flex-1 min-h-0">
          <div
            ref={containerRef}
            className="overflow-x-auto overflow-y-auto h-full"
            style={{ maxHeight: CONTAINER_H }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: 1100 }}>
              <colgroup>
                <col style={{ width: 200 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-white border-b shadow-sm">
                <tr className="text-left">
                  <th className="p-2 font-semibold text-xs">Nom</th>
                  <th className="p-2 font-semibold text-xs text-violet-600 border-l-2 border-violet-200">Codi</th>
                  <th className="p-2 font-semibold text-xs text-violet-600">Taula assoc.</th>
                  <th className="p-2 font-semibold text-xs text-violet-600">Tipus dada</th>
                  <th className="p-2 font-semibold text-xs text-[#0099A8] border-l-2 border-[#0099A8]/30">CBT</th>
                  <th className="p-2 font-semibold text-xs text-[#0099A8]">Format par.</th>
                  <th className="p-2 font-semibold text-xs text-[#0099A8]">Agrupació Revit</th>
                  <th className="p-2 font-semibold text-xs text-[#0099A8]">Grup .txt</th>
                  <th className="p-2 font-semibold text-xs text-[#0099A8]">Instància Revit</th>
                  <th className="p-2 font-semibold text-xs text-[#0099A8]">Disciplina</th>
                  <th className="p-2 font-semibold text-xs">Accions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Cap camp al diccionari. Crea un camp nou o importa un Excel.</td></tr>
                ) : (
                  <>
                    {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={11} /></tr>}
                    {visibleRows.map((f) => {
                      const c = isClassifier(f);
                      return (
                        <tr key={f.col} className={cn("border-t align-top", c && "bg-accent/30 font-semibold")}>
                          <td className="p-2 break-words">
                            <div className="break-words min-w-0">{f.col}</div>
                            {c && <Badge variant="outline" className="mt-0.5 text-[10px] uppercase tracking-wide">Classificador</Badge>}
                          </td>
                          <td className="p-2 font-mono text-xs border-l-2 border-violet-100 break-words">{c ? "—" : (f.codi ?? "—")}</td>
                          <td className="p-2 text-xs break-words">{f.taula_assoc ?? "—"}</td>
                          <td className="p-2 text-xs break-words">{f.tipus_dada ?? "—"}</td>
                          <td className="p-2 font-mono text-xs text-muted-foreground border-l-2 border-[#0099A8]/20 break-words">{f.cbt ?? "—"}</td>
                          <td className="p-2 text-xs break-words">{f.format_param ?? "—"}</td>
                          <td className="p-2 text-xs break-words">{f.agrupacio_revit ?? "—"}</td>
                          <td className="p-2 text-xs break-words">{f.grup_txt ?? "—"}</td>
                          <td className="p-2 text-xs font-mono break-words">{c ? "—" : (f.instancia_revit ?? "—")}</td>
                          <td className="p-2 text-xs break-words">{f.disciplina ?? "—"}</td>
                          <td className="p-2">
                            {isCustom(f.col) && canEdit && (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(f); setAddOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Esborrar camp?</AlertDialogTitle><AlertDialogDescription>S'eliminarà «{f.col}» i les seves referències en equips.</AlertDialogDescription></AlertDialogHeader>
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
                    {padBot > 0 && <tr style={{ height: padBot }}><td colSpan={11} /></tr>}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <AddFieldDialog
          open={addOpen} onOpenChange={setAddOpen} groups={groups} disciplines={disciplines}
          editing={editing} existsCol={exists}
          onSubmit={async (f) => {
            try {
              if (editing) { await updateField(editing.col, f); toast.success("Camp actualitzat"); }
              else { await addField(f); toast.success("Camp creat"); }
            } catch (e: any) {
              toast.error(e?.message ?? "Error desant camp");
              throw e; // re-llança perquè AddFieldDialog pugui fer setSaving(false)
            }
          }}
        />
    </div>
  );
}
