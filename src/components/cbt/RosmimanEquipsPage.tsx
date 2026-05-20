// src/components/cbt/RosmimanEquipsPage.tsx
// Llistat d'equips donats d'alta a Rosmiman.
// Permet importar des d'Excel (col A = TAG, col B = descripció)
// i consultar-los per evitar duplicitats de TAG en crear projectes.

import { useRef, useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";

// PERF: xlsx (≈750 KB) carregat lazily — només quan l'usuari importa un fitxer
async function getXLSX() {
  const mod = await import("xlsx");
  return mod.default ?? mod;
}

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, Trash2, Search, ClipboardList, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectes, type RosmimanEquip } from "@/lib/useProjectes";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

// Regex del format de TAG vàlid: XXXXX_YYYYY_NNNL
// XXXXX = codi instal·lació (5 alfanumèrics)
// YYYYY = codi equip (1+ alfanumèrics)
// NNN   = CCM (1 dígit) + Funció (2 dígits)
// L     = Duplicitat (1 lletra)
const TAG_REGEX = /^[A-Z0-9]{5}_[A-Z0-9]+_\d{3}[A-Z]$/i;

function isTagValid(tag: string): boolean {
  return TAG_REGEX.test(tag.trim());
}

function extractCodiInstallacio(tag: string): string {
  return tag.trim().substring(0, 5).toUpperCase();
}

// ─── component ────────────────────────────────────────────────────────────────

