// src/components/cbt/Visualitzador3DPage.tsx
//
// Pàgina Visualitzador 3D — permet seleccionar un Sistema i, dins d'ell,
// una Instal·lació concreta per mostrar el model Autodesk 360 incrustat.
//
// Estructura de dades:
//   Sistema  →  llista d'Instal·lacions
//   Instal·lació  →  URL d'embed d'Autodesk 360
//
// Per afegir models, edita la constant SISTEMES_DATA al final del fitxer.

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Box,
  Building2,
  ChevronRight,
  Maximize2,
  X,
  Layers,
  MapPin,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tipus de dades ───────────────────────────────────────────────────────────

interface Installacio {
  id: string;
  nom: string;
  descripcio?: string;
  embedUrl: string;       // URL de l'iframe d'Autodesk 360
  codiInstallacio?: string;
}

interface Sistema {
  id: string;
  nom: string;
  descripcio?: string;
  icona?: string;         // emoji o text curt
  color: string;          // color accent (hex)
  installacions: Installacio[];
}

// ─── Dades de sistemes i instal·lacions ──────────────────────────────────────
// 👉 Edita aquí per afegir o modificar sistemes i instal·lacions.
// Substitueix embedUrl per la URL real de l'iframe d'Autodesk 360.

const SISTEMES_DATA: Sistema[] = [
  {
    id: "depuradores",
    nom: "Estacions Depuradores",
    descripcio: "EDAR i instal·lacions de tractament d'aigües residuals",
    icona: "💧",
    color: "#0099A8",
    installacions: [
      {
        id: "ed-llagosta",
        nom: "ED005 La Llagosta",
        descripcio: "Estació depuradora de La Llagosta",
        codiInstallacio: "ED005",
        embedUrl:
          "/bim-proxy/shares/public/SH512d4QTec90decfa6e44d5bb851f10e507?mode=embed",
      },
      // Afegeix més instal·lacions aquí:
      // {
      //   id: "ed-exemple",
      //   nom: "ED001 Exemple",
      //   descripcio: "Descripció de la instal·lació",
      //   codiInstallacio: "ED001",
      //   embedUrl: "https://besostordera.autodesk360.com/shares/public/XXX?mode=embed",
      // },
    ],
  },
  // Afegeix més sistemes aquí:
  // {
  //   id: "bombaments",
  //   nom: "Estacions de Bombament",
  //   descripcio: "Estacions de bombament d'aigües",
  //   icona: "⚙️",
  //   color: "#6366F1",
  //   installacions: [],
  // },
];

// ─── Component principal ──────────────────────────────────────────────────────

