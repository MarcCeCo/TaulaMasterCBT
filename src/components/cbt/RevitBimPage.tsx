// src/components/cbt/RevitBimPage.tsx
//
// Pàgina fusionada "Revit & BIM" — substitueix RevitExportPage + BimPortalPage.
// Dues pestanyes:
//   · Portal BIM   — documentació, descàrregues i famílies .rfa per a modeladors
//   · Exportació   — taula d'equips exportables + generació JSON per a admins/editors
//
// Permisos: view="revit" (igual que les dues pàgines originals)

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useDataStore } from "@/lib/dataStore";
import { useAuth } from "@/lib/auth";
import { useDebounce } from "@/hooks/useDebounce";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle, BookOpen, Box, Building2, Cable, Columns3,
  Download, Droplets, FileSpreadsheet, FileText, Flame, FolderOpen,
  Lightbulb, Package, Pipette, Radio, RefreshCw, Settings2,
  Shield, Thermometer, Waves, Wind, WrapText, Zap,
} from "lucide-react";
import { REVIT_CATEGORIES_FLAT } from "./EquipmentFormDialog";

// ─── CATEGORY_CONFIG (únic, compartit) ───────────────────────────────────────
// PERF: icones instanciades UNA sola vegada fora del component → no es recreen en cada render
export const CATEGORY_CONFIG: Record<
  string,
  { label: string; template: string; color: string; icon: React.ReactNode; group: string }
