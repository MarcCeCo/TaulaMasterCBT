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
  AlertCircle, BookOpen, Box, Building2, Cable, CheckCircle2, Columns3,
  Download, Droplets, FileSpreadsheet, FileText, Flame, FolderOpen,
  Info, Lightbulb, Package, Pipette, Radio, RefreshCw, Settings2,
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

const VALID_CATEGORIES = new Set(REVIT_CATEGORIES_FLAT);

function toFileName(nom: string): string {
  return nom.toUpperCase().replace(/\s+/g, "-");
}

function buildRfaName(equipName: string, parentName: string | null, equipCode: string): string {
  const nomComplet = parentName ? `${parentName} ${equipName}` : equipName;
  return `CBT_${toFileName(nomComplet)}_${equipCode.toUpperCase()}.rfa`;
}

// ─── ZIP builder (sense dependències) ────────────────────────────────────────
function crc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function u16le(n: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
function u32le(n: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }

async function buildZip(entries: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32le(crc), ...u32le(size), ...u32le(size),
      ...u16le(nameBytes.length), 0, 0, ...nameBytes,
    ]);
    const cdEntry = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32le(crc), ...u32le(size), ...u32le(size),
      ...u16le(nameBytes.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32le(offset), ...nameBytes,
    ]);
    centralDir.push(cdEntry);
    parts.push(localHeader, entry.data);
    offset += localHeader.length + size;
  }
  const cdOffset = offset;
  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0,
    ...u16le(entries.length), ...u16le(entries.length),
    ...u32le(cdSize), ...u32le(cdOffset), 0, 0,
  ]);
  const allParts = [...parts, ...centralDir, eocd];
  const total = allParts.reduce((s, b) => s + b.length, 0);
  const buf = new Uint8Array(total);
  let pos = 0;
  for (const p of allParts) { buf.set(p, pos); pos += p.length; }
  return new Blob([buf], { type: "application/zip" });
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
        {hasValidCat && rfaName ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-[#0099A8] hover:bg-[#0099A8]/10" onClick={() => onDownload(rfaName)}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Descarregar {rfaName}</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span><Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300" disabled><Download className="h-3.5 w-3.5" /></Button></span>
            </TooltipTrigger>
            <TooltipContent>Assigna una categoria Revit per habilitar la descàrrega</TooltipContent>
          </Tooltip>
        )}
      </td>
    </tr>
  );
});

// ─── Component ────────────────────────────────────────────────────────────────

