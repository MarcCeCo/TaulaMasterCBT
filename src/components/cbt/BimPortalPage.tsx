// src/components/cbt/BimPortalPage.tsx
//
// Portal BIM — accés centralitzat per a modeladors externs (i interns) a tota la
// documentació BIM del Consorci Besòs Tordera:
//   · Manual BIM (PDF estàtic)
//   · PEB per projecte (descàrrega Excel)
//   · Plantilla de projecte (.rvt)
//   · Paquet de creació de famílies (script FULL + JSON dinàmic + paràmetres compartits)
//   · Script TEST auxiliar
//   · Llistat d'equips amb botó de descàrrega de la seva família .rfa

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
} from "@/components/ui/table";import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Package,
  RefreshCw,
  AlertCircle,
  Info,
  Box,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { REVIT_CATEGORIES_FLAT } from "./EquipmentFormDialog";

// ─── Helpers (els mateixos que RevitExportPage per consistència) ───────────────

const VALID_CATEGORIES = new Set(REVIT_CATEGORIES_FLAT);

function toFileName(nom: string): string {
  return nom.toUpperCase().replace(/\s+/g, "-");
}

function buildRfaName(equipName: string, parentName: string | null, equipCode: string): string {
  const nomComplet = parentName ? `${parentName} ${equipName}` : equipName;
  return `CBT_${toFileName(nomComplet)}_${equipCode.toUpperCase()}.rfa`;
}

// ─── Component principal ───────────────────────────────────────────────────────

