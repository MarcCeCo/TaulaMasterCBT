// src/components/cbt/VisorPublicPage.tsx
//
// Pàgina PÚBLICA del Visor 3D (/public/visor/<token>): mostra en només lectura el
// model MASTER d'una instal·lació a persones externes, sense iniciar sessió.
// No carrega cap dada interna de la plataforma (ni TAGs, ni jerarquia, ni equips):
// només el visor 3D, amb la vista «Estat actual».

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import "@/styles.css";
import { Button } from "@/components/ui/button";
import { useApsViewer } from "@/components/cbt/Visualitzador3DPage";
import {
  carregaVisorPublic,
  creaProveidorTokenPublic,
  PublicLinkError,
  type DadesVisorPublic,
} from "@/lib/publicLinks";
import type { Installacio } from "@/hooks/useVisor3DSistemes";

const COLOR = "#0099A8";

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center">
      {children}
    </div>
  );
}

function VisorPublicInner({
  dades,
  token,
}: {
  dades: DadesVisorPublic;
  token: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const installacio = useMemo<Installacio>(
    () =>
      ({
        id: "public",
        nom: dades.installacio.nom,
        codiInstallacio: dades.installacio.codi,
        urnMaster: dades.urn,
      }) as Installacio,
    [dades],
  );
  const obteToken = useMemo(
    () => creaProveidorTokenPublic(token, dades),
    [token, dades],
  );

  const { estat, error, reintentar } = useApsViewer(containerRef, installacio, {
    obteToken,
    nomesEstatActual: true,
  });
  const carregant = estat !== "ok" && estat !== "error";

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="h-7 w-1 rounded-full" style={{ background: COLOR }} />
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: COLOR }}
          >
            Consorci Besòs Tordera · Visor 3D
          </p>
          <p className="text-sm font-bold text-slate-800 uppercase tracking-wide truncate">
            {dades.installacio.nom}
            {dades.installacio.codi && (
              <span className="ml-2 text-[10px] font-mono font-normal text-slate-400">
                {dades.installacio.codi}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-slate-900">
        {carregant && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-900">
            <Loader2 className="h-8 w-8 animate-spin text-[#0099A8]" />
            <p className="text-sm font-semibold text-white">
              {estat === "carregant-model"
                ? "Carregant el model 3D…"
                : "Preparant el visor…"}
            </p>
          </div>
        )}
        {estat === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8 text-center bg-slate-900">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <div>
              <p className="font-semibold text-white text-sm">
                No s'ha pogut carregar el model 3D
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
                {error}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={reintentar}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reintentar
            </Button>
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ visibility: estat === "ok" ? "visible" : "hidden" }}
        />
      </div>

      <footer className="px-4 py-1.5 border-t border-slate-100 text-[10px] text-slate-400 shrink-0">
        Visualització en només lectura
        {dades.expires_at &&
          ` · Enllaç vàlid fins al ${new Date(dades.expires_at).toLocaleDateString("ca-ES")}`}
      </footer>
    </div>
  );
}

export function VisorPublicPage() {
  // /public/visor/<token>
  const token = useMemo(
    () => window.location.pathname.split("/").filter(Boolean)[2] ?? "",
    [],
  );
  const [dades, setDades] = useState<DadesVisorPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Visor 3D · Consorci Besòs Tordera";
    // L'enllaç és privat: que cap cercador l'indexi
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    carregaVisorPublic(token)
      .then((d) => !cancel && setDades(d))
      .catch((e) => {
        if (cancel) return;
        setError(
          e instanceof PublicLinkError
            ? e.message
            : "No s'ha pogut obrir el model.",
        );
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  if (error) {
    return (
      <Pantalla>
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-white font-semibold">{error}</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Si creus que és un error, demana un enllaç nou a qui te'l va
          compartir.
        </p>
      </Pantalla>
    );
  }
  if (!dades) {
    return (
      <Pantalla>
        <Loader2 className="h-8 w-8 animate-spin text-[#0099A8]" />
        <p className="text-sm text-slate-300">Obrint el model…</p>
      </Pantalla>
    );
  }
  return <VisorPublicInner dades={dades} token={token} />;
}