export function RosmimanEquipsPage() {
  const { canEditView } = useAuth();
  const canEdit = canEditView("rosmiman");
  const {
    rosmimanEquips,
    loadingRosmiman,
    importRosmimanEquips,
    deleteRosmimanEquip,
    clearRosmimanEquips,
    loading,
    error,
    retry,
  } = useProjectes();

  const fileRef = useRef<HTMLInputElement>(null);
  const [cerca, setCerca] = useState("");
  const [dialogEsborrarTot, setDialogEsborrarTot] = useState(false);
  const [dialogEsborrarUn, setDialogEsborrarUn] = useState<RosmimanEquip | null>(null);
  const [importPreview, setImportPreview] = useState<{ valid: RosmimanEquip[]; invalids: string[] } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // PERF: virtualització — constants
  const ROW_H = 41;       // altura aprox. de cada fila d'equip (px)
  const HEADER_H = 34;    // altura de la capçalera de grup (px)
  const OVERSCAN = 6;
  const CONTAINER_H = 520;
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Filtrat i agrupació per codi d'instal·lació ───────────────────────────
  const debouncedCerca = useDebounce(cerca, 200);

  const equipsFiltered = useMemo(() => {
    const q = debouncedCerca.trim().toLowerCase();
    if (!q) return rosmimanEquips;
    return rosmimanEquips.filter(e =>
      e.tag.toLowerCase().includes(q) ||
      e.descripcio.toLowerCase().includes(q) ||
      e.codiInstallacio.toLowerCase().includes(q)
    );
  }, [rosmimanEquips, debouncedCerca]);

  const grups = useMemo(() => {
    const map = new Map<string, RosmimanEquip[]>();
    for (const e of equipsFiltered) {
      const grp = map.get(e.codiInstallacio) ?? [];
      grp.push(e);
      map.set(e.codiInstallacio, grp);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [equipsFiltered]);

  // PERF: llista aplanada per a la virtualització
  // Cada element pot ser: { type: "header", codi, total } | { type: "row", equip, lastInGroup }
  type VirtualItem =
    | { type: "header"; codi: string; total: number; h: number }
    | { type: "row"; equip: RosmimanEquip; lastInGroup: boolean; h: number };

  const virtualItems = useMemo<VirtualItem[]>(() => {
    const items: VirtualItem[] = [];
    for (const [codi, equips] of grups) {
      items.push({ type: "header", codi, total: equips.length, h: HEADER_H });
      equips.forEach((equip, i) =>
        items.push({ type: "row", equip, lastInGroup: i === equips.length - 1, h: ROW_H })
      );
    }
    return items;
  }, [grups]);

  // ── Importació Excel ──────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const XLSX = await getXLSX();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        const valid: RosmimanEquip[] = [];
        const invalids: string[] = [];

        for (const row of rows) {
          const tagRaw = String(row[0] ?? "").trim();
          const desc   = String(row[1] ?? "").trim();
          if (!tagRaw) continue;

          if (isTagValid(tagRaw)) {
            valid.push({
              id:              "",
              tag:             tagRaw.toUpperCase(),
              descripcio:      desc,
              codiInstallacio: extractCodiInstallacio(tagRaw),
              createdAt:       0,
            });
          } else {
            invalids.push(tagRaw);
          }
        }

        setImportPreview({ valid, invalids });
    } catch {
      toast.error("Error llegint el fitxer Excel.");
    }
  }

  async function confirmarImport() {
    if (!importPreview) return;
    setImportLoading(true);
    try {
      const { inserted, skipped } = await importRosmimanEquips(importPreview.valid);
      toast.success(`Importació completada: ${inserted} nous, ${skipped} ja existien.`);
      setImportPreview(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Error en la importació.");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleEsborrarUn(equip: RosmimanEquip) {
    try {
      await deleteRosmimanEquip(equip.id);
      toast.success("Equip eliminat.");
    } catch (e: any) {
      toast.error(e?.message ?? "Error en eliminar l'equip.");
    }
    setDialogEsborrarUn(null);
  }

  async function handleEsborrarTot() {
    try {
      await clearRosmimanEquips();
      toast.success("Llistat buidat.");
    } catch (e: any) {
      toast.error(e?.message ?? "Error en buidar el llistat.");
    }
    setDialogEsborrarTot(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        Carregant…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <Button size="sm" variant="outline" onClick={retry}>
          <RefreshCw className="h-4 w-4 mr-2" /> Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Capçalera */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-[#0099A8]" />
            Llistat d'equips Rosmiman
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Equips donats d'alta a Rosmiman · {rosmimanEquips.length} registres
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {rosmimanEquips.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => setDialogEsborrarTot(true)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Buidar llistat
              </Button>
            )}
            <Button
              size="sm"
              className="bg-[#0099A8] hover:bg-[#006E7A] text-white"
              onClick={() => fileRef.current?.click()}
              disabled={loadingRosmiman}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Importar Excel
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.ods"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>

      {/* Preview importació */}
      {importPreview && (
        <Card className="p-4 border-amber-200 bg-amber-50 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Previsualització de la importació
          </div>
          <div className="text-sm text-slate-700 space-y-1">
            <p>
              <span className="font-medium text-emerald-700">{importPreview.valid.length}</span> equips vàlids a importar
              {importPreview.invalids.length > 0 && (
                <span className="ml-3 text-red-600 font-medium">
                  · {importPreview.invalids.length} files ignorades (format TAG invàlid)
                </span>
              )}
            </p>
            {importPreview.invalids.length > 0 && (
              <p className="text-xs text-slate-500">
                Files ignorades: {importPreview.invalids.slice(0, 5).join(", ")}
                {importPreview.invalids.length > 5 && ` i ${importPreview.invalids.length - 5} més`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-[#0099A8] hover:bg-[#006E7A] text-white"
              onClick={confirmarImport}
              disabled={importLoading || importPreview.valid.length === 0}
            >
              {importLoading ? "Important…" : "Confirmar importació"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportPreview(null)}
              disabled={importLoading}
            >
              Cancel·lar
            </Button>
          </div>
        </Card>
      )}

      {/* Cerca */}
      {rosmimanEquips.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Cerca TAG, descripció o codi…"
            value={cerca}
            onChange={e => setCerca(e.target.value)}
          />
        </div>
      )}

      {/* Taula agrupada per codi d'instal·lació */}
      {rosmimanEquips.length === 0 ? (
        <Card className="p-12 border-0 shadow-sm bg-white flex flex-col items-center gap-3 text-center">
          <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
            <ClipboardList className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">Llistat buit</p>
            <p className="text-sm text-slate-500 mt-1">
              Importa un Excel amb la columna A (TAG) i la columna B (descripció).
            </p>
          </div>
          {canEdit && (
            <Button
              size="sm"
              className="mt-2 bg-[#0099A8] hover:bg-[#006E7A] text-white"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1.5" /> Importar Excel
            </Button>
          )}
        </Card>
      ) : grups.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          Cap equip coincideix amb la cerca.
        </p>
      ) : (
        // PERF: virtualització — renderitzem només els elements visibles de la llista aplanada
        // Cada vegada que l'usuari fa scroll, recalculem el rang visible amb O(n) mínim
        <Card className="border-0 shadow-sm bg-white overflow-hidden">
          <div
            ref={containerRef}
            className="overflow-y-auto"
            style={{ maxHeight: CONTAINER_H }}
            onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          >
            {(() => {
              // Calculem offset acumulat per trobar el rang visible
              let offset = 0;
              const offsets: number[] = virtualItems.map((item) => {
                const cur = offset;
                offset += item.h;
                return cur;
              });
              const totalH = offset;

              const startIdx = Math.max(0, offsets.findLastIndex((o) => o <= scrollTop - OVERSCAN * ROW_H));
              const endIdx   = Math.min(
                virtualItems.length - 1,
                offsets.findIndex((o) => o >= scrollTop + CONTAINER_H + OVERSCAN * ROW_H) !== -1
                  ? offsets.findIndex((o) => o >= scrollTop + CONTAINER_H + OVERSCAN * ROW_H)
                  : virtualItems.length - 1
              );

              const padTop = offsets[startIdx] ?? 0;
              const padBot = Math.max(0, totalH - (offsets[endIdx] ?? 0) - (virtualItems[endIdx]?.h ?? 0));
              const visible = virtualItems.slice(startIdx, endIdx + 1);

              return (
                <div style={{ paddingTop: padTop, paddingBottom: padBot }}>
                  {visible.map((item, i) => {
                    const key = item.type === "header" ? `h-${item.codi}` : `r-${item.equip.id}`;
                    if (item.type === "header") {
                      const isFirst = startIdx + i === 0 || virtualItems[startIdx + i - 1]?.type === "row";
                      return (
                        <div key={key} className={cn(
                          "flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100",
                          isFirst ? "border-t-0" : "border-t border-slate-200"
                        )}>
                          <Badge className="bg-[#0099A8]/15 text-[#006E7A] border-0 font-mono text-xs">
                            {item.codi}
                          </Badge>
                          <span className="text-xs text-slate-500 font-medium">
                            {item.total} equip{item.total !== 1 ? "s" : ""}
                          </span>
                        </div>
                      );
                    }
                    const { equip, lastInGroup } = item;
                    return (
                      <div
                        key={key}
                        className={cn(
                          "flex items-center border-b border-slate-50 hover:bg-slate-50/70 transition-colors",
                          lastInGroup && "border-b-0"
                        )}
                        style={{ height: ROW_H }}
                      >
                        <span className="px-4 font-mono text-xs text-slate-700 w-56 shrink-0 truncate">
                          {equip.tag}
                        </span>
                        <span className="px-4 text-slate-600 flex-1 text-sm truncate">
                          {equip.descripcio || <span className="text-slate-300 italic">sense descripció</span>}
                        </span>
                        {canEdit && (
                          <div className="px-3 shrink-0">
                            <button
                              className="h-7 w-7 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              onClick={() => setDialogEsborrarUn(equip)}
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </Card>
      )}

      {/* Dialog esborrar un */}
      <AlertDialog open={!!dialogEsborrarUn} onOpenChange={o => !o && setDialogEsborrarUn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar equip?</AlertDialogTitle>
            <AlertDialogDescription>
              S'eliminarà <span className="font-mono font-semibold">{dialogEsborrarUn?.tag}</span> del llistat Rosmiman.
              Això no afecta els tags dels projectes existents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => dialogEsborrarUn && handleEsborrarUn(dialogEsborrarUn)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog buidar tot */}
      <AlertDialog open={dialogEsborrarTot} onOpenChange={setDialogEsborrarTot}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buidar tot el llistat?</AlertDialogTitle>
            <AlertDialogDescription>
              S'eliminaran tots els {rosmimanEquips.length} equips del llistat Rosmiman.
              Aquesta acció no es pot desfer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleEsborrarTot}
            >
              Buidar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