export function Visualitzador3DPage() {
  const [sistemaActiu, setSistemaActiu] = useState<Sistema | null>(
    SISTEMES_DATA.length > 0 ? SISTEMES_DATA[0] : null
  );
  const [installacioActiva, setInstallacioActiva] = useState<Installacio | null>(
    SISTEMES_DATA[0]?.installacions[0] ?? null
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleSelectSistema = (sistema: Sistema) => {
    setSistemaActiu(sistema);
    setIframeError(false);
    // Selecciona la primera instal·lació del sistema automàticament
    setInstallacioActiva(sistema.installacions[0] ?? null);
  };

  const handleSelectInstallacio = (inst: Installacio) => {
    setIframeError(false);
    setInstallacioActiva(inst);
  };

  return (
    <div className="space-y-5">
      {/* Capçalera */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Box className="h-6 w-6 text-[#0099A8]" />
          Visualitzador 3D
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Explora els models BIM de les instal·lacions del Consorci Besòs Tordera
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* ── Panell lateral: Sistemes i Instal·lacions ────────────────────── */}
        <div className="space-y-3">
          {/* Selector de Sistema */}
          <div>
            <div
              className="flex items-center gap-1.5 px-1 py-1 mb-2"
              style={{
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "rgba(0,0,0,0.3)",
              }}
            >
              <Layers className="h-3 w-3" />
              <span>Sistemes</span>
            </div>
            <div className="space-y-1">
              {SISTEMES_DATA.map((sistema) => {
                const isActive = sistemaActiu?.id === sistema.id;
                return (
                  <button
                    key={sistema.id}
                    onClick={() => handleSelectSistema(sistema)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150",
                      isActive
                        ? "shadow-sm"
                        : "hover:bg-slate-100"
                    )}
                    style={
                      isActive
                        ? {
                            background: `${sistema.color}12`,
                            border: `1px solid ${sistema.color}30`,
                          }
                        : {
                            border: "1px solid transparent",
                          }
                    }
                  >
                    <span
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                      style={{
                        background: isActive ? `${sistema.color}20` : "#f1f5f9",
                      }}
                    >
                      {sistema.icona ?? "🏭"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[13px] font-semibold truncate leading-tight"
                        style={{ color: isActive ? sistema.color : "#475569" }}
                      >
                        {sistema.nom}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate leading-tight">
                        {sistema.installacions.length} instal·lació
                        {sistema.installacions.length !== 1 ? "ns" : ""}
                      </p>
                    </div>
                    {isActive && (
                      <ChevronRight
                        className="h-4 w-4 shrink-0"
                        style={{ color: sistema.color }}
                      />
                    )}
                  </button>
                );
              })}

              {SISTEMES_DATA.length === 0 && (
                <p className="text-xs text-slate-400 italic px-3 py-4 text-center">
                  No hi ha sistemes configurats
                </p>
              )}
            </div>
          </div>

          {/* Selector d'Instal·lació */}
          {sistemaActiu && sistemaActiu.installacions.length > 0 && (
            <div>
              <div
                className="flex items-center gap-1.5 px-1 py-1 mb-2"
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "rgba(0,0,0,0.3)",
                }}
              >
                <MapPin className="h-3 w-3" />
                <span>Instal·lacions — {sistemaActiu.nom}</span>
              </div>
              <Card className="border-slate-100 shadow-sm bg-white overflow-hidden p-0">
                <div className="divide-y divide-slate-50">
                  {sistemaActiu.installacions.map((inst) => {
                    const isActive = installacioActiva?.id === inst.id;
                    return (
                      <button
                        key={inst.id}
                        onClick={() => handleSelectInstallacio(inst)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150",
                          isActive
                            ? ""
                            : "hover:bg-slate-50"
                        )}
                        style={
                          isActive
                            ? { background: `${sistemaActiu.color}08` }
                            : {}
                        }
                      >
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{
                            background: isActive ? sistemaActiu.color : "#cbd5e1",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[12.5px] font-medium truncate leading-tight"
                            style={{
                              color: isActive ? sistemaActiu.color : "#475569",
                            }}
                          >
                            {inst.nom}
                          </p>
                          {inst.codiInstallacio && (
                            <p className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                              {inst.codiInstallacio}
                            </p>
                          )}
                        </div>
                        {isActive && (
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: sistemaActiu.color }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {sistemaActiu && sistemaActiu.installacions.length === 0 && (
            <Card className="border-slate-100 shadow-sm bg-white p-6 text-center">
              <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                No hi ha instal·lacions configurades per a aquest sistema.
              </p>
            </Card>
          )}
        </div>

        {/* ── Visor 3D principal ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {installacioActiva ? (
            <>
              {/* Capçalera del visor */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: `${sistemaActiu?.color ?? "#0099A8"}15`,
                        color: sistemaActiu?.color ?? "#0099A8",
                      }}
                    >
                      {sistemaActiu?.nom}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                    <span className="text-sm font-semibold text-slate-700">
                      {installacioActiva.nom}
                    </span>
                    {installacioActiva.codiInstallacio && (
                      <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px] font-mono">
                        {installacioActiva.codiInstallacio}
                      </Badge>
                    )}
                  </div>
                  {installacioActiva.descripcio && (
                    <p className="text-xs text-slate-400 mt-1">
                      {installacioActiva.descripcio}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs border-slate-200 text-slate-500 hover:text-[#006E7A]"
                  onClick={() => setFullscreen(true)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Pantalla completa
                </Button>
              </div>

              {/* Iframe del model 3D */}
              <Card className="border-slate-100 shadow-sm bg-white overflow-hidden p-0">
                <div
                  className="relative w-full"
                  style={{ paddingBottom: "56.25%", minHeight: "400px" }}
                >
                  {iframeError ? (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50 px-8 text-center"
                    >
                      <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                        <AlertTriangle className="h-6 w-6 text-amber-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-600 text-sm">
                          No s'ha pogut carregar el model 3D
                        </p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-sm">
                          Autodesk 360 ha rebutjat la connexió. Comprova que el model
                          estigui compartit com a <strong>Public</strong> amb embedding
                          activat, i que el domini estigui permès a la configuració del hub.
                        </p>
                      </div>
                      <a
                        href={installacioActiva.embedUrl.replace("?mode=embed", "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-[#0099A8] hover:underline font-medium"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Obrir directament a Autodesk 360
                      </a>
                    </div>
                  ) : (
                    <iframe
                      ref={iframeRef}
                      key={installacioActiva.id}
                      src={installacioActiva.embedUrl}
                      title={installacioActiva.nom}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        border: "none",
                      }}
                      allowFullScreen
                      onError={() => setIframeError(true)}
                      onLoad={(e) => {
                        // Detecta si l'iframe s'ha carregat buit (connexió refusada)
                        try {
                          const frame = e.currentTarget as HTMLIFrameElement;
                          // Si el document és accessible i el title és buit o error, marca error
                          if (frame.contentDocument !== null) {
                            const title = frame.contentDocument?.title ?? "";
                            if (title.toLowerCase().includes("error") || title === "") {
                              setIframeError(true);
                            }
                          }
                        } catch {
                          // Cross-origin: no podem llegir el contingut, és normal
                          // Si el navegador ha mostrat "refused to connect" ho detectarà onError
                        }
                      }}
                    />
                  )}
                </div>
              </Card>

              {/* Info addicional */}
              <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Model allotjat a Autodesk 360. Utilitza el ratolí per orbitar,
                  fer zoom i fer panar el model 3D.
                </span>
              </div>
            </>
          ) : (
            /* Estat buit */
            <Card className="border-slate-100 shadow-sm bg-white flex flex-col items-center justify-center p-16 text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                <Box className="h-6 w-6 text-slate-300" />
              </div>
              <div>
                <p className="font-semibold text-slate-500 text-[14px]">
                  Selecciona una instal·lació
                </p>
                <p className="text-[12.5px] text-slate-400 mt-1 leading-relaxed">
                  Escull un sistema al panell esquerre i<br />
                  selecciona una instal·lació per veure el model 3D.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Modal pantalla completa ────────────────────────────────────────── */}
      {fullscreen && installacioActiva && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "#000" }}
        >
          {/* Barra superior */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{
              background: "rgba(0,0,0,0.85)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-[#4DC9D8]" />
              <span className="text-sm font-semibold text-white/80">
                {installacioActiva.nom}
              </span>
              {installacioActiva.codiInstallacio && (
                <span className="font-mono text-[10px] text-white/40">
                  {installacioActiva.codiInstallacio}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/50 hover:text-white hover:bg-white/10 gap-1.5"
              onClick={() => setFullscreen(false)}
            >
              <X className="h-4 w-4" />
              Tanca
            </Button>
          </div>

          {/* Iframe a tota pantalla */}
          <iframe
            key={`fs-${installacioActiva.id}`}
            src={installacioActiva.embedUrl}
            title={installacioActiva.nom}
            style={{ flex: 1, border: "none", width: "100%" }}
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}