export function BimPortalPage() {
  const { equipments, fields, loading, error, retry } = useDataStore();
  const [kitDownloaded, setKitDownloaded] = useState(false);
  const [testDownloaded, setTestDownloaded] = useState(false);
  const [search, setSearch] = useState("");

  // Mapa equipCode → equipName per resoldre pares
  const equipByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const eq of equipments) {
      if (eq.equipCode) m.set(eq.equipCode, eq.equipName);
    }
    return m;
  }, [equipments]);

  // Llista d'equips amb categoria Revit vàlida i sense (per mostrar-los tots)
  const equipRows = useMemo(() => {
    return equipments
      .filter((eq) => eq.needsTable && eq.equipCode)
      .map((eq) => {
        const cat = eq.revitCategory?.trim() ?? "";
        const hasValidCat = !!cat && VALID_CATEGORIES.has(cat);
        const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? null : null;
        const rfaName = hasValidCat ? buildRfaName(eq.equipName, parentName, eq.equipCode) : null;
        return { eq, cat, hasValidCat, rfaName, parentName };
      })
      .filter(({ eq }) =>
        search === "" ||
        eq.equipName.toLowerCase().includes(search.toLowerCase()) ||
        eq.equipCode.toLowerCase().includes(search.toLowerCase())
      );
  }, [equipments, equipByCode, search]);

  const totalAmbFamilia = useMemo(
    () => equipRows.filter((r) => r.hasValidCat).length,
    [equipRows]
  );

  // ── Descàrrega del paquet CBT_FamiliesKit.zip ──────────────────────────────
  // Genera el JSON de configuració dinàmicament i el combina amb els altres fitxers.
  // En producció, el ZIP es generaria al servidor o via un endpoint de Supabase Edge Function.
  // Aquí simulem la descàrrega del JSON (la lògica és idèntica a RevitExportPage).
  const handleKitDownload = () => {
    const exportable = equipments
      .filter((eq) => {
        if (!eq.needsTable) return false;
        const cat = eq.revitCategory?.trim() ?? "";
        return !!cat && VALID_CATEGORIES.has(cat);
      })
      .map((eq) => {
        const cat = eq.revitCategory!.trim();
        const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? null : null;
        const nomComplet = parentName ? `${parentName} ${eq.equipName}` : eq.equipName;
        const equipFields = eq.fieldCols
          .map((col) => fields.find((f) => f.col === col))
          .filter(Boolean) as typeof fields;
        const params = equipFields
          .map((f) => f.cbt ? { name: f.cbt, codi: f.codi ?? null, instance: f.instancia_revit === "Y" } : null)
          .filter(Boolean) as { name: string; codi: string | null; instance: boolean }[];
        return {
          nom: toFileName(nomComplet),
          cat,
          equip_code: eq.equipCode,
          table_code: eq.tableCode ?? "",
          params,
        };
      });

    const config = {
      generated_at: new Date().toISOString(),
      output_folder: "%USERPROFILE%\\Documents\\Families_Output",
      shared_params_path: "%USERPROFILE%\\Documents\\CBT_PARAMETRES-COMPARTITS.txt",
      total: exportable.length,
      equipments: exportable,
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CBT_Revit_Config_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setKitDownloaded(true);
    setTimeout(() => setKitDownloaded(false), 3000);
  };

  const handleTestDownload = () => {
    const a = document.createElement("a");
    a.href = "/scripts/TEST_script.py";
    a.download = "CBT_TEST_script.py";
    a.click();
    setTestDownloaded(true);
    setTimeout(() => setTestDownloaded(false), 3000);
  };

  const handleRfaDownload = (rfaName: string) => {
    const a = document.createElement("a");
    a.href = `/families/${rfaName}`;
    a.download = rfaName;
    a.click();
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
        <Button variant="outline" size="sm" onClick={retry}>Reintentar</Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* ── Capçalera ─────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[#0099A8]" />
            Portal BIM
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Documentació, eines i scripts per al modelatge BIM del Consorci Besòs Tordera
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Columna esquerra ─────────────────────────────────────────────── */}
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
                  <a href="/docs/Manual_BIM_CBT.pdf" download>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                      <Download className="h-3.5 w-3.5" />
                      PDF
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
                    <p className="text-sm font-medium text-slate-800">PEB_CBT.xlsx</p>
                    <p className="text-xs text-slate-500 mt-0.5">Pla d'Execució BIM del Consorci Besòs Tordera</p>
                  </div>
                  <a href="/docs/PEB_CBT.xlsx" download>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                      <Download className="h-3.5 w-3.5" />
                      Excel
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* Plantilla de projecte */}
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
                    <p className="text-sm font-medium text-slate-800">CBT_Plantilla_Projecte.rvt</p>
                    <p className="text-xs text-slate-500 mt-0.5">Vistes, fulls i paràmetres CBT preconfigurats</p>
                  </div>
                  <a href="/templates/CBT_Plantilla_Projecte.rvt" download>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                      <Download className="h-3.5 w-3.5" />
                      .rvt
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* ── Columna dreta ─────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Paquet de creació de famílies */}
            <Card className="border-0 shadow-sm bg-white">
              <CardHeader className="pb-2 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                  <Package className="h-4 w-4 text-[#0099A8]" />
                  Paquet de creació de famílies
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Kit principal */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">CBT_FamiliesKit</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Script FULL + configuració JSON (generada ara) + paràmetres compartits
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
                    {["FULL_script.py", "CBT_Revit_Config.json", "CBT_PARAMETRES-COMPARTITS.txt", "README.txt"].map((f) => (
                      <span
                        key={f}
                        className="font-mono text-[11px] bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-600"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      El JSON es genera en el moment de la descàrrega i reflecteix l'estat actual de la Taula Master.
                    </span>
                  </div>
                </div>

                {/* Separador */}
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium uppercase tracking-wider">
                  <div className="h-px flex-1 bg-slate-200" />
                  Script auxiliar de validació
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Script TEST */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <FlaskConical className="h-4.5 w-4.5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-800">TEST_script.py</p>
                      <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                        Genera <strong>1 família per categoria</strong>. Usa'l per verificar que pyRevit,
                        les rutes i el JSON estan correctament configurats <em>abans</em> d'executar el FULL.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-100 gap-1.5 text-xs shrink-0"
                      onClick={handleTestDownload}
                    >
                      {testDownloaded ? (
                        <><CheckCircle2 className="h-3.5 w-3.5" /> Ok!</>
                      ) : (
                        <><Download className="h-3.5 w-3.5" /> .py</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Flux d'ús resumit */}
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold text-blue-700 mb-2">Flux d'ús recomanat</p>
                  <ol className="text-xs text-blue-700 space-y-1 list-none">
                    {[
                      ["1", "Llegeix el Manual BIM i el PEB del teu projecte"],
                      ["2", "Descarrega la plantilla .rvt i configura Revit"],
                      ["3", "Descarrega el paquet de famílies (CBT_FamiliesKit)"],
                      ["4", "Executa el TEST_script per validar l'ecosistema"],
                      ["5", "Si el TEST va bé, executa el FULL_script"],
                    ].map(([n, text]) => (
                      <li key={n} className="flex items-start gap-2">
                        <span className="h-4 w-4 rounded-full bg-[#0099A8] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-semibold">
                          {n}
                        </span>
                        {text}
                      </li>
                    ))}
                  </ol>
                </div>

              </CardContent>
            </Card>

          </div>
        </div>

        {/* ── Llistat d'equips amb descàrrega .rfa ──────────────────────────── */}
        <Card className="border-0 shadow-sm bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
                <Box className="h-4 w-4 text-[#0099A8]" />
                Famílies .rfa per equip
                <Badge className="ml-1 bg-[#0099A8]/10 text-[#006E7A] border-0 text-xs">
                  {totalAmbFamilia} disponibles
                </Badge>
              </CardTitle>
              <input
                type="text"
                placeholder="Cerca per nom o codi…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-sm text-slate-400">
                        Cap equip trobat
                      </TableCell>
                    </TableRow>
                  )}
                  {equipRows.map(({ eq, cat, hasValidCat, rfaName }) => (
                    <TableRow key={eq.id} className="hover:bg-slate-50/50">
                      <TableCell className="py-2.5 font-mono text-xs text-slate-600">
                        {eq.equipCode}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-slate-800">
                            {equipByCode.get(eq.parentEquipCode)
                              ? `${equipByCode.get(eq.parentEquipCode)} ${eq.equipName}`
                              : eq.equipName}
                          </span>
                          {cat && (
                            <span className="text-[11px] text-slate-400">{cat}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {rfaName ? (
                          <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {rfaName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-500 italic">Sense categoria Revit</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        {hasValidCat && rfaName ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-[#0099A8] hover:bg-[#0099A8]/10"
                                onClick={() => handleRfaDownload(rfaName)}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Descarregar {rfaName}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-slate-300"
                                  disabled
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Assigna una categoria Revit a l'equip per habilitar la descàrrega
                            </TooltipContent>
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
    </TooltipProvider>
  );
}
