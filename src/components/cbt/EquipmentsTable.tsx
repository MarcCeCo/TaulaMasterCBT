import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertTriangle, Download, Eye, Layers, Pencil, Plus, Trash2, Upload, Search, RefreshCw, X } from "lucide-react";
import { useDataStore } from "@/lib/dataStore";
import { codeLevel, parentCode } from "@/hooks/useGubimClass";
import type { Equipment } from "@/hooks/useEquipments";
import { LevelBadge } from "./LevelBadge";
import { EquipmentFormDialog } from "./EquipmentFormDialog";
import { EquipmentDetailDialog } from "./EquipmentDetailDialog";
import { uid } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { exportRosmiman } from "@/lib/exportRosmiman";
import { useAuth } from "@/lib/auth";
import { useDebounce } from "@/hooks/useDebounce";
import { REVIT_CATEGORIES_FLAT } from "./EquipmentFormDialog";

const GROUP_COLORS = [
  "border-l-violet-500 bg-violet-50/60 dark:bg-violet-950/30",
  "border-l-sky-500 bg-sky-50/60 dark:bg-sky-950/30",
  "border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/30",
  "border-l-rose-500 bg-rose-50/60 dark:bg-rose-950/30",
  "border-l-teal-500 bg-teal-50/60 dark:bg-teal-950/30",
  "border-l-fuchsia-500 bg-fuchsia-50/60 dark:bg-fuchsia-950/30",
];

