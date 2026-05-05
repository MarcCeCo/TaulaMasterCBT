import { memo, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertTriangle, Download, Eye, Pencil, Plus, Trash2, Upload, Search, ChevronRight } from "lucide-react";
import { Equipment, useEquipments } from "@/hooks/useEquipments";
import { useGubimClass, codeLevel, parentCode } from "@/hooks/useGubimClass";
import { useFields } from "@/hooks/useFields";
import { LevelBadge } from "./LevelBadge";
import { EquipmentFormDialog } from "./EquipmentFormDialog";
import { EquipmentDetailDialog } from "./EquipmentDetailDialog";
import { uid } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EquipmentRow = memo(function EquipmentRow({
  e, gubimName, parentName, level, onEdit, onDelete, onView, fieldCount, orphanCols, isChild,
}: {
  e: Equipment; gubimName: string; parentName: string; level: 1|2|3|4;
  onEdit: () => void; onDelete: () => void; onView: () => void;
  fieldCount: number; orphanCols: string[]; isChild: boolean;
}) {
  const indent = ["pl-2", "pl-5", "pl-8", "pl-11"][level - 1];
  const hasOrphans = orphanCols.length > 0;
  return (
    <tr className={cn("border-t hover:bg-muted/40 cursor-pointer", isChild && "bg-muted/20")} onClick={onView}>
      <td className={cn("p-2", indent)}>
        <div className="flex items-center gap-2">
          {isChild && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <LevelBadge level={level} />
          <span className="font-mono text-xs">{e.gubimCode}</span>
          {!gubimName && (
            <TooltipProvider><Tooltip>
              <TooltipTrigger asChild><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></TooltipTrigger>
              <TooltipContent>Codi GuBIMClass no trobat</TooltipContent>
            </Tooltip></TooltipProvider>
          )}
          <span className="truncate text-xs text-muted-foreground">{gubimName}</span>
        </div>
        {parentName && <div className="text-[11px] text-muted-foreground pl-10 truncate">↳ {parentName}</div>}
      </td>
      <td className="p-2 font-mono text-xs">{e.equipCode || <span className="text-muted-foreground italic">—</span>}</td>
      <td className="p-2 font-medium text-sm">{e.equipName}</td>
      <td className="p-2">
        {e.needsTable ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">Sí</Badge> : <Badge variant="secondary" className="text-xs">No</Badge>}
      </td>
      <td className="p-2 font-mono text-xs">{e.tableCode || "—"}</td>
      <td className="p-2 text-xs truncate max-w-[160px]">{e.tableName || "—"}</td>
      <td className="p-2 text-center">
        {hasOrphans ? (
          <TooltipProvider><Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex items-center gap-1">
                <Badge variant="outline" className="border-amber-400 text-amber-600">{fieldCount}</Badge>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent><p>Camps no trobats: {orphanCols.join(", ")}</p></TooltipContent>
          </Tooltip></TooltipProvider>
        ) : <Badge variant="outline">{fieldCount}</Badge>}
      </td>
      <td className="p-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7 text-[#0099A8]" onClick={onView}><Eye className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Esborrar equip {e.equipName}?</AlertDialogTitle>
                <AlertDialogDescription>Aquesta acció no es pot desfer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Esborra</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
});

export function EquipmentsTable() {
  const { items, upsert, remove, addMany, clearAll, byCode } = useEquipments();
  const { nodes, nodeMap } = useGubimClass();
  const { fields, fieldMap } = useFields();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [viewing, setViewing] = useState<Equipment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ordena: primer per gubimCode, dins del mateix codi el pare primer, fills després
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.gubimCode !== b.gubimCode) return a.gubimCode.localeCompare(b.gubimCode);
      // Dins del mateix gubimCode: sense pare primer, amb pare (fills) després
      if (!a.parentEquipCode && b.parentEquipCode) return -1;
      if (a.parentEquipCode && !b.parentEquipCode) return 1;
      return a.equipName.localeCompare(b.equipName);
    });
  }, [items]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sorted;
    return sorted.filter((e) =>
      e.equipCode.toLowerCase().includes(t) ||
      e.equipName.toLowerCase().includes(t) ||
      e.gubimCode.includes(t) ||
      e.tableName.toLowerCase().includes(t),
    );
  }, [sorted, q]);

  const isCodeTaken = (code: string, excludeId?: string) => {
    if (!code) return false;
    const ex = byCode.get(code);
    return !!ex && ex.id !== excludeId;
  };

  // Export: cada camp en columna independent
  const exportXlsx = () => {
    // Obtenim tots els cols usats en algun equip
    const allCols = Array.from(new Set(items.flatMap((e) => e.fieldCols)));
    const rows = items.map((e) => {
      const base: Record<string, any> = {
        "GuBIMClass": e.gubimCode,
        "Codi equip": e.equipCode,
        "Nom equip": e.equipName,
        "Necessita taula": e.needsTable ? "Y" : "N",
        "Codi taula": e.tableCode,
        "Nom taula": e.tableName,
        "Equip pare": e.parentEquipCode,
      };
      // Cada camp com a columna independent (Y si assignat, buit si no)
      allCols.forEach((col) => {
        const f = fieldMap.get(col);
        base[col + (f?.name ? ` (${f.name})` : "")] = e.fieldCols.includes(col) ? "Y" : "";
      });
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equips");
    XLSX.writeFile(wb, "equips.xlsx");
    toast.success("Equips exportats");
  };

  const importXlsx = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      const arr: Equipment[] = rows.map((r) => {
        const code = String(r["Codi equip"] ?? "").toUpperCase().trim();
        const name = String(r["Nom equip"] ?? "").trim();
        const needs = String(r["Necessita taula"] ?? "N") === "Y";
        // Acceptem tant format antic (Camps pipe-separated) com nou (columnes individuals)
        let fieldCols: string[] = [];
        if (r["Camps"]) {
          fieldCols = String(r["Camps"]).split("|").map((s: string) => s.trim()).filter(Boolean);
        } else {
          // Format nou: recollim les columnes que tinguin valor "Y"
          fieldCols = Object.keys(r).filter(k => {
            const known = ["GuBIMClass","Codi equip","Nom equip","Necessita taula","Codi taula","Nom taula","Equip pare"];
            if (known.includes(k)) return false;
            return String(r[k]).toUpperCase() === "Y";
          }).map(k => k.split(" (")[0].trim()); // treure el nom si existeix
        }
        return {
          id: uid(),
          gubimCode: String(r["GuBIMClass"] ?? "").trim(),
          equipCode: code, // pot ser buit
          equipName: name,
          needsTable: needs,
          tableCode: needs && code ? "T" + code : "",
          tableName: needs ? name : "",
          fieldCols,
          parentEquipCode: String(r["Equip pare"] ?? "").trim(),
          createdAt: Date.now(),
        };
      }).filter((e) => e.equipName); // el nom és l'únic obligatori
      addMany(arr);
      toast.success(`${arr.length} equips processats`);
    } catch { toast.error("Error en importar"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca equips…" className="pl-8" />
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={exportXlsx}><Download className="h-4 w-4" /> Exporta</Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importa</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.currentTarget.value = ""; }} />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4" /> Esborra tot</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Esborrar tots els equips?</AlertDialogTitle><AlertDialogDescription>Aquesta acció no es pot desfer.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel·la</AlertDialogCancel>
              <AlertDialogAction onClick={() => { clearAll(); toast.success("Equips esborrats"); }}>Esborra</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button size="sm" className="bg-[#0099A8] hover:bg-[#006E7A]" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Nou equip
        </Button>
      </div>

      <div className="border rounded-md overflow-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 sticky top-0">
            <tr className="text-left">
              <th className="p-2 min-w-[260px] text-xs font-semibold">GuBIMClass</th>
              <th className="p-2 text-xs font-semibold">Codi equip</th>
              <th className="p-2 text-xs font-semibold">Nom equip</th>
              <th className="p-2 text-xs font-semibold">Taula</th>
              <th className="p-2 text-xs font-semibold">Codi taula</th>
              <th className="p-2 text-xs font-semibold">Nom taula</th>
              <th className="p-2 text-xs font-semibold text-center">Camps</th>
              <th className="p-2 text-xs font-semibold w-28">Accions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const node = nodeMap.get(e.gubimCode);
              const lvl = (node ? codeLevel(node.code) : 1) as 1|2|3|4;
              const pc = node ? parentCode(node.code) : null;
              const parent = pc ? nodeMap.get(pc) : null;
              const orphanCols = e.fieldCols.filter((c) => !fieldMap.has(c));
              const isChild = !!e.parentEquipCode;
              return (
                <EquipmentRow
                  key={e.id} e={e}
                  gubimName={node?.name ?? ""}
                  parentName={parent ? `${parent.code} · ${parent.name}` : ""}
                  level={lvl} fieldCount={e.fieldCols.length}
                  orphanCols={orphanCols} isChild={isChild}
                  onView={() => { setViewing(e); setDetailOpen(true); }}
                  onEdit={(ev?: any) => { if(ev) ev.stopPropagation?.(); setEditing(e); setFormOpen(true); }}
                  onDelete={() => { remove(e.id); toast.success("Equip esborrat"); }}
                />
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Cap equip</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <EquipmentFormDialog
        open={formOpen} onOpenChange={setFormOpen} editing={editing}
        nodes={nodes} nodeMap={nodeMap} fields={fields} fieldMap={fieldMap}
        isCodeTaken={isCodeTaken} allEquipments={items}
        onSubmit={(e) => { upsert(e); toast.success(editing ? "Equip actualitzat" : "Equip creat"); }}
      />

      <EquipmentDetailDialog
        open={detailOpen} onOpenChange={setDetailOpen}
        equipment={viewing} nodeMap={nodeMap} fieldMap={fieldMap} fields={fields}
        onEdit={() => { setDetailOpen(false); setEditing(viewing); setFormOpen(true); }}
      />
    </div>
  );
}
