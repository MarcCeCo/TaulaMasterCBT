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
} from "lucide-react";

// ─── Configuració de categories Revit ────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; template: string; color: string; icon: React.ReactNode }
> = {
  "Mechanical equipment": {
    label: "Mechanical Equipment",
    template: "Metric Mechanical Equipment.rft",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <Box className="h-3.5 w-3.5" />,
  },
  "Electrical equipment": {
    label: "Electrical Equipment",
    template: "Metric Electrical Equipment.rft",
    color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    icon: <Zap className="h-3.5 w-3.5" />,
  },
  "Pipe accessories": {
    label: "Pipe Accessories",
    template: "Metric Pipe Accessory.rft",
    color: "bg-teal-50 text-teal-700 border-teal-200",
    icon: <Pipette className="h-3.5 w-3.5" />,
  },
};

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_CONFIG));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function singleCategory(cats: string[]): string | null {
  const valid = cats.filter((c) => VALID_CATEGORIES.has(c));
  if (valid.length === 1) return valid[0];
  return null;
}

// ─── Component principal ──────────────────────────────────────────────────────

export function RevitExportPage() {
  const { equipments, fields, loading, error, retry } = useDataStore();
  const [downloaded, setDownloaded] = useState(false);

  // ── Calcula els equips exportables ──────────────────────────────────────────
  const { exportable, skipped } = useMemo(() => {
    const exportable: {
      nom: string;
      cat: string;
      params: string[];
      fieldCols: string[];
    }[] = [];
    const skipped: { nom: string; reason: string }[] = [];

    for (const eq of equipments) {
      if (!eq.needsTable) continue;

      // La categoria Revit ve del primer fieldCol que coincideixi, o d'un
      // camp "categoria_revit" si existís — usem el GuBIM Class per deduir-la.
      // Per ara, busquem si l'equip té fieldCols que continguin la clau
      // "CATEGORIA" i si el seu valor és una de les categories vàlides.
      // Com que el valor de la categoria no està al equip sinó a la taula,
      // usem el nom del GuBIMClass per mapar (igual que feia l'Excel).
      // En el futur podeu afegir un camp `revit_category` a la taula.

      // Busca camps que tinguin agrupació_revit o disciplina que indiqui cat.
      // Per ara: si el equip té fieldCols, obtenim els FieldMeta corresponents
      // i mirem si algun té agrupacio_revit que mapegi a una categoria.
      const equipFields = eq.fieldCols
        .map((col) => fields.find((f) => f.col === col))
        .filter(Boolean) as typeof fields;

      // Intenta deduir categoria des dels FieldMeta (agrupacio_revit)
      const revitCats = [
        ...new Set(
          equipFields
            .map((f) => f.agrupacio_revit)
            .filter(Boolean) as string[]
        ),
      ];

      const cat = singleCategory(revitCats);

      if (!cat) {
        if (revitCats.length === 0) {
          skipped.push({ nom: eq.equipName, reason: "Sense categoria Revit" });
        } else {
          skipped.push({
            nom: eq.equipName,
            reason: `Múltiples categories: ${revitCats.join(", ")}`,
          });
        }
        continue;
      }

      // Paràmetres: els noms dels camps amb prefix CBT_
      const params = equipFields
        .map((f) => f.cbt)
        .filter(Boolean) as string[];

      exportable.push({
        nom: eq.equipName,
        cat,
        params,
        fieldCols: eq.fieldCols,
      });
    }

    return { exportable, skipped };
  }, [equipments, fields]);

  // ── Stats per categoria ──────────────────────────────────────────────────────
  const statsByCat = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const eq of exportable) {
      stats[eq.cat] = (stats[eq.cat] ?? 0) + 1;
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
        nom: eq.nom,
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

      {/* Cards de resum per categoria */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
          <Card key={cat} className="border-0 shadow-sm bg-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#0099A8]/10 flex items-center justify-center text-[#006E7A]">
                  {cfg.icon}
                </div>
                <div>
                  <p className="text-xs text-slate-500 leading-tight">
                    {cfg.label}
                  </p>
                  <p className="text-2xl font-bold text-slate-800">
                    {statsByCat[cat] ?? 0}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 font-mono truncate">
                {cfg.template}
              </p>
            </CardContent>
          </Card>
        ))}
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
                        <TableCell className="py-2.5 text-sm font-medium text-slate-700">
                          {eq.nom}
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
