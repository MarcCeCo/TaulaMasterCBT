import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
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
  const { canEdit } = useAuth();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<GubimNode | null>(null);
  const [codeError, setCodeError] = useState("");
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setCode(""); setName(""); setEditing(null); setCodeError(""); };

  const validateCode = (val: string) => {
    if (!val) { setCodeError(""); return; }
    if (!isValidCode(val)) { setCodeError("Format invàlid (ex: 30, 30.50, 30.50.10)"); return; }
    const p = parentCode(val);
    if (p && !nodeMap.has(p)) { setCodeError(`El pare ${p} no existeix`); return; }
    setCodeError("");
  };

  const save = async () => {
    const C = code.trim();
    const N = name.trim();
    if (!isValidCode(C)) return toast.error("Format de codi invàlid");
    if (!N) return toast.error("El nom és obligatori");
    const p = parentCode(C);
    if (p && !nodeMap.has(p)) return toast.error(`El node pare ${p} no existeix`);
    if (editing) {
      if (C !== editing.code && nodeMap.has(C)) return toast.error("El codi ja existeix");
      try { await updateNode(editing.id, { code: C, name: N }); toast.success("Node actualitzat" + (C !== editing.code ? " (fills actualitzats en cascada)" : "")); }
      catch (e: any) { return toast.error(e.message); }
    } else {
      try { await addNode({ code: C, name: N }); toast.success("Node creat"); }
      catch (e: any) { return toast.error(e.message); }
    }
    reset();
  };

  const exportXlsx = () => {
    const rows = [...nodes].sort((a, b) => a.code.localeCompare(b.code)).map((n) => ({
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

  const sorted = useMemo(() => [...nodes].sort((a, b) => a.code.localeCompare(b.code)), [nodes]);

  // Filtre de cerca
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sorted;
    return sorted.filter((n) => n.code.toLowerCase().includes(t) || n.name.toLowerCase().includes(t));
  }, [sorted, q]);

  const levelCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    sorted.forEach((n) => counts[codeLevel(n.code)]++);
    return counts;
  }, [sorted]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              placeholder="Nom del node…"
            />
          </div>
          <div className="flex gap-2 pt-6">
            <Button onClick={save} disabled={!!codeError || !canEdit} className="bg-[#0099A8] hover:bg-[#006E7A]">
              {editing ? "Desa" : "Afegeix"}
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

        <div className="border rounded-md flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted border-b">
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
                // Detecta codis de nivell 4 repetits
                const lvl4Codes = filtered.map((n) => n.code).filter((c) => codeLevel(c) === 4);
                const repeatedLvl4 = new Set(lvl4Codes.filter((c, i) => lvl4Codes.indexOf(c) !== i));
                const seenLvl4 = new Set<string>();
                return filtered.map((n) => {
                  const lvl = codeLevel(n.code);
                  const indent = ["pl-2", "pl-6", "pl-10", "pl-14"][lvl - 1];
                  const pc = parentCode(n.code);
                  const parent = pc ? nodeMap.get(pc) : null;
                  const hasC = hasChildren(n.code);
                  const isEditing = editing?.id === n.id;
                  // Tabulació extra al nom: només per codis de nivell 4 repetits (components)
                  const isRepeatedLvl4 = lvl === 4 && repeatedLvl4.has(n.code);
                  const isComponent = isRepeatedLvl4 && seenLvl4.has(n.code);
                  if (isRepeatedLvl4) seenLvl4.add(n.code);
                  return (
                    <tr key={n.id} className={cn("border-t hover:bg-muted/30", isEditing && "bg-accent/40")}>
                      <td className={cn("p-2 font-mono text-xs", indent)}>{n.code}</td>
                      <td className="p-2">
                        <div className={cn("flex items-center gap-1", isComponent && "pl-5")}>
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
                        <TooltipProvider>
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
                                      <AlertDialogAction onClick={async () => { try { await removeNode(n.id); toast.success("Node esborrat"); } catch { toast.error("Error esborrant node"); } }}>Esborra</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </span>
                            </TooltipTrigger>
                            {hasC && <TooltipContent>No es pot esborrar: té fills</TooltipContent>}
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </td>
                  </tr>
                );
                });
              })()}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Cap node</td></tr>}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const _newId = () => uid();


