import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

function useDebounce<T>(value: T, ms = 180): T {
  const [dv, setDv] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDv(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return dv;
}
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronRight, Download, Pencil, Trash2, Upload, Search, X } from "lucide-react";
import { GubimNode, codeLevel, isValidCode, parentCode, useGubimClass } from "@/hooks/useGubimClass";
import { LevelBadge } from "./LevelBadge";
import { uid } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

interface Props { open: boolean; onOpenChange: (b: boolean) => void; }

export function GubimClassManager({ open, onOpenChange }: Props) {
  const { nodes, nodeMap, addNode, addMany, updateNode, removeNode, hasChildren, clearAll } = useGubimClass();
  const { canEditView } = useAuth();
  const canEdit = canEditView("gubimclass");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<GubimNode | null>(null);
  const [codeError, setCodeError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [nameError, setNameError] = useState("");

  const reset = () => { setCode(""); setName(""); setEditing(null); setCodeError(""); setNameError(""); };

  // Reset filtre quan es tanca el diàleg
  const handleOpenChange = (val: boolean) => {
    if (!val) { setQ(""); setScrollTop(0); containerRef.current?.scrollTo(0, 0); }
    onOpenChange(val);
  };

  const validateName = (val: string) => {
    if (!val) { setNameError(""); return; }
    const existingName = nodes.find((n) => n.name.trim().toLowerCase() === val.trim().toLowerCase() && n.id !== editing?.id);
    if (existingName) { setNameError(`Nom duplicat (codi ${existingName.code})`); return; }
    setNameError("");
  };

  const validateCode = (val: string) => {
    if (!val) { setCodeError(""); return; }
    if (!isValidCode(val)) { setCodeError("Format invàlid (ex: 10, 10.20, 10.20.100, 90.40.10.390)"); return; }
    const p = parentCode(val);
    if (p && !nodeMap.has(p)) { setCodeError(`El pare ${p} no existeix`); return; }
    // Validació de codi duplicat (excepte si estem editant el mateix node)
    const existingWithCode = nodes.find((n) => n.code === val && n.id !== editing?.id);
    if (existingWithCode) { setCodeError(`El codi ${val} ja existeix (${existingWithCode.name})`); return; }
    setCodeError("");
  };

  const save = async () => {
    const C = code.trim();
    const N = name.trim();
    if (!isValidCode(C)) return toast.error("Format de codi invàlid");
    if (!N) return toast.error("El nom és obligatori");
    const p = parentCode(C);
    if (p && !nodeMap.has(p)) return toast.error(`El node pare ${p} no existeix`);
    // Validació de codi duplicat
    const existingCode = nodes.find((n) => n.code === C && n.id !== editing?.id);
    if (existingCode) return toast.error(`El codi ${C} ja existeix (${existingCode.name})`);
    // Validació de nom duplicat
    const existingName = nodes.find((n) => n.name.trim().toLowerCase() === N.toLowerCase() && n.id !== editing?.id);
    if (existingName) return toast.error(`El nom "${N}" ja existeix (codi ${existingName.code})`);
    setSaving(true);
    try {
      if (editing) {
        await updateNode(editing.id, { code: C, name: N });
        toast.success("Node actualitzat" + (C !== editing.code ? " (fills actualitzats en cascada)" : ""));
      } else {
        await addNode({ code: C, name: N });
        toast.success("Node creat");
      }
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Error desant node");
    } finally {
      setSaving(false);
    }
  };

  const exportXlsx = () => {
    const rows = [...nodes].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })).map((n) => ({
      Codi: n.code, Nom: n.name, Nivell: codeLevel(n.code), Pare: parentCode(n.code) ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GuBIMClass");
    XLSX.writeFile(wb, "gubimclass.xlsx");
    toast.success("GuBIMClass exportat");
  };

  const importXlsx = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      const arr = rows
        .map((r) => ({ code: String(r["Codi"] ?? "").trim(), name: String(r["Nom"] ?? "").trim() }))
        .filter((n) => n.code && n.name && isValidCode(n.code));
      const invalidCount = rows.length - arr.length;
      const { inserted, autoCreated, duplicates } = await addMany(arr);
      const parts: string[] = [];
      if (inserted > 0) parts.push(`${inserted} nodes inserits`);
      if (duplicates > 0) parts.push(`${duplicates} duplicats (codi nivell 4 amb sufix _2, _3...)`);
      if (autoCreated > 0) parts.push(`${autoCreated} pares creats automàticament`);
      if (invalidCount > 0) parts.push(`${invalidCount} files amb format invàlid`);
      if (inserted > 0) toast.success(parts.join(" · "));
      else toast.warning(parts.length > 0 ? parts.join(" · ") : "Cap node per importar");
    } catch (e: any) {
      toast.error(`Error en importar: ${e?.message ?? "error desconegut"}`);
    }
  };

  const debouncedQ = useDebounce(q, 180);

  // PERF: virtualització de la llista — igual que FieldsDictionaryDialog
  const ROW_H = 41; // altura real de cada fila en px
  const OVERSCAN = 8;
  const CONTAINER_H = 480;
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => [...nodes].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })), [nodes]);

  const filtered = useMemo(() => {
    const t = debouncedQ.trim().toLowerCase();
    if (!t) return sorted;
    return sorted.filter((n) => n.code.toLowerCase().includes(t) || n.name.toLowerCase().includes(t));
  }, [sorted, debouncedQ]);

  // PERF: reset scroll quan canvia el filtre
  useEffect(() => { setScrollTop(0); containerRef.current?.scrollTo(0, 0); }, [debouncedQ]);

  const levelCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    sorted.forEach((n) => counts[codeLevel(n.code)]++);
    return counts;
  }, [sorted]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Gestió GuBIMClass</DialogTitle>
            <div className="flex gap-2 mr-8">
              {[1, 2, 3, 4].map((l) => (
                <div key={l} className="flex items-center gap-1">
                  <LevelBadge level={l as 1|2|3|4} />
                  <span className="text-xs text-muted-foreground">{levelCounts[l]}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Formulari inline */}
        <div className="flex flex-wrap items-start gap-2 p-3 border rounded-md bg-muted/30">
          <div className="space-y-1">
            <label className="text-xs font-medium">Codi</label>
            <Input
              placeholder="ex. 30.50.10"
              value={code}
              onChange={(e) => { setCode(e.target.value); validateCode(e.target.value); }}
              className={cn("w-40 font-mono", codeError && "border-destructive")}
            />
            {codeError && <p className="text-xs text-destructive">{codeError}</p>}
          </div>
          <div className="space-y-1 flex-1 min-w-[240px]">
            <label className="text-xs font-medium">Nom</label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); validateName(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              placeholder="Nom del node…"
              className={cn(nameError && "border-destructive")}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="flex gap-2 pt-6">
            <Button onClick={save} disabled={!!codeError || !!nameError || !canEdit || saving} className="bg-[#0099A8] hover:bg-[#006E7A]">
              {saving ? "Desant…" : (editing ? "Desa" : "Afegeix")}
            </Button>
            {editing && <Button variant="outline" onClick={reset}>Cancel·la</Button>}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nodes…" className="pl-8 h-8" />
            {q && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setQ("")}><X className="h-3 w-3" /></Button>}
          </div>
          <Button size="sm" variant="outline" onClick={exportXlsx}><Download className="h-4 w-4" /> Exporta</Button>
          {canEdit && <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importa</Button>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.currentTarget.value = ""; }} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={!canEdit}><Trash2 className="h-4 w-4" /> Esborra tot</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Esborrar tota la classificació?</AlertDialogTitle>
                <AlertDialogDescription>Els equips que referencien nodes quedaran amb referències invàlides.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                <AlertDialogAction onClick={async () => { try { await clearAll(); toast.success("GuBIMClass esborrat"); } catch { toast.error("Error esborrant"); } }}>Esborra</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div
          ref={containerRef}
          className="border rounded-md flex-1 overflow-auto"
          style={{ maxHeight: CONTAINER_H }}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        >
          {/* PERF: TooltipProvider hoisted aquí (1 instància), no dins de cada fila */}
          <TooltipProvider>
          <table className="w-full text-sm">
              <colgroup>
                <col style={{ width: 120 }} />
                <col />
                <col style={{ width: 80 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 90 }} />
              </colgroup>
            <thead className="sticky top-0 z-10 bg-white border-b shadow-sm">
              <tr className="text-left">
                <th className="p-2 text-xs font-semibold">Codi</th>
                <th className="p-2 text-xs font-semibold">Nom</th>
                <th className="p-2 text-xs font-semibold">Nivell</th>
                <th className="p-2 text-xs font-semibold">Pare</th>
                <th className="p-2 w-24 text-xs font-semibold">Accions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // PERF: virtualització — només renderitzem les files visibles + overscan
                const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
                const endIdx   = Math.min(filtered.length - 1, Math.ceil((scrollTop + CONTAINER_H) / ROW_H) + OVERSCAN);
                const visibleRows = filtered.slice(startIdx, endIdx + 1);
                const padTop = startIdx * ROW_H;
                const padBot = Math.max(0, (filtered.length - endIdx - 1) * ROW_H);

                // Detecta codis repetits a qualsevol nivell (equip mare + components)
                const allCodes = filtered.map((n) => n.code);
                const repeatedCodes = new Set(allCodes.filter((c, i) => allCodes.indexOf(c) !== i));
                const seenCodes = new Set<string>();
                // Pre-computa per a les files virtuals anteriors a la finestra visible
                filtered.slice(0, startIdx).forEach((n) => {
                  if (repeatedCodes.has(n.code)) seenCodes.add(n.code);
                });

                return (
                  <>
                    {padTop > 0 && <tr><td colSpan={5} style={{ height: padTop, padding: 0 }} /></tr>}
                    {visibleRows.map((n) => {
                      const lvl = codeLevel(n.code);
                      const indent = ["pl-2", "pl-6", "pl-10", "pl-14"][lvl - 1];
                      const pc = parentCode(n.code);
                      const parent = pc ? nodeMap.get(pc) : null;
                      const hasC = hasChildren(n.code);
                      const isEditing = editing?.id === n.id;
                      const isRepeated = repeatedCodes.has(n.code);
                      const isComponent = isRepeated && seenCodes.has(n.code);
                      if (isRepeated) seenCodes.add(n.code);
                      return (
                        <tr key={n.id} className={cn("border-t hover:bg-muted/30", isEditing && "bg-accent/40")}>
                          <td className={cn("p-2 font-mono text-xs", indent)}>{n.code}</td>
                          <td className="p-2 break-words">
                            <div className={cn("flex items-center gap-1 min-w-0", isComponent && "pl-5")}>
                              {isComponent && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                              {n.name}
                            </div>
                          </td>
                          <td className="p-2"><LevelBadge level={lvl} /></td>
                          <td className="p-2 text-xs text-muted-foreground">{parent ? `${parent.code} · ${parent.name}` : "—"}</td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              <Button
                                size="icon" variant={isEditing ? "secondary" : "ghost"} className="h-7 w-7"
                                disabled={!canEdit}
                                onClick={() => { if (isEditing) { reset(); } else { setEditing(n); setCode(n.code); setName(n.name); setCodeError(""); } }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {/* PERF: Tooltip sense TooltipProvider (ja viu al pare) */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={hasC || !canEdit}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Esborrar {n.code} · {n.name}?</AlertDialogTitle>
                                          <AlertDialogDescription>Aquesta acció no es pot desfer.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                                          <AlertDialogAction onClick={async () => {
                                            try { await removeNode(n.id); toast.success("Node esborrat"); }
                                            catch { toast.error("Error esborrant node"); }
                                          }}>Esborra</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </span>
                                </TooltipTrigger>
                                {hasC && <TooltipContent>No es pot esborrar: té fills</TooltipContent>}
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {padBot > 0 && <tr><td colSpan={5} style={{ height: padBot, padding: 0 }} /></tr>}
                    {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Cap node</td></tr>}
                  </>
                );
              })()}
            </tbody>
          </table>
          </TooltipProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const _newId = () => uid();


