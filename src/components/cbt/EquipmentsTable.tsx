import { memo, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertTriangle, Download, Eye, Layers, Pencil, Plus, Trash2, Upload, Search, ChevronRight } from "lucide-react";
import { Equipment, useEquipments } from "@/hooks/useEquipments";
import { useGubimClass, codeLevel, parentCode } from "@/hooks/useGubimClass";
import { useFields } from "@/hooks/useFields";
import { LevelBadge } from "./LevelBadge";
import { EquipmentFormDialog } from "./EquipmentFormDialog";
import { EquipmentDetailDialog } from "./EquipmentDetailDialog";
import { uid } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Colors per als grups de codi compartit (ciclics)
const GROUP_COLORS = [
  "border-l-violet-500 bg-violet-50/60 dark:bg-violet-950/30",
  "border-l-sky-500 bg-sky-50/60 dark:bg-sky-950/30",
  "border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/30",
  "border-l-rose-500 bg-rose-50/60 dark:bg-rose-950/30",
  "border-l-teal-500 bg-teal-50/60 dark:bg-teal-950/30",
  "border-l-fuchsia-500 bg-fuchsia-50/60 dark:bg-fuchsia-950/30",
];

const EquipmentRow = memo(function EquipmentRow({
  e, gubimName, parentName, level, onEdit, onDelete, onView, fieldCount, orphanCols, isChild,
  isSharedCode, groupColorIdx, isFirstInGroup, groupSize, childDepth,
}: {
  e: Equipment; gubimName: string; parentName: string; level: 1|2|3|4;
  onEdit: () => void; onDelete: () => void; onView: () => void;
  fieldCount: number; orphanCols: string[]; isChild: boolean;
  isSharedCode: boolean; groupColorIdx: number; isFirstInGroup: boolean; groupSize: number;
  childDepth: number; // 0 = equip mare, 1+ = component fill
}) {
  const gubimIndent = ["pl-2", "pl-5", "pl-8", "pl-11"][level - 1];
  // Tabulació addicional per jerarquia d'equips (components)
  const childIndentPx = childDepth * 20;
  const hasOrphans = orphanCols.length > 0;
  const groupClass = isSharedCode ? `border-l-4 ${GROUP_COLORS[groupColorIdx % GROUP_COLORS.length]}` : "";
  return (
    <tr className={cn("border-t hover:bg-muted/40 cursor-pointer", isChild && !isSharedCode && "bg-muted/20", groupClass)} onClick={onView}>
      <td className={cn("p-2", gubimIndent)}>
        <div className="flex items-center gap-2">
          {isChild && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <LevelBadge level={level} />
          <TooltipProvider><Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs cursor-default">{e.gubimCode}</span>
            </TooltipTrigger>
            {gubimName && <TooltipContent>{gubimName}</TooltipContent>}
          </Tooltip></TooltipProvider>
          {!gubimName && (
            <TooltipProvider><Tooltip>
              <TooltipTrigger asChild><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></TooltipTrigger>
              <TooltipContent>Codi GuBIMClass no trobat</TooltipContent>
            </Tooltip></TooltipProvider>
          )}
          {isSharedCode && isFirstInGroup && (
            <TooltipProvider><Tooltip>
              <TooltipTrigger asChild>
                <Badge className="gap-1 text-[10px] px-1.5 py-0 bg-violet-600 hover:bg-violet-600 text-white border-transparent">
                  <Layers className="h-2.5 w-2.5" />{groupSize}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{groupSize} equips comparteixen aquest codi GuBIMClass (components d&apos;equip mare)</p>
              </TooltipContent>
            </Tooltip></TooltipProvider>
          )}
        </div>
        {parentName && <div className="text-[11px] text-muted-foreground pl-10 truncate">↳ {parentName}</div>}
      </td>
      <td className="p-2 font-mono text-xs">
        {e.equipCode || <span className="text-muted-foreground italic">—</span>}
      </td>
      {/* Nom equip amb tabulació per jerarquia de components */}
      <td className="p-2 font-medium text-sm">
        <div className="flex items-center gap-1" style={{ paddingLeft: childIndentPx }}>
          {childDepth > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          {e.equipName}
        </div>
        {childDepth > 0 && e.parentEquipCode && (
          <div className="text-[10px] text-muted-foreground font-normal" style={{ paddingLeft: childIndentPx + 16 }}>
            ↳ {e.parentEquipCode}
          </div>
        )}
      </td>
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

  // Construeix la llista ordenada jeràrquicament:
  // 1. Ordena per gubimCode, després per equipCode
  // 2. Per cada grup de gubimCode: pares primer (sense parentEquipCode), fills immediatament després del seu pare (recursiu)
  const sorted = useMemo(() => {
    const base = [...items].sort((a, b) => {
      if (a.gubimCode !== b.gubimCode) return a.gubimCode.localeCompare(b.gubimCode);
      return a.equipCode.localeCompare(b.equipCode);
    });

    // Construeix un arbre per inserir fills immediatament sota el pare
    const result: { equip: Equipment; depth: number }[] = [];
    const byCode = new Map(base.map((e) => [e.equipCode, e]));
    const added = new Set<string>();

    function insertWithChildren(e: Equipment, depth: number) {
      if (added.has(e.id)) return;
      added.add(e.id);
      result.push({ equip: e, depth });
      // Fills directes d'aquest equip, ordenats per equipCode
      const children = base.filter(
        (c) => c.parentEquipCode === e.equipCode && c.gubimCode === e.gubimCode && !added.has(c.id)
      );
      children.forEach((c) => insertWithChildren(c, depth + 1));
    }

    // Processa per grups de gubimCode, pares primer
    const byGubim = new Map<string, Equipment[]>();
    base.forEach((e) => {
      const list = byGubim.get(e.gubimCode) ?? [];
      list.push(e);
      byGubim.set(e.gubimCode, list);
    });

    byGubim.forEach((group) => {
      // Pares (sense parentEquipCode o parentEquipCode no trobat dins el grup)
      const groupCodes = new Set(group.map((e) => e.equipCode));
      const roots = group.filter((e) => !e.parentEquipCode || !groupCodes.has(e.parentEquipCode));
      roots.forEach((r) => insertWithChildren(r, 0));
      // Qualsevol que hagi quedat sense processar (cicles o refs trencades)
      group.filter((e) => !added.has(e.id)).forEach((e) => insertWithChildren(e, 0));
    });

    return result;
  }, [items]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sorted;
    return sorted.filter(({ equip: e }) =>
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

  // Calcula quins codis gubim es repeteixen i assigna índex de grup
  const sharedCodeInfo = useMemo(() => {
    const countByCode = new Map<string, number>();
    filtered.forEach(({ equip: e }) => countByCode.set(e.gubimCode, (countByCode.get(e.gubimCode) ?? 0) + 1));
    const colorIdxByCode = new Map<string, number>();
    let colorIdx = 0;
    filtered.forEach(({ equip: e }) => {
      if ((countByCode.get(e.gubimCode) ?? 0) > 1 && !colorIdxByCode.has(e.gubimCode)) {
        colorIdxByCode.set(e.gubimCode, colorIdx++);
      }
    });
    return { countByCode, colorIdxByCode };
  }, [filtered]);

  const seenGroupCodes = new Set<string>();

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
          <thead className="sticky top-0 z-10 bg-muted border-b">
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
            {filtered.map(({ equip: e, depth }) => {
              const node = nodeMap.get(e.gubimCode);
              const lvl = (node ? codeLevel(node.code) : 1) as 1|2|3|4;
              const pc = node ? parentCode(node.code) : null;
              const parent = pc ? nodeMap.get(pc) : null;
              const orphanCols = e.fieldCols.filter((c) => !fieldMap.has(c));
              const isChild = !!e.parentEquipCode;
              const groupSize = sharedCodeInfo.countByCode.get(e.gubimCode) ?? 1;
              const isSharedCode = groupSize > 1;
              const groupColorIdx = sharedCodeInfo.colorIdxByCode.get(e.gubimCode) ?? 0;
              const isFirstInGroup = isSharedCode && !seenGroupCodes.has(e.gubimCode);
              if (isSharedCode) seenGroupCodes.add(e.gubimCode);
              return (
                <EquipmentRow
                  key={e.id} e={e}
                  gubimName={node?.name ?? ""}
                  parentName={parent ? `${parent.code} · ${parent.name}` : ""}
                  level={lvl} fieldCount={e.fieldCols.length}
                  orphanCols={orphanCols} isChild={isChild}
                  isSharedCode={isSharedCode}
                  groupColorIdx={groupColorIdx}
                  isFirstInGroup={isFirstInGroup}
                  groupSize={groupSize}
                  childDepth={depth}
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

      {/* Llegenda: codis compartits */}
      {Array.from(sharedCodeInfo.colorIdxByCode.entries()).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">Codis GuBIMClass compartits (components d&apos;equip mare):</span>
          {Array.from(sharedCodeInfo.colorIdxByCode.entries()).map(([code, idx]) => (
            <span key={code} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border-l-4 ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}>
              <span className="font-mono">{code}</span>
              <span className="text-muted-foreground">({sharedCodeInfo.countByCode.get(code)} equips)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}