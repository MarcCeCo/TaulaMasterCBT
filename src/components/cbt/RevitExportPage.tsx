// src/components/cbt/RevitExportPage.tsx
//
// Pàgina "Exportació Revit" — mostra els equips preparats per crear famílies .rfa
// i permet descarregar la configuració en JSON per al script de pyRevit.
//
// Com afegir-la:
//  1. Importa aquest component a TaulaMasterMain.tsx
//  2. Afegeix el cas "revit" al switch de renderContent()
//  3. Afegeix l'ítem al sidebar a AppSidebar.tsx (veure comentaris al final)

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/dataStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Box,
  Zap,
  Pipette,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Info,
  Flame,
  Wind,
  Waves,
  Radio,
  Shield,
  Lightbulb,
  Cable,
  Columns3,
  Building2,
  WrapText,
  Droplets,
  Thermometer,
  Settings2,
} from "lucide-react";
import { REVIT_CATEGORIES_FLAT } from "./EquipmentFormDialog";

// ─── Configuració de categories Revit ────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; template: string; color: string; icon: React.ReactNode; group: string }
> = {
  // ── Mecànica / MEP ──────────────────────────────────────────────────────────
  "Mechanical Equipment": {
    label: "Mechanical Equipment",
    template: "Metric Mechanical Equipment.rft",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <Box className="h-3.5 w-3.5" />,
    group: "Mecànica / MEP",
  },
  "Specialty Equipment": {
    label: "Specialty Equipment",
    template: "Metric Specialty Equipment.rft",
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: <Settings2 className="h-3.5 w-3.5" />,
    group: "Mecànica / MEP",
  },
  "Plumbing Fixtures": {
    label: "Plumbing Fixtures",
    template: "Metric Plumbing Fixture.rft",
    color: "bg-cyan-50 text-cyan-700 border-cyan-200",
    icon: <Droplets className="h-3.5 w-3.5" />,
    group: "Mecànica / MEP",
  },
  "Mechanical Control Devices": {
    label: "Mechanical Control Devices",
    template: "Metric Mechanical Control Device.rft",
    color: "bg-sky-50 text-sky-700 border-sky-200",
    icon: <Thermometer className="h-3.5 w-3.5" />,
    group: "Mecànica / MEP",
  },
  "Air Terminals": {
    label: "Air Terminals",
    template: "Metric Air Terminal.rft",
    color: "bg-teal-50 text-teal-700 border-teal-200",
    icon: <Wind className="h-3.5 w-3.5" />,
    group: "Mecànica / MEP",
  },
  "Fire Protection": {
    label: "Fire Protection",
    template: "Metric Fire Protection.rft",
    color: "bg-red-50 text-red-700 border-red-200",
    icon: <Flame className="h-3.5 w-3.5" />,
    group: "Mecànica / MEP",
  },
  "Sprinklers": {
    label: "Sprinklers",
    template: "Metric Sprinkler.rft",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    icon: <Waves className="h-3.5 w-3.5" />,
    group: "Mecànica / MEP",
  },
  // ── Canonades ───────────────────────────────────────────────────────────────
  "Pipe Accessories": {
    label: "Pipe Accessories",
    template: "Metric Pipe Accessory.rft",
    color: "bg-teal-50 text-teal-700 border-teal-200",
    icon: <Pipette className="h-3.5 w-3.5" />,
    group: "Canonades",
  },
  "Pipe Fittings": {
    label: "Pipe Fittings",
    template: "Metric Pipe Fitting.rft",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: <WrapText className="h-3.5 w-3.5" />,
    group: "Canonades",
  },
  "Pipes": {
    label: "Pipes",
    template: "Metric Pipe.rft",
    color: "bg-green-50 text-green-700 border-green-200",
    icon: <Waves className="h-3.5 w-3.5" />,
    group: "Canonades",
  },
  // ── Conductes ───────────────────────────────────────────────────────────────
  "Duct Accessories": {
    label: "Duct Accessories",
    template: "Metric Duct Accessory.rft",
    color: "bg-violet-50 text-violet-700 border-violet-200",
    icon: <Wind className="h-3.5 w-3.5" />,
    group: "Conductes",
  },
  "Duct Fittings": {
    label: "Duct Fittings",
    template: "Metric Duct Fitting.rft",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    icon: <WrapText className="h-3.5 w-3.5" />,
    group: "Conductes",
  },
  "Ducts": {
    label: "Ducts",
    template: "Metric Duct.rft",
    color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    icon: <Wind className="h-3.5 w-3.5" />,
    group: "Conductes",
  },
  // ── Elèctrica ────────────────────────────────────────────────────────────────
  "Electrical Equipment": {
    label: "Electrical Equipment",
    template: "Metric Electrical Equipment.rft",
    color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    icon: <Zap className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Electrical Fixtures": {
    label: "Electrical Fixtures",
    template: "Metric Electrical Fixture.rft",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <Zap className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Lighting Fixtures": {
    label: "Lighting Fixtures",
    template: "Metric Lighting Fixture.rft",
    color: "bg-yellow-50 text-yellow-600 border-yellow-200",
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Lighting Devices": {
    label: "Lighting Devices",
    template: "Metric Lighting Device.rft",
    color: "bg-lime-50 text-lime-700 border-lime-200",
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Communication Devices": {
    label: "Communication Devices",
    template: "Metric Communication Device.rft",
    color: "bg-slate-50 text-slate-600 border-slate-200",
    icon: <Radio className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Data Devices": {
    label: "Data Devices",
    template: "Metric Data Device.rft",
    color: "bg-slate-50 text-slate-600 border-slate-200",
    icon: <Radio className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Fire Alarm Devices": {
    label: "Fire Alarm Devices",
    template: "Metric Fire Alarm Device.rft",
    color: "bg-red-50 text-red-600 border-red-200",
    icon: <Flame className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Security Devices": {
    label: "Security Devices",
    template: "Metric Security Device.rft",
    color: "bg-slate-50 text-slate-700 border-slate-200",
    icon: <Shield className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Cable Trays": {
    label: "Cable Trays",
    template: "Metric Cable Tray.rft",
    color: "bg-zinc-50 text-zinc-600 border-zinc-200",
    icon: <Cable className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  "Conduits": {
    label: "Conduits",
    template: "Metric Conduit.rft",
    color: "bg-zinc-50 text-zinc-600 border-zinc-200",
    icon: <Cable className="h-3.5 w-3.5" />,
    group: "Elèctrica",
  },
  // ── Estructura ───────────────────────────────────────────────────────────────
  "Structural Columns": {
    label: "Structural Columns",
    template: "Metric Structural Column.rft",
    color: "bg-stone-50 text-stone-600 border-stone-200",
    icon: <Columns3 className="h-3.5 w-3.5" />,
    group: "Estructura",
  },
  "Structural Framing": {
    label: "Structural Framing",
    template: "Metric Structural Framing.rft",
    color: "bg-stone-50 text-stone-600 border-stone-200",
    icon: <Columns3 className="h-3.5 w-3.5" />,
    group: "Estructura",
  },
  "Structural Foundations": {
    label: "Structural Foundations",
    template: "Metric Structural Foundation.rft",
    color: "bg-stone-50 text-stone-700 border-stone-300",
    icon: <Building2 className="h-3.5 w-3.5" />,
    group: "Estructura",
  },
  // ── Arquitectura / General ───────────────────────────────────────────────────
  "Generic Models": {
    label: "Generic Models",
    template: "Metric Generic Model.rft",
    color: "bg-gray-50 text-gray-600 border-gray-200",
    icon: <Box className="h-3.5 w-3.5" />,
    group: "Arquitectura / General",
  },
  "Vertical Circulation": {
    label: "Vertical Circulation",
    template: "Metric Vertical Circulation.rft",
    color: "bg-gray-50 text-gray-600 border-gray-200",
    icon: <Building2 className="h-3.5 w-3.5" />,
    group: "Arquitectura / General",
  },
  "Furniture": {
    label: "Furniture",
    template: "Metric Furniture.rft",
    color: "bg-gray-50 text-gray-500 border-gray-200",
    icon: <Box className="h-3.5 w-3.5" />,
    group: "Arquitectura / General",
  },
  "Casework": {
    label: "Casework",
    template: "Metric Casework.rft",
    color: "bg-gray-50 text-gray-500 border-gray-200",
    icon: <Box className="h-3.5 w-3.5" />,
    group: "Arquitectura / General",
  },
  "Walls": {
    label: "Walls",
    template: "Metric Wall.rft",
    color: "bg-gray-50 text-gray-500 border-gray-200",
    icon: <Building2 className="h-3.5 w-3.5" />,
    group: "Arquitectura / General",
  },
  "Doors": {
    label: "Doors",
    template: "Metric Door.rft",
    color: "bg-gray-50 text-gray-500 border-gray-200",
    icon: <Building2 className="h-3.5 w-3.5" />,
    group: "Arquitectura / General",
  },
  "Windows": {
    label: "Windows",
    template: "Metric Window.rft",
    color: "bg-gray-50 text-gray-500 border-gray-200",
    icon: <Building2 className="h-3.5 w-3.5" />,
    group: "Arquitectura / General",
  },
};

// Usem la mateixa llista que el formulari per garantir consistència
const VALID_CATEGORIES = new Set(REVIT_CATEGORIES_FLAT);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Helper: nom de fitxer .rfa ───────────────────────────────────────────────
// MAJÚSCULES + espais → "_"
function toFileName(nom: string): string {
  return nom.toUpperCase().replace(/\s+/g, "_");
}

// ─── Component principal ──────────────────────────────────────────────────────

export function RevitExportPage() {
  const { equipments, fields, loading, error, retry } = useDataStore();
  const [downloaded, setDownloaded] = useState(false);

  // Mapa ràpid equipCode → equipName per a la resolució de pares
  const equipByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const eq of equipments) {
      if (eq.equipCode) m.set(eq.equipCode, eq.equipName);
    }
    return m;
  }, [equipments]);

  // ── Calcula els equips exportables ──────────────────────────────────────────
  const { exportable, skipped } = useMemo(() => {
    const exportable: {
      nom: string;       // nom original per mostrar
      fileName: string;  // nom normalitzat per al fitxer .rfa
      cat: string;
      params: string[];
      fieldCols: string[];
    }[] = [];
    const skipped: { nom: string; reason: string }[] = [];

    for (const eq of equipments) {
      if (!eq.needsTable) continue;

      const cat = eq.revitCategory?.trim() ?? "";

      if (!cat || !VALID_CATEGORIES.has(cat)) {
        skipped.push({
          nom: eq.equipName,
          reason: cat ? `Categoria no vàlida: "${cat}"` : "Sense categoria Revit assignada",
        });
        continue;
      }

      // Paràmetres CBT dels camps assignats a l'equip
      const equipFields = eq.fieldCols
        .map((col) => fields.find((f) => f.col === col))
        .filter(Boolean) as typeof fields;

      const params = equipFields
        .map((f) => f.cbt)
        .filter(Boolean) as string[];

      // Nom complet: "Nom pare Nom equip" si té pare, sinó sol el nom
      const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) : null;
      const nomComplet = parentName ? `${parentName} ${eq.equipName}` : eq.equipName;

      exportable.push({
        nom: nomComplet,
        fileName: toFileName(nomComplet),
        cat,
        params,
        fieldCols: eq.fieldCols,
      });
    }

    return { exportable, skipped };
  }, [equipments, fields, equipByCode]);

  // ── Stats per grup de categories ────────────────────────────────────────────
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

  // ── Descàrrega JSON ───────────────────────────────────────────────────────────
  const handleDownload = () => {
    const config = {
      generated_at: new Date().toISOString(),
      revit_version: "2026",
      templates_folder: "C:\\ProgramData\\Autodesk\\RVT 2026\\Family Templates\\English",
      output_folder: "%USERPROFILE%\\Documents\\Families_Output",
      shared_params_path: "%USERPROFILE%\\Documents\\CBT_PARAMETRES-COMPARTITS.txt",
      total: exportable.length,
      equipments: exportable.map((eq) => ({
        nom: eq.fileName,
        cat: eq.cat,
        template: CATEGORY_CONFIG[eq.cat].template,
        params: eq.params,
      })),
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CBT_Revit_Config_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
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
        <Button variant="outline" size="sm" onClick={retry}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Capçalera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Exportació Revit
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Famílies .rfa a generar per al model BIM · Revit 2026 Mètric
          </p>
        </div>
        <Button
          onClick={handleDownload}
          disabled={exportable.length === 0}
          className="bg-[#006E7A] hover:bg-[#005a64] text-white gap-2 shrink-0"
        >
          {downloaded ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Descarregat!
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Descarregar config Revit
            </>
          )}
        </Button>
      </div>

      {/* Cards de resum per grup de disciplina */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Object.entries(statsByGroup).map(([group, { count, cats }]) => {
          // Icona del primer element del grup
          const firstCat = cats[0];
          const icon = firstCat ? CATEGORY_CONFIG[firstCat]?.icon : <Box className="h-3.5 w-3.5" />;
          return (
            <Card key={group} className="border-0 shadow-sm bg-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-[#0099A8]/10 flex items-center justify-center text-[#006E7A] shrink-0">
                    {icon}
                  </div>
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
            <CardContent className="p-4 text-center text-sm text-slate-400">
              Cap equip exportable encara
            </CardContent>
          </Card>
        )}
      </div>

      {/* Nota informativa */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-medium">Com funciona: </span>
          Descarrega el JSON de configuració i posa'l a{" "}
          <code className="bg-blue-100 px-1 rounded text-xs">
            Documentos\CBT_Revit_Config.json
          </code>
          . El script de pyRevit el llegirà automàticament en lloc de l'Excel.
        </div>
      </div>

      {/* Taula d'equips exportables */}
      <Card className="border-0 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Equips a exportar
            <Badge className="ml-1 bg-emerald-100 text-emerald-700 border-0 text-xs">
              {exportable.length}
            </Badge>
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
                    <TableHead className="text-xs font-semibold text-slate-500 w-[40%]">
                      Equip
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 w-[35%]">
                      Categoria Revit
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 text-right">
                      Paràmetres
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exportable.map((eq) => {
                    const cfg = CATEGORY_CONFIG[eq.cat];
                    return (
                      <TableRow
                        key={eq.nom}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <TableCell className="py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs font-semibold text-slate-800 tracking-tight">
                              {eq.fileName}
                            </span>
                            {eq.nom !== eq.fileName.replace(/_/g, " ").toLowerCase() && (
                              <span className="text-[11px] text-slate-400">{eq.nom}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className={`text-xs gap-1 ${cfg.color}`}
                          >
                            {cfg.icon}
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {eq.params.length}
                          </span>
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

      {/* Taula d'equips descartats */}
      {skipped.length > 0 && (
        <Card className="border-0 shadow-sm bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              Equips descartats
              <Badge className="ml-1 bg-amber-100 text-amber-700 border-0 text-xs">
                {skipped.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[240px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="text-xs font-semibold text-slate-500 w-[50%]">
                      Equip
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500">
                      Motiu
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skipped.map((eq) => (
                    <TableRow key={eq.nom} className="hover:bg-slate-50/50">
                      <TableCell className="py-2 text-sm text-slate-600">
                        {eq.nom}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-amber-600">
                        {eq.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/*
─────────────────────────────────────────────────────────────────────
INSTRUCCIONS PER INTEGRAR A LA PLATAFORMA
─────────────────────────────────────────────────────────────────────

1. AFEGIR AL SIDEBAR (AppSidebar.tsx)
   ─────────────────────────────────
   Importa la icona:
     import { Building2 } from "lucide-react";

   Al grup "taulaMaster", afegeix aquest ítem:
     {
       id: "revit",
       label: "Exportació Revit",
       icon: <Building2 className="h-4 w-4" />,
       section: "revit",
       view: "equips",   // mateixos permisos que Taula Master
     },


2. AFEGIR AL MAIN (TaulaMasterMain.tsx)
   ────────────────────────────────────
   Importa el component:
     import { RevitExportPage } from "./RevitExportPage";

   Al switch de renderContent(), afegeix:
     case "revit":
       return <RevitExportPage />;


3. ACTUALITZAR EL SCRIPT PYREVIT (opcional — millora futura)
   ──────────────────────────────────────────────────────────
   Al TEST_script.py i FULL_script.py, substitueix la lectura de l'Excel
   per la lectura del JSON descarregat:

     import json
     config_path = os.path.join(_DOCS, "CBT_Revit_Config.json")
     with open(config_path, "r", encoding="utf-8") as f:
         config = json.load(f)
     equips = config["equipments"]
     # Cada element: { "nom": "...", "cat": "...", "template": "...", "params": [...] }
─────────────────────────────────────────────────────────────────────
*/