// PERF: les targetes de documentació son estàtiques — memo() evita que es
// re-renderitzin quan canvia la cerca o el scroll de la taula de famílies
const DocumentacioCards = memo(function DocumentacioCards({
  kitDownloaded, onKitDownload,
}: {
  kitDownloaded: boolean;
  onKitDownload: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Columna esquerra */}
      <div className="space-y-4">
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
                <p className="text-sm font-medium text-slate-800">Manual BIM CBT v2.x</p>
                <p className="text-xs text-slate-500 mt-0.5">Protocol, estàndards i requisits de lliurament</p>
              </div>
              <a href="/docs/CBT_MANUAL-BIM.pdf" download>
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
                <p className="text-sm font-medium text-slate-800">PEB_CBT.xlsm</p>
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

      {/* Columna dreta */}
      <div className="space-y-4">
        <Card className="border-0 shadow-sm bg-white">
          <CardHeader className="pb-2 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
              <Package className="h-4 w-4 text-[#0099A8]" />
              Paquet de creació de famílies
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">CBT_FamiliesKit</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Script FULL + Script TEST + configuració JSON (generada ara)
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-[#006E7A] hover:bg-[#005a64] text-white gap-1.5 text-xs shrink-0"
                  onClick={onKitDownload}
                >
                  {kitDownloaded ? (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> Descarregat!</>
                  ) : (
                    <><Download className="h-3.5 w-3.5" /> Descarregar</>
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["FULL_script.py", "TEST_script.py", "CBT_Revit_Config.json", "README.txt"].map((f) => (
                  <span key={f} className="font-mono text-[11px] bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-600">{f}</span>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>El JSON es genera en el moment de la descàrrega i reflecteix l'estat actual de la Taula Master.</span>
              </div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">Flux d'ús recomanat</p>
              <ol className="text-xs text-blue-700 space-y-1 list-none">
                {[
                  ["1", "Llegeix el Manual BIM i el PEB del teu projecte"],
                  ["2", "Descarrega la plantilla .rte i configura Revit"],
                  ["3", "Descarrega el paquet CBT_FamiliesKit"],
                  ["4", "Executa TEST_script per validar l'ecosistema"],
                  ["5", "Si el TEST va bé, executa FULL_script"],
                ].map(([n, text]) => (
                  <li key={n} className="flex items-start gap-2">
                    <span className="h-4 w-4 rounded-full bg-[#0099A8] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-semibold">{n}</span>
                    {text}
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
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
  const [kitDownloaded, setKitDownloaded] = useState(false);

  // PERF: virtualització de la taula .rfa
  const ROW_H = 53;
  const OVERSCAN = 8;
  const TABLE_MAX_H = 520;
  const [scrollTop, setScrollTop] = useState(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // PERF FIX: debounce de 200ms — la cerca no recalcula equipRows a cada tecla
  const debouncedSearch = useDebounce(search, 200);

  // ── Mapa equipCode → nom (estable entre renders) ──
  const equipByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const eq of equipments) {
      if (eq.equipCode) m.set(eq.equipCode, eq.equipName);
    }
    return m;
  }, [equipments]);

  // ── Files Portal BIM ──
  const equipRows = useMemo<EquipRow[]>(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return equipments
      .filter((eq) => {
        if (!q) return true;
        const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? "" : "";
        const fullName = parentName ? `${parentName} ${eq.equipName}` : eq.equipName;
        return fullName.toLowerCase().includes(q) || (eq.equipCode ?? "").toLowerCase().includes(q);
      })
      .map((eq) => {
        const cat = eq.revitCategory?.trim() ?? "";
        const hasValidCat = !!cat && VALID_CATEGORIES.has(cat);
        const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? null : null;
        const rfaName = hasValidCat && eq.equipCode ? buildRfaName(eq.equipName, parentName, eq.equipCode) : null;
        return { eq, parentName, cat, hasValidCat, rfaName };
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

  const README_TEXT = `CBT FamiliesKit — Instruccions
================================
CONTINGUT:
  · CBT_Revit_Config.json  — Configuració generada automàticament
  · FULL_script.py         — Script pyRevit per crear TOTES les famílies
  · TEST_script.py         — Script pyRevit per crear 1 família per categoria (test)
  · README.txt             — Aquest fitxer

COM INSTAL·LAR:
  1. Guarda CBT_Revit_Config.json a: C:\\Users\\<usuari>\\Documents\\CBT_Revit_Config.json
  2. Guarda CBT_PARAMETRES-COMPARTITS.txt a: C:\\Users\\<usuari>\\Documents\\
  3. Copia els scripts a les rutes de pyRevit:
     TEST: %APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Families TEST.pushbutton\\script.py
     FULL: %APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Families FULL.pushbutton\\script.py
  4. Reinicia Revit i executa el botó "Crear Families TEST" per validar.
  5. Si el TEST va bé, executa "Crear Families FULL".

Compatible amb Revit 2020-2030.`;

  // PERF FIX: useCallback + reutilitza equipByCode ja calculat
  const handleKitDownload = useCallback(async () => {
    const enc = new TextEncoder();
    const exportableItems = equipments
      .filter((eq) => {
        if (!eq.needsTable) return false;
        const cat = eq.revitCategory?.trim() ?? "";
        return !!cat && VALID_CATEGORIES.has(cat);
      })
      .map((eq) => {
        const cat = eq.revitCategory!.trim();
        const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? null : null;
        const nomComplet = parentName ? `${parentName} ${eq.equipName}` : eq.equipName;
        return {
          nom: toFileName(nomComplet),
          cat,
          template: CATEGORY_CONFIG[cat]?.template ?? "Metric Generic Model.rft",
          equip_code: eq.equipCode ?? "",
          table_code: eq.tableCode ?? "",
        };
      });

    const config = {
      generated_at: new Date().toISOString(),
      output_folder: "%USERPROFILE%\\Documents\\Families_Output",
      shared_params_path: "%USERPROFILE%\\Documents\\CBT_PARAMETRES-COMPARTITS.txt",
      total: exportableItems.length,
      equipments: exportableItems,
    };

    const staticFiles = [
      { url: "/scripts/FULL_script.py", zipName: "FULL_script.py" },
      { url: "/scripts/TEST_script.py", zipName: "TEST_script.py" },
    ];
    const entries: { name: string; data: Uint8Array }[] = [
      { name: "CBT_Revit_Config.json", data: enc.encode(JSON.stringify(config, null, 2)) },
      { name: "README.txt", data: enc.encode(README_TEXT) },
    ];
    const results = await Promise.allSettled(
      staticFiles.map(({ url, zipName }) =>
        fetch(url).then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return { name: zipName, data: new Uint8Array(await r.arrayBuffer()) };
        })
      )
    );
    for (const res of results) {
      if (res.status === "fulfilled") entries.push(res.value);
      else console.warn("Fitxer no inclòs al ZIP:", res.reason);
    }
    const blob = await buildZip(entries);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CBT_FamiliesKit_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setKitDownloaded(true);
    setTimeout(() => setKitDownloaded(false), 3000);
  }, [equipments, equipByCode, README_TEXT]);

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
        <DocumentacioCards kitDownloaded={kitDownloaded} onKitDownload={handleKitDownload} />

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
                      <tr><td colSpan={4} className="text-center py-12 text-sm text-slate-400">Cap equip trobat</td></tr>
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