> = {
  "Mechanical Equipment":       { label: "Mechanical Equipment",       template: "Metric Mechanical Equipment.rft",       color: "bg-blue-50 text-blue-700 border-blue-200",       icon: <Box className="h-3.5 w-3.5" />,         group: "Mecànica / MEP" },
  "Specialty Equipment":        { label: "Specialty Equipment",        template: "Metric Specialty Equipment.rft",        color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: <Settings2 className="h-3.5 w-3.5" />,    group: "Mecànica / MEP" },
  "Plumbing Fixtures":          { label: "Plumbing Fixtures",          template: "Metric Plumbing Fixture.rft",           color: "bg-cyan-50 text-cyan-700 border-cyan-200",       icon: <Droplets className="h-3.5 w-3.5" />,    group: "Mecànica / MEP" },
  "Mechanical Control Devices": { label: "Mechanical Control Devices", template: "Metric Mechanical Control Device.rft",  color: "bg-sky-50 text-sky-700 border-sky-200",          icon: <Thermometer className="h-3.5 w-3.5" />, group: "Mecànica / MEP" },
  "Air Terminals":              { label: "Air Terminals",              template: "Metric Air Terminal.rft",               color: "bg-teal-50 text-teal-700 border-teal-200",       icon: <Wind className="h-3.5 w-3.5" />,        group: "Mecànica / MEP" },
  "Fire Protection":            { label: "Fire Protection",            template: "Metric Fire Protection.rft",            color: "bg-red-50 text-red-700 border-red-200",          icon: <Flame className="h-3.5 w-3.5" />,       group: "Mecànica / MEP" },
  "Sprinklers":                 { label: "Sprinklers",                 template: "Metric Sprinkler.rft",                  color: "bg-orange-50 text-orange-700 border-orange-200", icon: <Waves className="h-3.5 w-3.5" />,       group: "Mecànica / MEP" },
  "Pipe Accessories":           { label: "Pipe Accessories",           template: "Metric Pipe Accessory.rft",             color: "bg-teal-50 text-teal-700 border-teal-200",       icon: <Pipette className="h-3.5 w-3.5" />,     group: "Canonades" },
  "Pipe Fittings":              { label: "Pipe Fittings",              template: "Metric Pipe Fitting.rft",               color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <WrapText className="h-3.5 w-3.5" />, group: "Canonades" },
  "Pipes":                      { label: "Pipes",                      template: "Metric Pipe.rft",                       color: "bg-green-50 text-green-700 border-green-200",    icon: <Waves className="h-3.5 w-3.5" />,       group: "Canonades" },
  "Duct Accessories":           { label: "Duct Accessories",           template: "Metric Duct Accessory.rft",             color: "bg-violet-50 text-violet-700 border-violet-200", icon: <Wind className="h-3.5 w-3.5" />,        group: "Conductes" },
  "Duct Fittings":              { label: "Duct Fittings",              template: "Metric Duct Fitting.rft",               color: "bg-purple-50 text-purple-700 border-purple-200", icon: <WrapText className="h-3.5 w-3.5" />,    group: "Conductes" },
  "Ducts":                      { label: "Ducts",                      template: "Metric Duct.rft",                       color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", icon: <Wind className="h-3.5 w-3.5" />,     group: "Conductes" },
  "Electrical Equipment":       { label: "Electrical Equipment",       template: "Metric Electrical Equipment.rft",       color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: <Zap className="h-3.5 w-3.5" />,         group: "Elèctrica" },
  "Electrical Fixtures":        { label: "Electrical Fixtures",        template: "Metric Electrical Fixture.rft",         color: "bg-amber-50 text-amber-700 border-amber-200",    icon: <Zap className="h-3.5 w-3.5" />,         group: "Elèctrica" },
  "Lighting Fixtures":          { label: "Lighting Fixtures",          template: "Metric Lighting Fixture.rft",           color: "bg-yellow-50 text-yellow-600 border-yellow-200", icon: <Lightbulb className="h-3.5 w-3.5" />,   group: "Elèctrica" },
  "Lighting Devices":           { label: "Lighting Devices",           template: "Metric Lighting Device.rft",            color: "bg-lime-50 text-lime-700 border-lime-200",       icon: <Lightbulb className="h-3.5 w-3.5" />,   group: "Elèctrica" },
  "Communication Devices":      { label: "Communication Devices",      template: "Metric Communication Device.rft",       color: "bg-slate-50 text-slate-600 border-slate-200",    icon: <Radio className="h-3.5 w-3.5" />,       group: "Elèctrica" },
  "Data Devices":               { label: "Data Devices",               template: "Metric Data Device.rft",                color: "bg-slate-50 text-slate-600 border-slate-200",    icon: <Radio className="h-3.5 w-3.5" />,       group: "Elèctrica" },
  "Fire Alarm Devices":         { label: "Fire Alarm Devices",         template: "Metric Fire Alarm Device.rft",          color: "bg-red-50 text-red-600 border-red-200",          icon: <Flame className="h-3.5 w-3.5" />,       group: "Elèctrica" },
  "Security Devices":           { label: "Security Devices",           template: "Metric Security Device.rft",            color: "bg-slate-50 text-slate-700 border-slate-200",    icon: <Shield className="h-3.5 w-3.5" />,      group: "Elèctrica" },
  "Cable Trays":                { label: "Cable Trays",                template: "Metric Cable Tray.rft",                 color: "bg-zinc-50 text-zinc-600 border-zinc-200",       icon: <Cable className="h-3.5 w-3.5" />,       group: "Elèctrica" },
  "Conduits":                   { label: "Conduits",                   template: "Metric Conduit.rft",                    color: "bg-zinc-50 text-zinc-600 border-zinc-200",       icon: <Cable className="h-3.5 w-3.5" />,       group: "Elèctrica" },
  "Structural Columns":         { label: "Structural Columns",         template: "Metric Structural Column.rft",          color: "bg-stone-50 text-stone-600 border-stone-200",    icon: <Columns3 className="h-3.5 w-3.5" />,    group: "Estructura" },
  "Structural Framing":         { label: "Structural Framing",         template: "Metric Structural Framing.rft",         color: "bg-stone-50 text-stone-600 border-stone-200",    icon: <Columns3 className="h-3.5 w-3.5" />,    group: "Estructura" },
  "Generic Models":             { label: "Generic Models",             template: "Metric Generic Model.rft",              color: "bg-gray-50 text-gray-600 border-gray-200",       icon: <Box className="h-3.5 w-3.5" />,         group: "Arquitectura / General" },
};

export const VALID_CATEGORIES = new Set(REVIT_CATEGORIES_FLAT);

function toFileName(nom: string): string {
  return nom.toUpperCase().replace(/\s+/g, "-");
}

function buildRfaName(equipName: string, parentName: string | null, equipCode: string): string {
  const nomComplet = parentName ? `${parentName} ${equipName}` : equipName;
  return `CBT_${toFileName(nomComplet)}_${equipCode.toUpperCase()}.rfa`;
}

// ─── Fila de la taula memoritzada ─────────────────────────────────────────────
// PERF FIX: memo() evita re-renderitzar cada fila quan canvia el scroll o
// qualsevol altre estat del pare que no afecta la fila concreta
type EquipRow = {
  eq: { id: string; equipCode: string; equipName: string; parentEquipCode?: string; revitCategory?: string };
  parentName: string | null;
  cat: string;
  hasValidCat: boolean;
  rfaName: string | null;
};

const RfaTableRow = memo(function RfaTableRow({
  row, onDownload,
}: {
  row: EquipRow;
  onDownload: (rfaName: string) => void;
}) {
  const { eq, parentName, cat, hasValidCat, rfaName } = row;
  const fullName = parentName ? `${parentName} ${eq.equipName}` : eq.equipName;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50">
      <td className="py-2.5 px-3 font-mono text-xs text-slate-600">{eq.equipCode}</td>
      <td className="py-2.5 px-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-slate-800">{fullName}</span>
          {cat && <span className="text-[11px] text-slate-400">{cat}</span>}
        </div>
      </td>
      <td className="py-2.5 px-3">
        {rfaName ? (
          <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{rfaName}</span>
        ) : (
          <span className="text-[11px] text-amber-500 italic">Sense categoria Revit</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-[#0099A8] hover:bg-[#0099A8]/10" onClick={() => onDownload(rfaName!)}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Descarregar {rfaName}</TooltipContent>
        </Tooltip>
      </td>
    </tr>
  );
});

// ─── Component ────────────────────────────────────────────────────────────────

// PERF: les targetes de documentació son estàtiques — memo() evita que es
// re-renderitzin quan canvia la cerca o el scroll de la taula de famílies
const DocumentacioCards = memo(function DocumentacioCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card className="border-0 shadow-sm bg-white">
        <CardHeader className="pb-2 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#0099A8]" />
            Manual BIM
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">CBT_MANUAL BIM</p>
              <p className="text-xs text-slate-500 mt-0.5">Protocol, estàndards i requisits de lliurament</p>
            </div>
            <a href="/docs/CBT_MANUAL BIM.pdf" download>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> PDF
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm bg-white">
        <CardHeader className="pb-2 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[#0099A8]" />
            PEB — Pla d'Execució BIM
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">CBT_PEB.xlsm</p>
              <p className="text-xs text-slate-500 mt-0.5">Pla d'Execució BIM del Consorci Besòs Tordera</p>
            </div>
            <a href="/docs/CBT_PEB.xlsm" download>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> Excel
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm bg-white">
        <CardHeader className="pb-2 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
            <Package className="h-4 w-4 text-[#0099A8]" />
            Plantilla de projecte
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">CBT_PLANTILLA.rte</p>
              <p className="text-xs text-slate-500 mt-0.5">Vistes, fulls i paràmetres CBT preconfigurats</p>
            </div>
            <a href="/templates/CBT_PLANTILLA.rte" download>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> .rte
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export function RevitBimPage() {
  // PERF FIX: desacoblament loading/error del contingut estàtic.
  // Les targetes de documentació (Manual, PEB, Plantilla, FamiliesKit) no
  // depenen dels equips — es mostren immediatament sense esperar el DataStore.
  // Només la taula de famílies .rfa espera que els equips estiguin carregats.
  const { equipments, loading, error, retry } = useDataStore();
  const { canSeeView } = useAuth();
  const canSee = canSeeView("revit");

  const [search, setSearch] = useState("");

  // PERF: virtualització de la taula .rfa
  const ROW_H = 53;
  const OVERSCAN = 8;
  const TABLE_MAX_H = 520;
  const [scrollTop, setScrollTop] = useState(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // PERF FIX: debounce de 200ms — la cerca no recalcula equipRows a cada tecla
  const debouncedSearch = useDebounce(search, 200);

  // ── Mapa equipCode → nom i id → nom (per pares sense codi) ──
  const equipByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const eq of equipments) {
      if (eq.equipCode) m.set(eq.equipCode, eq.equipName);
      m.set(eq.id, eq.equipName); // sempre per id, per pares sense codi
    }
    return m;
  }, [equipments]);

  // ── Files Portal BIM — només famílies disponibles per descarregar ──
  const equipRows = useMemo<EquipRow[]>(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return equipments
      .filter((eq) => {
        // Filtre 1: ha de tenir categoria Revit vàlida i codi (família disponible)
        const cat = eq.revitCategory?.trim() ?? "";
        const hasValidCat = !!cat && VALID_CATEGORIES.has(cat);
        if (!hasValidCat || !eq.equipCode) return false;
        // Filtre 2: cerca textual
        if (!q) return true;
        const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? "" : "";
        const fullName = parentName ? `${parentName} ${eq.equipName}` : eq.equipName;
        return fullName.toLowerCase().includes(q) || (eq.equipCode ?? "").toLowerCase().includes(q);
      })
      .map((eq) => {
        const cat = eq.revitCategory!.trim();
        const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? null : null;
        const rfaName = buildRfaName(eq.equipName, parentName, eq.equipCode!);
        return { eq, parentName, cat, hasValidCat: true, rfaName };
      });
  }, [equipments, equipByCode, debouncedSearch]);

  const totalAmbFamilia = useMemo(() => equipRows.filter((r) => r.rfaName).length, [equipRows]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  // PERF FIX: useCallback → referència estable → RfaTableRow (memo) no es re-renderitza
  const handleRfaDownload = useCallback((rfaName: string) => {
    const a = document.createElement("a");
    a.href = `/families/${rfaName}`;
    a.download = rfaName;
    a.click();
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!canSee) {
    return (
      <Card className="p-12 border-0 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
        <p className="font-semibold text-slate-700">Accés restringit</p>
        <p className="text-sm text-muted-foreground">No tens permisos per accedir a aquesta secció.</p>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* ── Capçalera ────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[#0099A8]" />
            Documentació BIM
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Documentació, eines i recursos BIM del Consorci Besòs Tordera
          </p>
        </div>

        {/* ── Targetes de documentació (estàtiques, no esperen loading) ────── */}
        <DocumentacioCards />

        {/* ── Taula famílies .rfa ───────────────────────────────────────────── */}
        <Card className="border-0 shadow-sm bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
                <Box className="h-4 w-4 text-[#0099A8]" />
                Famílies .rfa per equip
                {!loading && (
                  <Badge className="ml-1 bg-[#0099A8]/10 text-[#006E7A] border-0 text-xs">{totalAmbFamilia} disponibles</Badge>
                )}
              </CardTitle>
              <input
                type="text" placeholder="Cerca per nom o codi…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="text-sm border border-slate-200 rounded-md px-3 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-[#0099A8] bg-white"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              // PERF: skeleton de files mentre carreguen els equips —
              // la resta de la pàgina ja és visible i interactuable
              <div className="divide-y divide-slate-100">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-3 py-3 animate-pulse">
                    <div className="h-3 w-16 bg-slate-100 rounded" />
                    <div className="h-3 flex-1 bg-slate-100 rounded" />
                    <div className="h-3 w-40 bg-slate-100 rounded" />
                    <div className="h-7 w-7 bg-slate-100 rounded ml-auto" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <AlertCircle className="h-8 w-8 text-red-400" />
                <p className="text-sm text-slate-600">Error carregant les famílies</p>
                <Button variant="outline" size="sm" onClick={retry}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Reintentar
                </Button>
              </div>
            ) : (
              // PERF: virtualització — renderitzem només les files visibles
              <div
                ref={tableContainerRef}
                className="overflow-auto"
                style={{ maxHeight: TABLE_MAX_H }}
                onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
              >
                <table className="w-full text-sm">
                  <colgroup>
                    <col style={{ width: 100 }} />
                    <col />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 60 }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-xs font-semibold text-slate-500 px-3 py-2 text-left">Codi</th>
                      <th className="text-xs font-semibold text-slate-500 px-3 py-2 text-left">Equip</th>
                      <th className="text-xs font-semibold text-slate-500 px-3 py-2 text-left">Fitxer .rfa</th>
                      <th className="text-xs font-semibold text-slate-500 px-3 py-2 text-right">Família</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipRows.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-12 text-sm text-slate-400">
                        {debouncedSearch ? "Cap família trobada per aquesta cerca" : "Cap família disponible per descarregar"}
                      </td></tr>
                    ) : (() => {
                      const containerH = tableContainerRef.current?.clientHeight ?? TABLE_MAX_H;
                      const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
                      const endIdx   = Math.min(equipRows.length - 1, Math.ceil((scrollTop + containerH) / ROW_H) + OVERSCAN);
                      const padTop   = startIdx * ROW_H;
                      const padBot   = Math.max(0, (equipRows.length - endIdx - 1) * ROW_H);
                      return (
                        <>
                          {padTop > 0 && <tr><td colSpan={4} style={{ height: padTop, padding: 0 }} /></tr>}
                          {equipRows.slice(startIdx, endIdx + 1).map((row) => (
                            <RfaTableRow key={row.eq.id} row={row} onDownload={handleRfaDownload} />
                          ))}
                          {padBot > 0 && <tr><td colSpan={4} style={{ height: padBot, padding: 0 }} /></tr>}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </TooltipProvider>
  );
}