// PERF FIX: TooltipProvider eliminat de dins EquipmentRow — ara viu al component pare
// Això evita muntar/desmuntar centenars de proveïdors en cada interacció de la taula
const EquipmentRow = memo(function EquipmentRow({
  e, gubimName, parentName, level, onEdit, onDelete, onView, fieldCount, orphanCols, isChild,
  isSharedCode, groupColorIdx, isFirstInGroup, groupSize, childDepth, canEdit,
}: {
  e: Equipment; gubimName: string; parentName: string; level: 1|2|3|4;
  onEdit: () => void; onDelete: () => void; onView: () => void;
  fieldCount: number; orphanCols: string[]; isChild: boolean;
  isSharedCode: boolean; groupColorIdx: number; isFirstInGroup: boolean; groupSize: number;
  childDepth: number; canEdit: boolean;
}) {
  // N1-N3: indentació per nivell al GuBIMClass. N4: sempre alineats (pl-11 fix)
  const gubimIndent = level < 4 ? ["pl-2", "pl-5", "pl-8"][level - 1] : "pl-11";
  const childIndentPx = childDepth * 32;
  const hasOrphans = orphanCols.length > 0;
  const groupClass = isSharedCode ? `border-l-4 ${GROUP_COLORS[groupColorIdx % GROUP_COLORS.length]}` : "";
  return (
    <tr className={cn("border-t hover:bg-muted/40 cursor-pointer", isChild && !isSharedCode && "bg-muted/20", groupClass)} onClick={onView}>
      <td className={cn("p-2", gubimIndent)}>
        <div className="flex items-center gap-2">
          <LevelBadge level={level} />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs cursor-default">{e.gubimCode}</span>
            </TooltipTrigger>
            {gubimName && <TooltipContent>{gubimName}</TooltipContent>}
          </Tooltip>
          {!gubimName && (
            <Tooltip>
              <TooltipTrigger asChild><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></TooltipTrigger>
              <TooltipContent>Codi GuBIMClass no trobat</TooltipContent>
            </Tooltip>
          )}
          {isSharedCode && isFirstInGroup && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="gap-1 text-[10px] px-1.5 py-0 bg-violet-600 hover:bg-violet-600 text-white border-transparent">
                  <Layers className="h-2.5 w-2.5" />{groupSize}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{groupSize} equips comparteixen aquest codi GuBIMClass</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {parentName && <div className="text-[11px] text-muted-foreground pl-6 truncate">↳ {parentName}</div>}
      </td>
      <td className="p-2 font-mono text-xs">
        <div style={{ paddingLeft: childIndentPx }}>
          {e.equipCode || <span className="text-muted-foreground italic">—</span>}
        </div>
      </td>
      <td className="p-2 font-medium text-sm">
        <div className="flex items-center gap-1.5" style={{ paddingLeft: childIndentPx }}>
          {childDepth > 0 && (
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 text-slate-300">
              <path d="M1 0 L1 10 Q1 13 4 13 L12 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          )}
          {e.equipName}
        </div>
      </td>
      <td className="p-2">
        {e.needsTable
          ? <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">Sí</Badge>
          : <Badge variant="secondary" className="text-xs">No</Badge>}
      </td>
      <td className="p-2 font-mono text-xs">{e.tableCode || "—"}</td>
      <td className="p-2 text-xs truncate max-w-[160px]">{e.tableName || "—"}</td>
      <td className="p-2 text-center">
        {hasOrphans ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-flex items-center gap-1">
                <Badge variant="outline" className="border-amber-400 text-amber-600">{fieldCount}</Badge>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent><p>Camps no trobats: {orphanCols.join(", ")}</p></TooltipContent>
          </Tooltip>
        ) : <Badge variant="outline">{fieldCount}</Badge>}
      </td>
      <td className="p-2" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7 text-[#0099A8]" onClick={onView}><Eye className="h-3.5 w-3.5" /></Button>
          {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={!canEdit}><Trash2 className="h-3.5 w-3.5" /></Button>
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
  // PERF FIX: llegim directament del DataStore centralitzat
  // Eliminem 3 subscripcions redundants (useEquipments + useGubimClass + useFields)
  // que causaven re-renders en cascada en cada mutació
  const {
    equipments: items,
    upsertEquip: upsert,
    removeEquip: remove,
    addManyEquips: addMany,
    clearEquips: clearAll,
    isEquipCodeTaken,
    loading, error, retry,
    fields, fieldMap,
    gubimNodes: nodes,
    gubimNodeMap: nodeMap,
  } = useDataStore();

  const { canEditView } = useAuth();
  const canEdit = canEditView("equips");
  const [q, setQ] = useState("");

  // Reset filtre quan el component es desmunta (canvi de secció)
  useEffect(() => { return () => setQ(""); }, []);

  // ESC esborra el filtre de cerca
  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && q) { setQ(""); ev.preventDefault(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [q]);

  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [viewing, setViewing] = useState<Equipment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // PERF FIX: factories de callbacks estables — memo(EquipmentRow) no es re-renderitza
  // quan canvien altres equips no relacionats
  const handleView   = useCallback((e: Equipment) => () => { setViewing(e); setDetailOpen(true); }, []);
  const handleEdit   = useCallback((e: Equipment) => () => { setEditing(e); setFormOpen(true); }, []);
  const handleDelete = useCallback((e: Equipment) => async () => {
    try {
      await remove(e.id);
      toast.success("Equip esborrat");
      setViewing((prev) => (prev?.id === e.id ? null : prev));
      setDetailOpen((prev) => (prev && viewing?.id === e.id ? false : prev));
    }
    catch { toast.error("Error esborrant equip"); }
  }, [remove, viewing]);

  const sorted = useMemo(() => {
    const base = [...items].sort((a, b) => {
      const gc = a.gubimCode.localeCompare(b.gubimCode, undefined, { numeric: true, sensitivity: "base" });
      if (gc !== 0) return gc;
      return a.equipCode.localeCompare(b.equipCode, undefined, { numeric: true, sensitivity: "base" });
    });

    const result: { equip: Equipment; depth: number }[] = [];
    const added = new Set<string>();

    function insertWithChildren(e: Equipment, depth: number) {
      if (added.has(e.id)) return;
      added.add(e.id);
      result.push({ equip: e, depth });
      const children = e.equipCode
        ? base.filter((c) => c.parentEquipCode === e.equipCode && c.gubimCode === e.gubimCode && !added.has(c.id))
        : [];
      children.forEach((c) => insertWithChildren(c, depth + 1));
    }

    const byGubim = new Map<string, Equipment[]>();
    base.forEach((e) => {
      const list = byGubim.get(e.gubimCode) ?? [];
      list.push(e);
      byGubim.set(e.gubimCode, list);
    });

    byGubim.forEach((group) => {
      if (group.length === 1) {
        // Equip únic en el grup: sempre depth 0
        result.push({ equip: group[0], depth: 0 });
        added.add(group[0].id);
        return;
      }

      const hasExplicitParent = group.some((e) => !!e.parentEquipCode);

      if (hasExplicitParent) {
        // Jerarquia explícita via parentEquipCode
        const groupCodes = new Set(group.map((e) => e.equipCode).filter(Boolean));
        const roots = group.filter((e) => !e.parentEquipCode || !groupCodes.has(e.parentEquipCode));
        roots.forEach((r) => insertWithChildren(r, 0));
        group.filter((e) => !added.has(e.id)).forEach((e) => insertWithChildren(e, 0));
      } else {
        // Sense jerarquia explícita: el primer equip del grup és el "pare" visual (depth 0),
        // la resta són "fills" visuals (depth 1) per reflectir que comparteixen gubimCode
        group.forEach((e, i) => {
          result.push({ equip: e, depth: i === 0 ? 0 : 1 });
          added.add(e.id);
        });
      }
    });

    return result;
  }, [items]);

  const debouncedQ = useDebounce(q, 200);

  const filtered = useMemo(() => {
    const t = debouncedQ.trim().toLowerCase();
    if (!t) return sorted;
    return sorted.filter(({ equip: e }) =>
      e.equipCode.toLowerCase().includes(t) ||
      e.equipName.toLowerCase().includes(t) ||
      e.gubimCode.includes(t) ||
      e.tableName.toLowerCase().includes(t),
    );
  }, [sorted, debouncedQ]);

  // PERF FIX CRÍTIC: seenGroupCodes calculat DINS del useMemo, no mutat durant el render
  // Abans: Set mutat fora del memo → React no podia saber quines files necessitaven re-render
  // Ara: tot és immutable durant el render → React Fiber pot interrompre el render si cal
  const sharedCodeInfo = useMemo(() => {
    const countByCode = new Map<string, number>();
    filtered.forEach(({ equip: e }) =>
      countByCode.set(e.gubimCode, (countByCode.get(e.gubimCode) ?? 0) + 1)
    );
    const colorIdxByCode = new Map<string, number>();
    let colorIdx = 0;
    filtered.forEach(({ equip: e }) => {
      if ((countByCode.get(e.gubimCode) ?? 0) > 1 && !colorIdxByCode.has(e.gubimCode)) {
        colorIdxByCode.set(e.gubimCode, colorIdx++);
      }
    });
    // Calculem quines files són "primera del grup" aquí, de forma pura
    const seenCodes = new Set<string>();
    const firstInGroup = new Set<string>();
    filtered.forEach(({ equip: e }) => {
      if ((countByCode.get(e.gubimCode) ?? 0) > 1) {
        if (!seenCodes.has(e.gubimCode)) {
          firstInGroup.add(e.id);
          seenCodes.add(e.gubimCode);
        }
      }
    });
    return { countByCode, colorIdxByCode, firstInGroup };
  }, [filtered]);

  const exportXlsx = useCallback(() => {
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
        "Categoria Revit": e.revitCategory ?? "",
      };
      allCols.forEach((col) => {
        const f = fieldMap.get(col);
        base[col + (f?.codi ? ` (${f.codi})` : "")] = e.fieldCols.includes(col) ? "Y" : "";
      });
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equips");
    XLSX.writeFile(wb, "equips.xlsx");
    toast.success("Equips exportats");
  }, [items, fieldMap]);

  const exportRosimanXlsx = useCallback(() => {
    exportRosmiman(items, fieldMap);
    toast.success("Exportació Rosmiman generada");
  }, [items, fieldMap]);

  const importXlsx = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);

      // Build a map of equipCode -> equipName from the imported rows (for parent lookup)
      // Do this BEFORE parsing so the map is complete regardless of row order
      const importedNameByCode = new Map<string, string>();
      rows.forEach((r) => {
        const code = String(r["Codi equip"] ?? "").toUpperCase().trim();
        const name = String(r["Nom equip"] ?? "").trim();
        if (code && name) importedNameByCode.set(code, name);
      });
      // Also include existing items for cross-reference
      items.forEach((e) => { if (e.equipCode && e.equipName) importedNameByCode.set(e.equipCode, e.equipName); });

      const arr: Equipment[] = rows.map((r) => {
        const code = String(r["Codi equip"] ?? "").toUpperCase().trim();
        const name = String(r["Nom equip"] ?? "").trim();
        const needs = String(r["Necessita taula"] ?? "N") === "Y";
        const gubimCode = String(r["GuBIMClass"] ?? "").trim();
        const parentEquipCode = String(r["Equip pare"] ?? "").trim();
        let fieldCols: string[] = [];
        if (r["Camps"]) {
          fieldCols = String(r["Camps"]).split("|").map((s: string) => s.trim()).filter(Boolean);
        } else {
          fieldCols = Object.keys(r).filter(k => {
            const known = ["GuBIMClass","Codi equip","Nom equip","Necessita taula","Codi taula","Nom taula","Equip pare","Categoria Revit"];
            if (known.includes(k)) return false;
            return String(r[k]).toUpperCase() === "Y";
          }).map(k => k.split(" (")[0].trim());
        }
        // tableName: "NomMare NomFill" si té pare, sino sol el nom
        let tableName = "";
        if (needs) {
          if (parentEquipCode) {
            const parentName = importedNameByCode.get(parentEquipCode) ?? parentEquipCode;
            tableName = `${parentName} ${name}`;
          } else {
            tableName = name;
          }
        }
        const revitCategoryRaw = String(r["Categoria Revit"] ?? "").trim();
        // Normalitzem: cerquem la categoria correcta (case-insensitive) per
        // compatibilitat amb valors antics en minúscules (p.ex. "Mechanical equipment")
        const revitCategory = REVIT_CATEGORIES_FLAT.find(
          (c) => c.toLowerCase() === revitCategoryRaw.toLowerCase()
        ) ?? revitCategoryRaw;
        return {
          id: uid(),
          gubimCode,
          equipCode: code,
          equipName: name,
          needsTable: needs,
          tableCode: needs && code ? "T" + code : "",
          tableName,
          fieldCols,
          parentEquipCode,
          revitCategory,
          createdAt: Date.now(),
        };
      }).filter((e) => e.equipName);

      // Deduplicate by gubimCode + equipCode combination (identity key)
      // An equipment already exists if same gubimCode AND same equipCode are both present
      const existingKeys = new Set(
        items.map((e) => `${e.gubimCode}::${e.equipCode}`).filter((k) => !k.startsWith("::"))
      );
      const skipped: string[] = [];
      const seenInFile = new Set<string>();
      arr.forEach((e) => {
        const key = `${e.gubimCode}::${e.equipCode}`;
        if (e.equipCode) {
          if (existingKeys.has(key) || seenInFile.has(key)) {
            skipped.push(e.equipName + (e.equipCode ? ` (${e.equipCode})` : ""));
          }
          seenInFile.add(key);
        }
      });

      const toImport = arr.filter((e) => {
        const key = `${e.gubimCode}::${e.equipCode}`;
        return !existingKeys.has(key);
      });
      // Also deduplicate within the file itself (keep first occurrence)
      const seenKeys = new Set<string>();
      const deduped = toImport.filter((e) => {
        const key = `${e.gubimCode}::${e.equipCode}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      addMany(deduped).then(() => {
        const imported = deduped.length;
        if (skipped.length > 0) {
          toast.warning(
            `${imported} equips importats · ${skipped.length} no importats per codi duplicat: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? ` i ${skipped.length - 5} més` : ""}`
          );
        } else {
          toast.success(`${imported} equips importats correctament`);
        }
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Error important equips: ${msg.slice(0, 120)}`);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error processant el fitxer: ${msg.slice(0, 120)}`);
    }
  }, [items, addMany]);

  return (
    // PERF FIX CRÍTIC: UNA sola instància de TooltipProvider per a TOTA la taula
    // Abans: 2-3 TooltipProvider per fila × N files = centenars de mount/unmount
    // en cada click → bloquejava el fil principal 736ms (INP mesurat al DevTools)
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca equips…" className="pl-8 pr-8" />
            {q && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setQ("")}><X className="h-3 w-3" /></Button>}
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={exportXlsx} disabled={loading}>
            <Download className="h-4 w-4" /> Exporta
          </Button>
          <Button size="sm" variant="outline" onClick={exportRosimanXlsx} disabled={loading}>
            <Download className="h-4 w-4" /> Rosmiman
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={loading}>
              <Upload className="h-4 w-4" /> Importa
            </Button>
          )}
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.currentTarget.value = ""; }}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={!canEdit || loading}>
                <Trash2 className="h-4 w-4" /> Esborra tot
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Esborrar tots els equips?</AlertDialogTitle>
                <AlertDialogDescription>Aquesta acció no es pot desfer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  try { await clearAll(); toast.success("Equips esborrats"); }
                  catch { toast.error("Error esborrant equips"); }
                }}>
                  Esborra
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {canEdit && (
            <Button
              size="sm" className="bg-[#0099A8] hover:bg-[#006E7A]" disabled={loading}
              onClick={() => { setEditing(null); setFormOpen(true); }}
            >
              <Plus className="h-4 w-4" /> Nou equip
            </Button>
          )}
        </div>

        {error && !loading && (
          <div className="flex items-center gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="flex-1 text-destructive">{error}</span>
            <Button size="sm" variant="outline" onClick={retry} className="shrink-0 h-7">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Reintenta
            </Button>
          </div>
        )}

        <div className="border rounded-md overflow-auto bg-card" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <colgroup>
                <col style={{ width: 260 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 110 }} />
              </colgroup>
            <thead className="sticky top-0 z-10 bg-white border-b shadow-sm">
              <tr className="text-left">
                <th className="p-2 text-xs font-semibold">GuBIMClass</th>
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
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="p-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="p-2"><Skeleton className="h-4 w-40" /></td>
                    <td className="p-2"><Skeleton className="h-5 w-10 rounded-full" /></td>
                    <td className="p-2"><Skeleton className="h-4 w-14" /></td>
                    <td className="p-2"><Skeleton className="h-4 w-24" /></td>
                    <td className="p-2 text-center"><Skeleton className="h-5 w-8 mx-auto rounded-full" /></td>
                    <td className="p-2"><Skeleton className="h-7 w-20" /></td>
                  </tr>
                ))
              ) : (
                <>
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
                    const isFirstInGroup = sharedCodeInfo.firstInGroup.has(e.id);
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
                        onView={handleView(e)}
                        onEdit={handleEdit(e)}
                        onDelete={handleDelete(e)}
                        canEdit={canEdit}
                      />
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Cap equip</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        <EquipmentFormDialog
          open={formOpen} onOpenChange={setFormOpen} editing={editing}
          nodes={nodes} nodeMap={nodeMap} fields={fields} fieldMap={fieldMap}
          isCodeTaken={isEquipCodeTaken} allEquipments={items}
          onSubmit={async (e) => {
            try {
              await upsert(e);
              toast.success(editing ? "Equip actualitzat" : "Equip creat");
              setEditing(null);
              setFormOpen(false);
              if (viewing && viewing.id === e.id) setViewing(e);
            } catch (err) {
              toast.error("Error desant equip");
              throw err; // re-llança perquè el fill pugui fer setSaving(false)
            }
          }}
        />

        <EquipmentDetailDialog
          open={detailOpen} onOpenChange={setDetailOpen}
          equipment={viewing} nodeMap={nodeMap} fieldMap={fieldMap} fields={fields}
          onEdit={() => { setDetailOpen(false); setEditing(viewing); setFormOpen(true); }}
        />


      </div>
    </TooltipProvider>
  );
}
