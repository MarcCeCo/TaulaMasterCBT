// src/components/cbt/RevitBimPage.tsx
//
// Pàgina fusionada "Revit & BIM" — substitueix RevitExportPage + BimPortalPage.
// Dues pestanyes:
//   · Portal BIM   — documentació, descàrregues i famílies .rfa per a modeladors
//   · Exportació   — taula d'equips exportables + generació JSON per a admins/editors
//
// Permisos: view="revit" (igual que les dues pàgines originals)

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/dataStore";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle, BookOpen, Box, Building2, Check, CheckCircle2,
  Copy, Download, FileCode2, FileSpreadsheet, FileText, FolderOpen,
  Info, Package, RefreshCw, Terminal,
  Zap, Pipette, Flame, Wind, Waves, Radio, Shield, Lightbulb,
  Cable, Columns3, WrapText, Droplets, Thermometer, Settings2,
} from "lucide-react";
import { REVIT_CATEGORIES_FLAT } from "./EquipmentFormDialog";

// ─── CATEGORY_CONFIG (únic, compartit) ───────────────────────────────────────
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

const CATEGORY_TEMPLATES: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_CONFIG).map(([k, v]) => [k, v.template])
);

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

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = "portal" | "exportacio";

export function RevitBimPage() {
  const { equipments, fields, loading, error, retry } = useDataStore();
  const { canSeeView, canEditView } = useAuth();

  // Permís: igual que les dues pàgines originals
  const canSee = canSeeView("revit");

  const [tab, setTab] = useState<Tab>("portal");

  // ── Portal BIM state ──
  const [kitDownloaded, setKitDownloaded] = useState(false);
  const [search, setSearch] = useState("");

  // ── Exportació state ──
  const [downloaded, setDownloaded] = useState(false);
  const [scriptDownloaded, setScriptDownloaded] = useState<"FULL" | "TEST" | null>(null);
  const [showScriptInstructions, setShowScriptInstructions] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // ── Mapa equipCode → nom ──
  const equipByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const eq of equipments) {
      if (eq.equipCode) m.set(eq.equipCode, eq.equipName);
    }
    return m;
  }, [equipments]);

  // ── Equips exportables (compartit entre les dues pestanyes) ──
  const { exportable, skipped } = useMemo(() => {
    const exportable: {
      nom: string; fileName: string; cat: string; params: { name: string; codi: string | null; instance: boolean }[];
      equipCode: string; tableCode: string;
    }[] = [];
    const skipped: { nom: string; reason: string }[] = [];
    for (const eq of equipments) {
      if (!eq.needsTable) continue;
      const cat = eq.revitCategory?.trim() ?? "";
      if (!cat || !VALID_CATEGORIES.has(cat)) {
        skipped.push({ nom: eq.equipName, reason: cat ? `Categoria no vàlida: "${cat}"` : "Sense categoria Revit" });
        continue;
      }
      const equipFields = eq.fieldCols.map((col) => fields.find((f) => f.col === col)).filter(Boolean) as typeof fields;
      const params = equipFields
        .map((f) => f.cbt ? { name: f.cbt, codi: f.codi ?? null, instance: f.instancia_revit === "Y" } : null)
        .filter(Boolean) as { name: string; codi: string | null; instance: boolean }[];
      const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? null : null;
      const nomComplet = parentName ? `${parentName} ${eq.equipName}` : eq.equipName;
      exportable.push({ nom: nomComplet, fileName: toFileName(nomComplet), cat, params, equipCode: eq.equipCode ?? "", tableCode: eq.tableCode ?? "" });
    }
    return { exportable, skipped };
  }, [equipments, fields, equipByCode]);

  // ── Stats per grup (Exportació) ──
  const statsByGroup = useMemo(() => {
    const stats: Record<string, { count: number; cats: string[] }> = {};
    for (const eq of exportable) {
      const cfg = CATEGORY_CONFIG[eq.cat];
      if (!cfg) continue;
      if (!stats[cfg.group]) stats[cfg.group] = { count: 0, cats: [] };
      stats[cfg.group].count++;
      if (!stats[cfg.group].cats.includes(eq.cat)) stats[cfg.group].cats.push(eq.cat);
    }
    return stats;
  }, [exportable]);

  // ── Files Portal BIM (totes les famílies, amb cerca) ──
  const equipRows = useMemo(() => {
    const q = search.trim().toLowerCase();
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
        return { eq, cat, hasValidCat, rfaName };
      });
  }, [equipments, equipByCode, search]);

  const totalAmbFamilia = useMemo(() => equipRows.filter((r) => r.rfaName).length, [equipRows]);

  // ─── Handlers Portal BIM ─────────────────────────────────────────────────────

  const handleRfaDownload = (rfaName: string) => {
    const a = document.createElement("a");
    a.href = `/families/${rfaName}`;
    a.download = rfaName;
    a.click();
  };

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

  const handleKitDownload = async () => {
    const enc = new TextEncoder();
    const config = {
      generated_at: new Date().toISOString(),
      output_folder: "%USERPROFILE%\\Documents\\Families_Output",
      shared_params_path: "%USERPROFILE%\\Documents\\CBT_PARAMETRES-COMPARTITS.txt",
      total: exportable.length,
      equipments: exportable.map((eq) => ({
        nom: eq.fileName,
        cat: eq.cat,
        template: CATEGORY_CONFIG[eq.cat]?.template ?? "Metric Generic Model.rft",
        equip_code: eq.equipCode,
        table_code: eq.tableCode,
        params: eq.params,
      })),
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
  };

  // ─── Handlers Exportació ─────────────────────────────────────────────────────

  const handleDownload = () => {
    const config = {
      generated_at: new Date().toISOString(),
      output_folder: "%USERPROFILE%\\Documents\\Families_Output",
      shared_params_path: "%USERPROFILE%\\Documents\\CBT_PARAMETRES-COMPARTITS.txt",
      total: exportable.length,
      equipments: exportable.map((eq) => ({
        nom: eq.fileName,
        cat: eq.cat,
        template: CATEGORY_TEMPLATES[eq.cat] ?? "Metric Generic Model.rft",
        equip_code: eq.equipCode,
        table_code: eq.tableCode,
        params: eq.params,
      })),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CBT_Revit_Config_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const PYREVIT_SCRIPTS = {
    FULL: { pyRevitPath: "%APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Families FULL.pushbutton\\script.py" },
    TEST: { pyRevitPath: "%APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Families TEST.pushbutton\\script.py" },
  };

  const handleScriptDownload = (type: "FULL" | "TEST") => {
    fetch(type === "FULL" ? "/scripts/FULL_script.py" : "/scripts/TEST_script.py")
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `CBT_${type}_script.py`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert(`No s'ha pogut descarregar el Script ${type}. Comprova que el servidor serveix /public/scripts/.`));
    setScriptDownloaded(type);
    setShowScriptInstructions(true);
    setTimeout(() => setScriptDownloaded(null), 3000);
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (!canSee) {
    return (
      <Card className="p-12 border-0 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
        <p className="font-semibold text-slate-700">Accés restringit</p>
        <p className="text-sm text-muted-foreground">No tens permisos per accedir a aquesta secció.</p>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-[#0099A8]" />
        <span className="ml-3 text-sm text-slate-500">Carregant dades...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-slate-600">Error carregant les dades</p>
        <Button variant="outline" size="sm" onClick={retry}>Reintentar</Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* ── Capçalera + tabs ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <Building2 className="h-6 w-6 text-[#0099A8]" />
                Revit & BIM
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Portal de documentació i exportació Revit del Consorci Besòs Tordera
              </p>
            </div>
          </div>

          {/* Pestanyes */}
          <div className="flex border-b border-slate-200 gap-1">
            {([
              { id: "portal" as Tab, label: "Portal BIM", icon: <BookOpen className="h-4 w-4" /> },
              { id: "exportacio" as Tab, label: "Exportació Revit", icon: <Building2 className="h-4 w-4" />, adminOnly: false },
            ]).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  tab === id
                    ? "border-[#0099A8] text-[#006E7A]"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: PORTAL BIM                                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "portal" && (
          <div className="space-y-6">

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Columna esquerra */}
              <div className="space-y-4">

                {/* Manual BIM */}
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

                {/* PEB */}
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

                {/* Plantilla */}
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
                          onClick={handleKitDownload}
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

            {/* Taula famílies .rfa */}
            <Card className="border-0 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
                    <Box className="h-4 w-4 text-[#0099A8]" />
                    Famílies .rfa per equip
                    <Badge className="ml-1 bg-[#0099A8]/10 text-[#006E7A] border-0 text-xs">{totalAmbFamilia} disponibles</Badge>
                  </CardTitle>
                  <input
                    type="text" placeholder="Cerca per nom o codi…"
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    className="text-sm border border-slate-200 rounded-md px-3 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-[#0099A8] bg-white"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className="text-xs font-semibold text-slate-500 w-28">Codi</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500">Equip</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500 w-48">Fitxer .rfa</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500 w-20 text-right">Família</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {equipRows.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center py-12 text-sm text-slate-400">Cap equip trobat</TableCell></TableRow>
                      )}
                      {equipRows.map(({ eq, cat, hasValidCat, rfaName }) => (
                        <TableRow key={eq.id} className="hover:bg-slate-50/50">
                          <TableCell className="py-2.5 font-mono text-xs text-slate-600">{eq.equipCode}</TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium text-slate-800">
                                {eq.parentEquipCode ? `${equipByCode.get(eq.parentEquipCode) ?? ""} ${eq.equipName}` : eq.equipName}
                              </span>
                              {cat && <span className="text-[11px] text-slate-400">{cat}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            {rfaName ? (
                              <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{rfaName}</span>
                            ) : (
                              <span className="text-[11px] text-amber-500 italic">Sense categoria Revit</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            {hasValidCat && rfaName ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-[#0099A8] hover:bg-[#0099A8]/10" onClick={() => handleRfaDownload(rfaName)}>
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
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: EXPORTACIÓ REVIT                                             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === "exportacio" && (
          <div className="space-y-6">

            {/* Botons d'acció */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1.5">
                {(["TEST", "FULL"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleScriptDownload(type)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors border border-slate-200"
                    title={type === "TEST" ? "Script TEST (1 família per categoria)" : "Script FULL (totes les famílies)"}
                  >
                    {scriptDownloaded === type ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : type === "TEST" ? <Terminal className="h-3.5 w-3.5" /> : <FileCode2 className="h-3.5 w-3.5" />}
                    Script {type}
                  </button>
                ))}
              </div>
              <div className="h-7 w-px bg-slate-200" />
              <button
                onClick={handleDownload}
                disabled={exportable.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-[#006E7A] hover:bg-[#005a64] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {downloaded ? <><CheckCircle2 className="h-4 w-4" /> Descarregat!</> : <><Download className="h-4 w-4" /> Config Revit (JSON)</>}
              </button>
            </div>

            {/* Instruccions scripts */}
            {showScriptInstructions && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-sm font-semibold text-emerald-800">Script descarregat — on col·locar-lo</span>
                  <button onClick={() => setShowScriptInstructions(false)} className="ml-auto text-emerald-500 hover:text-emerald-700 text-xs">Tanca</button>
                </div>
                <div className="space-y-2">
                  {(["FULL", "TEST"] as const).map((type) => (
                    <div key={type} className="bg-white rounded-lg border border-emerald-200 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                          {type === "FULL" ? "Script FULL (totes les famílies)" : "Script TEST (1 per categoria)"}
                        </span>
                        <button
                          onClick={() => handleCopyPath(PYREVIT_SCRIPTS[type].pyRevitPath)}
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors"
                        >
                          {copiedPath === PYREVIT_SCRIPTS[type].pyRevitPath ? <><Check className="h-3 w-3" /> Copiat!</> : <><Copy className="h-3 w-3" /> Copia ruta</>}
                        </button>
                      </div>
                      <code className="text-[11px] text-slate-600 font-mono break-all block bg-slate-50 rounded px-2 py-1.5 border border-slate-100">
                        {PYREVIT_SCRIPTS[type].pyRevitPath}
                      </code>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-100/60 rounded-lg px-3 py-2">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Si la carpeta <code className="font-mono text-[11px] bg-white/70 px-1 rounded">CBT.extension</code> no existeix, crea-la manualment o importa l'extensió des de pyRevit Settings → Extensions.</span>
                </div>
              </div>
            )}

            {/* Stats per grup */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(statsByGroup).map(([group, { count, cats }]) => {
                const icon = cats[0] ? CATEGORY_CONFIG[cats[0]]?.icon : <Box className="h-3.5 w-3.5" />;
                return (
                  <Card key={group} className="border-0 shadow-sm bg-white">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-[#0099A8]/10 flex items-center justify-center text-[#006E7A] shrink-0">{icon}</div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-slate-400 leading-tight truncate">{group}</p>
                          <p className="text-xl font-bold text-slate-800">{count}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 truncate">{cats.length} categoria{cats.length !== 1 ? "s" : ""}</p>
                    </CardContent>
                  </Card>
                );
              })}
              {Object.keys(statsByGroup).length === 0 && (
                <Card className="border-0 shadow-sm bg-white col-span-full">
                  <CardContent className="p-4 text-center text-sm text-slate-400">Cap equip exportable encara</CardContent>
                </Card>
              )}
            </div>

            {/* Taula equips exportables */}
            <Card className="border-0 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Equips a exportar
                  <Badge className="ml-1 bg-emerald-100 text-emerald-700 border-0 text-xs">{exportable.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {exportable.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <Box className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm">Cap equip amb categoria Revit vàlida</p>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[420px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="text-xs font-semibold text-slate-500 w-[40%]">Equip</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 w-[35%]">Categoria Revit</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 text-right">Paràmetres</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exportable.map((eq) => {
                          const cfg = CATEGORY_CONFIG[eq.cat];
                          return (
                            <TableRow key={eq.nom} className="hover:bg-slate-50/50">
                              <TableCell className="py-2.5">
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-mono text-xs font-semibold text-slate-800 tracking-tight">
                                    {"CBT_" + eq.fileName + (eq.equipCode ? "_" + eq.equipCode.toUpperCase() : "") + ".rfa"}
                                  </span>
                                  <span className="text-[11px] text-slate-400">{eq.nom}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5">
                                <Badge variant="outline" className={`text-xs gap-1 ${cfg?.color ?? ""}`}>
                                  {cfg?.icon}
                                  {cfg?.label ?? eq.cat}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2.5 text-right">
                                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{eq.params.length}</span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Taula equips descartats */}
            {skipped.length > 0 && (
              <Card className="border-0 shadow-sm bg-white">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    Equips descartats
                    <Badge className="ml-1 bg-amber-100 text-amber-700 border-0 text-xs">{skipped.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[240px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="text-xs font-semibold text-slate-500 w-[50%]">Equip</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500">Motiu</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skipped.map((eq) => (
                          <TableRow key={eq.nom} className="hover:bg-slate-50/50">
                            <TableCell className="py-2 text-sm text-slate-600">{eq.nom}</TableCell>
                            <TableCell className="py-2 text-xs text-amber-600">{eq.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

      </div>
    </TooltipProvider>
  );
}
