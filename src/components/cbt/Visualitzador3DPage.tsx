// src/components/cbt/Visualitzador3DPage.tsx
//
// Pàgina Visualitzador 3D
// ─────────────────────────────────────────────────────────────────────────────
// Llista totes les instal·lacions agrupades per sistema en una taula.
// Clicar "Visualitzar" obre el Viewer SDK d'Autodesk APS carregant el model
// directament via URN (sense iframe ni URL compartida manual).
// Admins/Editors poden crear, editar i eliminar sistemes i instal·lacions.
// Les dades es persisteixen a Supabase (taules: visor3d_sistemes, visor3d_installacions).

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  Monitor,
  Plus,
  Pencil,
  Trash2,
  Settings,
  X,
  Check,
  AlignLeft,
  Palette,
  Search,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useVisor3DSistemes,
  type Sistema,
  type Installacio,
} from "@/hooks/useVisor3DSistemes";

// ─── Helper: codi de sistema derivat de les instal·lacions ───────────────────
// Llegeix els codiInstallacio del sistema i extreu el codi numèric del primer
// que comenci per "ed0" (ex: "ED005" → "005"). Serveix per mostrar el codi
// al costat del nom i per ordenar la llista de sistemes numèricament.

function codiSistema(sistema: Sistema): string {
  // 1. Camp persistit a Supabase (prioritat màxima)
  if (sistema.codi?.trim()) return sistema.codi.trim();
  // 2. Fallback: derivat del primer codiInstallacio que comenci per ED0
  const regex = /^ed0*(\d+)/i;
  for (const inst of sistema.installacions) {
    const codi = inst.codiInstallacio ?? "";
    const m = codi.match(regex);
    if (m) return m[1].padStart(3, "0");
  }
  return "";
}

function codiSistemaNumeric(sistema: Sistema): number {
  const c = codiSistema(sistema);
  return c ? parseInt(c, 10) : 99999;
}

// ─── Colors predefinits ───────────────────────────────────────────────────────

const COLORS_PRESET = [
  "#0099A8", "#6366F1", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
  "#06B6D4", "#84CC16", "#64748B", "#0EA5E9",
];

// ─── Formulari Sistema ────────────────────────────────────────────────────────

interface SistemaFormData { nom: string; descripcio: string; codi: string; color: string; }
const SISTEMA_BUIT: SistemaFormData = { nom: "", descripcio: "", codi: "", color: "#0099A8" };

function SistemaFormDialog({ open, onClose, onSave, initial, title, saving }: {
  open: boolean; onClose: () => void;
  onSave: (d: SistemaFormData) => void;
  initial?: SistemaFormData; title: string;
  saving?: boolean;
}) {
  const [form, setForm] = useState<SistemaFormData>(initial ?? SISTEMA_BUIT);
  useEffect(() => { if (open) setForm(initial ?? SISTEMA_BUIT); }, [open, initial]);
  const valid = form.nom.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 text-sm font-bold uppercase tracking-wide">
            <Building2 className="h-4 w-4 text-[#0099A8]" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <AlignLeft className="h-3 w-3" /> Nom del sistema *
            </Label>
            <Input value={form.nom} onChange={(e) => setForm(f => ({ ...f, nom: e.target.value }))}
              placeholder="p.ex. ESTACIONS DEPURADORES" className="text-sm uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <AlignLeft className="h-3 w-3" /> Descripció
            </Label>
            <Input value={form.descripcio} onChange={(e) => setForm(f => ({ ...f, descripcio: e.target.value }))}
              placeholder="Descripció breu (opcional)" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Box className="h-3 w-3 text-[#0099A8]" /> Codi del sistema
              <span className="text-[10px] font-normal text-slate-400 ml-1">(ex: 005, 012)</span>
            </Label>
            <Input
              value={form.codi}
              onChange={(e) => setForm(f => ({ ...f, codi: e.target.value.toUpperCase() }))}
              placeholder="p.ex. 005"
              className="text-sm font-mono w-32"
              maxLength={10}
            />
            <p className="text-[10.5px] text-slate-400 leading-relaxed">
              S'omple automàticament des del codi d'instal·lació (ED0XX → XX).
              Pots sobreescriure'l manualment si cal.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Palette className="h-3 w-3" /> Color del sistema
            </Label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLORS_PRESET.map((c) => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={cn("h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                    form.color === c ? "border-slate-700 scale-110" : "border-transparent")}
                  style={{ background: c }} />
              ))}
              <input type="color" value={form.color}
                onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                className="h-7 w-7 rounded-full border-0 cursor-pointer bg-transparent" title="Color personalitzat" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel·lar</Button>
          <Button size="sm" disabled={!valid || saving} onClick={() => valid && onSave(form)}
            className="bg-[#0099A8] hover:bg-[#007a87] text-white">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            Desar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Formulari Instal·lació ───────────────────────────────────────────────────
// El camp URN s'omple automàticament via l'agent APS. El formulari manual
// permet afegir/corregir URNs i conserva embedUrl com a fallback.

interface InstallacioFormData {
  nom: string;
  descripcio: string;
  codiInstallacio: string;
  embedUrl: string;
  urn: string;
}
const INSTALLACIO_BUIDA: InstallacioFormData = {
  nom: "", descripcio: "", codiInstallacio: "", embedUrl: "", urn: "",
};

function InstallacioFormDialog({ open, onClose, onSave, initial, title, sistemaColor, sistemaNom, saving }: {
  open: boolean; onClose: () => void;
  onSave: (d: InstallacioFormData) => void;
  initial?: InstallacioFormData; title: string;
  sistemaColor: string; sistemaNom: string;
  saving?: boolean;
}) {
  const [form, setForm] = useState<InstallacioFormData>(initial ?? INSTALLACIO_BUIDA);
  useEffect(() => { if (open) setForm(initial ?? INSTALLACIO_BUIDA); }, [open, initial]);
  const valid = form.nom.trim().length > 0 && (form.urn.trim().length > 0 || form.embedUrl.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 text-sm font-bold uppercase tracking-wide">
            <Monitor className="h-4 w-4" style={{ color: sistemaColor }} /> {title}
          </DialogTitle>
          <p className="text-xs text-slate-400 mt-1">Sistema: <span className="font-semibold uppercase" style={{ color: sistemaColor }}>{sistemaNom}</span></p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nom de la instal·lació *</Label>
            <Input value={form.nom} onChange={(e) => setForm(f => ({ ...f, nom: e.target.value }))}
              placeholder="p.ex. ED005 LA LLAGOSTA" className="text-sm uppercase" />
          </div>
          <div className="flex gap-3">
            <div className="space-y-1.5 w-36">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Codi</Label>
              <Input value={form.codiInstallacio} onChange={(e) => setForm(f => ({ ...f, codiInstallacio: e.target.value }))}
                placeholder="ED005" className="text-sm font-mono" />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Descripció</Label>
              <Input value={form.descripcio} onChange={(e) => setForm(f => ({ ...f, descripcio: e.target.value }))}
                placeholder="Descripció breu (opcional)" className="text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Box className="h-3 w-3 text-[#0099A8]" /> URN del model APS
              <span className="text-[10px] font-normal text-[#0099A8] bg-[#0099A8]/10 px-1.5 py-0.5 rounded ml-1">recomanat</span>
            </Label>
            <Input value={form.urn} onChange={(e) => setForm(f => ({ ...f, urn: e.target.value }))}
              placeholder="urn:adsk.wipprod:dm.lineage:XXXX…"
              className="text-xs font-mono" />
            <p className="text-[10.5px] text-slate-400 leading-relaxed">
              L'agent APS omple aquest camp automàticament. Normalment no cal introduir-lo manualment.
            </p>
          </div>

          <details className="group">
            <summary className="text-[10.5px] text-slate-400 cursor-pointer hover:text-slate-600 select-none list-none flex items-center gap-1">
              <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
              URL embed de fallback (opcional)
            </summary>
            <div className="mt-2 space-y-1.5">
              <Input value={form.embedUrl} onChange={(e) => setForm(f => ({ ...f, embedUrl: e.target.value }))}
                placeholder="https://besostordera.autodesk360.com/…?mode=embed"
                className="text-xs font-mono" />
              <p className="text-[10.5px] text-slate-400">S'usa com a últim recurs si no hi ha URN vàlid.</p>
            </div>
          </details>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel·lar</Button>
          <Button size="sm" disabled={!valid || saving} onClick={() => valid && onSave(form)}
            style={{ background: sistemaColor }} className="text-white hover:opacity-90">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            Desar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Viewer SDK d'Autodesk APS ────────────────────────────────────────────────
//
// Carrega el Viewer SDK via CDN i renderitza el model identificat per l'URN.
// Flux:
//   1. Injecta CSS + JS del Viewer SDK
//   2. Demana token 2-legged a /api/aps-token de l'agent
//   3. Inicialitza Autodesk.Viewing.Initializer
//   4. Crea GuiViewer3D i carrega el document (URN)

const VIEWER_CSS_URL = "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.99/style.css";
const VIEWER_JS_URL  = "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.99/viewer3D.min.js";

declare global {
  interface Window {
    Autodesk?: any;
    _apsViewerScriptsLoaded?: boolean;
  }
}

function injectaViewerSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window._apsViewerScriptsLoaded && window.Autodesk?.Viewing) { resolve(); return; }

    if (!document.querySelector("link[data-aps-viewer]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = VIEWER_CSS_URL;
      link.setAttribute("data-aps-viewer", "true");
      document.head.appendChild(link);
    }

    if (!document.querySelector("script[data-aps-viewer]")) {
      const script = document.createElement("script");
      script.src = VIEWER_JS_URL;
      script.setAttribute("data-aps-viewer", "true");
      script.onload = () => { window._apsViewerScriptsLoaded = true; resolve(); };
      script.onerror = () => reject(new Error("No s'ha pogut carregar el Viewer SDK d'Autodesk."));
      document.head.appendChild(script);
    } else {
      const check = setInterval(() => {
        if (window.Autodesk?.Viewing) { clearInterval(check); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error("Timeout carregant Viewer SDK.")); }, 20000);
    }
  });
}

type ViewerEstat = "idle" | "carregant-sdk" | "carregant-token" | "inicialitzant" | "carregant-model" | "ok" | "error";

// ─── Tipus per a les vistes del model ────────────────────────────────────────

interface VistaModel {
  node: any;          // Autodesk.Viewing.BubbleNode
  nom: string;
  rol: "3d" | "2d";
  index: number;
}

// ─── Hook useApsViewer ────────────────────────────────────────────────────────

function useApsViewer(
  containerRef: React.RefObject<HTMLDivElement>,
  urn: string | undefined,
  agentUrl: string | undefined
) {
  const [estat, setEstat]         = useState<ViewerEstat>("idle");
  const [error, setError]         = useState<string | null>(null);
  const [vistes, setVistes]       = useState<VistaModel[]>([]);
  const [vistaActual, setVistaActual] = useState<number>(0);
  const [canviantVista, setCanviantVista] = useState(false);

  const viewerRef  = useRef<any>(null);
  const docRef     = useRef<any>(null);   // Autodesk.Viewing.Document
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (viewerRef.current) {
        try { viewerRef.current.finish(); } catch { /* ignora */ }
        viewerRef.current = null;
      }
    };
  }, []);

  const inicialitza = useCallback(async () => {
    // Espera que el container del DOM estigui disponible (race condition amb Dialog Radix)
    if (!containerRef.current) {
      let waited = 0;
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          waited += 50;
          if (containerRef.current || waited >= 2000) { clearInterval(poll); resolve(); }
        }, 50);
      });
    }

    if (!containerRef.current || !urn) {
      setEstat("error");
      setError("No hi ha URN assignat a aquesta instal·lació. Executa l'agent APS per sincronitzar.");
      return;
    }
    if (!mountedRef.current) return;

    // Neteja viewer anterior
    if (viewerRef.current) {
      try { viewerRef.current.finish(); } catch { /* ignora */ }
      viewerRef.current = null;
    }
    docRef.current = null;
    setVistes([]);
    setVistaActual(0);
    setEstat("carregant-sdk");
    setError(null);

    try {
      await injectaViewerSDK();
      if (!mountedRef.current) return;

      setEstat("carregant-token");
      const tokenUrl = agentUrl ? `${agentUrl}/api/aps-token` : "/api/aps-token";
      const tokenResp = await fetch(tokenUrl);
      if (!tokenResp.ok) throw new Error(`Error obtenint token APS: ${tokenResp.status}`);
      const { access_token, expires_in } = await tokenResp.json() as {
        access_token: string; expires_in: number;
      };
      if (!mountedRef.current) return;

      setEstat("inicialitzant");
      const AV = window.Autodesk.Viewing;

      // Normalitza URN → base64url sense padding
      const urnB64 = urn.startsWith("urn:")
        ? btoa(urn).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
        : urn;

      await new Promise<void>((res) => {
        AV.Initializer(
          {
            env: "AutodeskProduction2",
            api: "streamingV2",
            getAccessToken: (cb: (t: string, e: number) => void) => cb(access_token, expires_in),
          },
          () => res()
        );
      });
      if (!mountedRef.current) return;

      const viewer = new AV.GuiViewer3D(containerRef.current);
      viewer.start();
      viewerRef.current = viewer;

      setEstat("carregant-model");

      await new Promise<void>((res, rej) => {
        AV.Document.load(
          `urn:${urnB64}`,
          (doc: any) => {
            if (!mountedRef.current) { rej(new Error("_desmontat_")); return; }
            docRef.current = doc;

            // Recull totes les vistes publicades (3D i 2D).
            // Fusion Teams pot publicar geometries com a tipus "geometry" o "lmvdoc".
            // Provem múltiples estratègies per trobar nodes carregables.
            const root = doc.getRoot();

            const nodes3d: any[] = root.search({ type: "geometry", role: "3d" }) ?? [];
            const nodes2d: any[] = root.search({ type: "geometry", role: "2d" }) ?? [];

            // Fallback 1: Fusion Teams de vegades usa "lmvdoc" com a tipus de geometry
            const nodesLmv: any[] = (nodes3d.length === 0 && nodes2d.length === 0)
              ? (root.search({ type: "resource", role: "graphics" }) ?? [])
              : [];

            console.log(`[Viewer] Nodes trobats — 3D: ${nodes3d.length}, 2D: ${nodes2d.length}, lmv/graphics: ${nodesLmv.length}`);

            const toVista = (role: "3d" | "2d") => (node: any, i: number): VistaModel => ({
              node,
              nom: node.name() || node.guid() || `Vista ${i + 1}`,
              rol: role,
              index: i,
            });
            const toVistaLmv = (node: any, i: number): VistaModel => ({
              node,
              nom: node.name() || node.guid() || `Vista ${i + 1}`,
              rol: "3d",
              index: i,
            });

            const totes: VistaModel[] = [
              ...nodes3d.map(toVista("3d")),
              ...nodes2d.map(toVista("2d")),
              ...nodesLmv.map(toVistaLmv),
            ];

            // Fallback 2: getDefaultGeometry amb el flag 'true' per incloure sheets 2D
            // Fallback 3: primer fill del root (per manifests de Fusion amb estructura plana)
            const primerNode: any =
              totes[0]?.node
              ?? root.getDefaultGeometry(true)
              ?? root.getDefaultGeometry()
              ?? (() => {
                const fills = root.search({}) ?? [];
                return fills.find((n: any) => n !== root) ?? null;
              })();

            if (!primerNode) {
              console.error(`[Viewer] Cap node carregable trobat. URN: ${urnB64}`);
              rej(new Error("El model no té geometries disponibles. Pot ser que la traducció APS no s'hagi completat, hagi fallat, o el manifest no contingui vistes 3D/2D."));
              return;
            }

            console.log(`[Viewer] Carregant node: ${primerNode.name?.() ?? primerNode.guid?.() ?? "sense nom"}`);

            viewer.loadDocumentNode(doc, primerNode);

            setVistes(totes);
            setVistaActual(0);
            setEstat("ok");
            res();
          },
          (code: number, msg: string) => {
            rej(new Error(`Error APS (codi ${code}): ${msg}`));
          }
        );
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "_desmontat_") return;
      setError(msg);
      setEstat("error");
    }
  }, [containerRef, urn, agentUrl]);

  // Canvia a una vista concreta
  const carregaVista = useCallback(async (idx: number) => {
    const vista = vistes[idx];
    if (!vista || !viewerRef.current || !docRef.current || canviantVista) return;
    setCanviantVista(true);
    try {
      await viewerRef.current.loadDocumentNode(docRef.current, vista.node);
      setVistaActual(idx);
    } catch { /* ignora errors de transició */ }
    finally { setCanviantVista(false); }
  }, [vistes, canviantVista]);

  useEffect(() => { inicialitza(); }, [inicialitza]);

  return { estat, error, reintentar: inicialitza, vistes, vistaActual, carregaVista, canviantVista };
}

// ─── Selector de vistes ───────────────────────────────────────────────────────

function SelectorVistes({ vistes, vistaActual, canviantVista, onSeleccionar, sistemaColor }: {
  vistes: VistaModel[];
  vistaActual: number;
  canviantVista: boolean;
  onSeleccionar: (idx: number) => void;
  sistemaColor: string;
}) {
  const [obert, setObert] = useState(false);
  const [filtre, setFiltre] = useState("");
  const panellRef = useRef<HTMLDivElement>(null);

  // Tanca el panell si es clica fora
  useEffect(() => {
    if (!obert) return;
    const handle = (e: MouseEvent) => {
      if (panellRef.current && !panellRef.current.contains(e.target as Node)) setObert(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [obert]);

  if (vistes.length === 0) return null;

  const vistes3d = vistes.filter(v => v.rol === "3d");
  const vistes2d = vistes.filter(v => v.rol === "2d");
  const vistasel = vistes[vistaActual];

  const filtrades3d = vistes3d.filter(v => v.nom.toLowerCase().includes(filtre.toLowerCase()));
  const filtrades2d = vistes2d.filter(v => v.nom.toLowerCase().includes(filtre.toLowerCase()));

  return (
    <div className="relative shrink-0" ref={panellRef}>
      {/* Botó principal */}
      <button
        onClick={() => setObert(o => !o)}
        disabled={canviantVista}
        className={cn(
          "flex items-center gap-2 h-7 pl-2.5 pr-2 rounded-lg border text-[11px] font-semibold transition-all select-none",
          "bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-slate-600",
          obert && "bg-slate-700 border-slate-500",
          canviantVista && "opacity-60 cursor-wait"
        )}
      >
        {canviantVista
          ? <Loader2 className="h-3 w-3 animate-spin text-slate-400 shrink-0" />
          : <Monitor className="h-3 w-3 shrink-0" style={{ color: vistasel?.rol === "2d" ? "#94a3b8" : sistemaColor }} />
        }
        <span className="max-w-[160px] truncate hidden sm:block">
          {vistasel?.nom ?? "Vistes"}
        </span>
        <span
          className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0"
          style={{ background: `${sistemaColor}25`, color: sistemaColor }}
        >
          {vistes.length}
        </span>
        <ChevronDown className={cn("h-3 w-3 text-slate-400 transition-transform shrink-0", obert && "rotate-180")} />
      </button>

      {/* Panell desplegable */}
      {obert && (
        <div className={cn(
          "absolute right-0 top-9 z-50 w-72 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl",
          "flex flex-col overflow-hidden"
        )}>
          {/* Capçalera */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Vistes publicades
            </p>
            {vistes.length > 5 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filtrar vistes…"
                  value={filtre}
                  onChange={e => setFiltre(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 outline-none focus:border-slate-500 transition-colors"
                />
              </div>
            )}
          </div>

          {/* Llista de vistes */}
          <div className="overflow-y-auto max-h-72 py-1.5 space-y-0.5 px-1.5">

            {filtrades3d.length > 0 && (
              <>
                {vistes2d.length > 0 && (
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-600">
                    3D
                  </p>
                )}
                {filtrades3d.map((v) => (
                  <button
                    key={v.index}
                    onClick={() => { onSeleccionar(v.index); setObert(false); setFiltre(""); }}
                    disabled={canviantVista}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all",
                      vistaActual === v.index
                        ? "text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white",
                      canviantVista && "opacity-50 cursor-wait"
                    )}
                    style={vistaActual === v.index ? { background: `${sistemaColor}20` } : undefined}
                  >
                    <div
                      className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                      style={vistaActual === v.index
                        ? { background: `${sistemaColor}30`, color: sistemaColor }
                        : { background: "#1e293b", color: "#64748b" }}
                    >
                      <Box className="h-2.5 w-2.5" />
                    </div>
                    <span className="text-[11px] font-medium truncate flex-1">{v.nom}</span>
                    {vistaActual === v.index && (
                      <Check className="h-3 w-3 shrink-0" style={{ color: sistemaColor }} />
                    )}
                  </button>
                ))}
              </>
            )}

            {filtrades2d.length > 0 && (
              <>
                <p className="px-2 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-600">
                  2D — Plantes i seccions
                </p>
                {filtrades2d.map((v) => (
                  <button
                    key={v.index}
                    onClick={() => { onSeleccionar(v.index); setObert(false); setFiltre(""); }}
                    disabled={canviantVista}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all",
                      vistaActual === v.index
                        ? "text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white",
                      canviantVista && "opacity-50 cursor-wait"
                    )}
                    style={vistaActual === v.index ? { background: "#94a3b820" } : undefined}
                  >
                    <div
                      className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                      style={vistaActual === v.index
                        ? { background: "#94a3b820", color: "#94a3b8" }
                        : { background: "#1e293b", color: "#64748b" }}
                    >
                      <AlignLeft className="h-2.5 w-2.5" />
                    </div>
                    <span className="text-[11px] font-medium truncate flex-1">{v.nom}</span>
                    {vistaActual === v.index && (
                      <Check className="h-3 w-3 shrink-0 text-slate-400" />
                    )}
                  </button>
                ))}
              </>
            )}

            {filtrades3d.length === 0 && filtrades2d.length === 0 && (
              <p className="px-3 py-4 text-center text-[11px] text-slate-500 italic">
                Cap vista coincideix amb "{filtre}"
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pop-up Visor 3D ──────────────────────────────────────────────────────────

function Visor3DDialog({ installacio, sistema, onClose }: {
  installacio: Installacio; sistema: Sistema; onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const agentUrl = (import.meta.env.VITE_AGENT_URL as string | undefined)?.trim();

  // URN directe o fallback del viewer genèric (https://viewer.autodesk.com/id/URN)
  const urn = installacio.urn ?? (() => {
    if (!installacio.embedUrl) return undefined;
    try {
      const m = new URL(installacio.embedUrl).pathname.match(/\/id\/(.+)/);
      return m ? decodeURIComponent(m[1]) : undefined;
    } catch { return undefined; }
  })();

  const {
    estat, error, reintentar,
    vistes, vistaActual, carregaVista, canviantVista,
  } = useApsViewer(containerRef, urn, agentUrl);
  const carregant = estat !== "ok" && estat !== "error";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* [&>button]:hidden amaga el botó X per defecte de Radix per evitar solapament */}
      <DialogContent className="max-w-[92vw] w-full p-0 gap-0 overflow-hidden [&>button:last-child]:hidden" style={{ maxHeight: "90vh" }}>

        {/* DialogTitle ocult però present per accessibilitat (Radix ho requereix) */}
        <DialogHeader className="sr-only">
          <DialogTitle>{sistema.nom} — {installacio.nom}</DialogTitle>
        </DialogHeader>

        {/* Capçalera personalitzada */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white shrink-0">
          <div className="h-7 w-1 rounded-full shrink-0" style={{ background: sistema.color }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: sistema.color }}>
                {sistema.nom}
              </span>
              <ChevronRight className="h-3 w-3 text-slate-300" />
              <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                {installacio.nom}
              </span>
              {installacio.codiInstallacio && (
                <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px] font-mono">
                  {installacio.codiInstallacio}
                </Badge>
              )}
            </div>
            {installacio.descripcio && (
              <p className="text-xs text-slate-400 mt-0.5">{installacio.descripcio}</p>
            )}
          </div>

          {/* Selector de vistes (visible quan el model ha carregat) */}
          {estat === "ok" && (
            <SelectorVistes
              vistes={vistes}
              vistaActual={vistaActual}
              canviantVista={canviantVista}
              onSeleccionar={carregaVista}
              sistemaColor={sistema.color}
            />
          )}

          {/* Botó tancar propi — sense solapament amb el de Radix */}
          <button
            onClick={onClose}
            aria-label="Tancar"
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative w-full bg-slate-900" style={{ height: "75vh" }}>

          {carregant && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-900">
              <Loader2 className="h-8 w-8 animate-spin text-[#0099A8]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-white">
                  {estat === "carregant-sdk"   && "Carregant Viewer SDK…"}
                  {estat === "carregant-token" && "Autenticant amb APS…"}
                  {estat === "inicialitzant"   && "Inicialitzant el visor…"}
                  {estat === "carregant-model" && "Carregant el model 3D…"}
                  {estat === "idle"            && "Preparant…"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {installacio.codiInstallacio} — {installacio.nom}
                </p>
              </div>
            </div>
          )}

          {estat === "error" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8 text-center bg-slate-900">
              <div className="h-12 w-12 rounded-2xl bg-red-900/30 border border-red-800/40 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">No s'ha pogut carregar el model 3D</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-sm">{error}</p>
                {!urn && (
                  <p className="text-xs text-amber-400 mt-2 leading-relaxed max-w-sm">
                    Executa l'agent APS per sincronitzar l'URN d'aquesta instal·lació.
                  </p>
                )}
              </div>
              {urn && (
                <Button size="sm" variant="outline"
                  className="gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={reintentar}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </Button>
              )}
            </div>
          )}

          {/* El div del Viewer SDK — sempre muntat, ocult fins que carregui */}
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ visibility: estat === "ok" ? "visible" : "hidden" }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fila de grup (sistema) ───────────────────────────────────────────────────

function SistemaGroup({
  sistema, expanded, onToggle, canEdit, modeAdmin,
  onEditSistema, onDeleteSistema, onAddInstallacio, onEditInstallacio, onDeleteInstallacio,
  onVisualitzar, filterQ,
}: {
  sistema: Sistema; expanded: boolean; onToggle: () => void; canEdit: boolean; modeAdmin: boolean;
  onEditSistema: () => void; onDeleteSistema: () => void;
  onAddInstallacio: () => void;
  onEditInstallacio: (i: Installacio) => void;
  onDeleteInstallacio: (i: Installacio) => void;
  onVisualitzar: (i: Installacio) => void;
  filterQ: string;
}) {
  const filtered = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    if (!q) return sistema.installacions;
    return sistema.installacions.filter(i =>
      i.nom.toLowerCase().includes(q) ||
      (i.codiInstallacio ?? "").toLowerCase().includes(q) ||
      (i.descripcio ?? "").toLowerCase().includes(q)
    );
  }, [sistema.installacions, filterQ]);

  const hasFilter = filterQ.trim().length > 0;
  if (hasFilter && filtered.length === 0) return null;

  return (
    <>
      <tr
        className="cursor-pointer select-none hover:bg-slate-50 transition-colors"
        style={{ background: `${sistema.color}08` }}
        onClick={onToggle}
      >
        <td className="p-2 pl-3" colSpan={modeAdmin ? 5 : 4}>
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-1 rounded-full shrink-0" style={{ background: sistema.color }} />
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: sistema.color }} />
              : <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: sistema.color }} />
            }
            {codiSistema(sistema) && (
              <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                {codiSistema(sistema)}
              </span>
            )}
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: sistema.color }}>
              {sistema.nom}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {sistema.installacions.length} instal·lació{sistema.installacions.length !== 1 ? "ns" : ""}
            </span>
            {sistema.descripcio && (
              <span className="text-[10px] text-slate-400 hidden md:inline">— {sistema.descripcio}</span>
            )}
          </div>
        </td>
        {modeAdmin && (
          <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1 justify-end">
              <button onClick={onAddInstallacio}
                className="h-6 px-2 rounded flex items-center gap-1 text-[10px] font-semibold transition-colors hover:opacity-80"
                style={{ color: sistema.color, background: `${sistema.color}15` }}>
                <Plus className="h-3 w-3" /> Nova instal·lació
              </button>
              <button onClick={onEditSistema}
                className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-[#0099A8] hover:bg-[#0099A8]/10 transition-colors">
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={onDeleteSistema}
                className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </td>
        )}
      </tr>

      {expanded && filtered.map((inst, idx) => (
        <tr key={inst.id}
          className={cn("border-t border-slate-50 hover:bg-slate-50/60 transition-colors",
            idx % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
          <td className="p-0 w-0">
            <div className="h-full w-0.5 ml-6" style={{ background: `${sistema.color}30` }} />
          </td>
          <td className="py-2.5 pl-8 pr-2">
            {inst.codiInstallacio ? (
              <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {inst.codiInstallacio}
              </span>
            ) : <span className="text-slate-300 text-xs">—</span>}
          </td>
          <td className="py-2.5 px-2">
            <p className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide leading-tight">
              {inst.nom}
            </p>
            {inst.descripcio && (
              <p className="text-[10.5px] text-slate-400 mt-0.5 leading-snug">{inst.descripcio}</p>
            )}
          </td>
          <td className="py-2.5 px-2 hidden lg:table-cell">
            {inst.urn ? (
              <span className="text-[10px] font-mono text-[#0099A8] bg-[#0099A8]/8 px-1.5 py-0.5 rounded truncate block max-w-[260px]"
                title={inst.urn}>
                {inst.urn.length > 42 ? inst.urn.slice(0, 42) + "…" : inst.urn}
              </span>
            ) : (
              <span className="text-[10px] text-slate-300 italic">Sense URN — sincronitza l'agent</span>
            )}
          </td>
          <td className="py-2.5 px-3 text-right whitespace-nowrap">
            <div className="flex items-center gap-1.5 justify-end">
              <Button size="sm"
                className="h-7 px-3 text-[11px] font-semibold gap-1.5 text-white disabled:opacity-40"
                style={{ background: sistema.color }}
                disabled={!inst.urn && !inst.embedUrl}
                title={!inst.urn && !inst.embedUrl ? "Sense URN — executa l'agent APS" : undefined}
                onClick={() => onVisualitzar(inst)}>
                <Monitor className="h-3 w-3" /> Visualitzar
              </Button>
              {modeAdmin && (
                <>
                  <button onClick={() => onEditInstallacio(inst)}
                    className="h-7 w-7 rounded flex items-center justify-center text-slate-400 hover:text-[#0099A8] hover:bg-[#0099A8]/10 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => onDeleteInstallacio(inst)}
                    className="h-7 w-7 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </td>
        </tr>
      ))}

      {expanded && sistema.installacions.length === 0 && (
        <tr className="border-t border-slate-50">
          <td colSpan={modeAdmin ? 6 : 5} className="py-4 pl-12 text-xs text-slate-400 italic">
            {modeAdmin
              ? <button onClick={onAddInstallacio}
                  className="flex items-center gap-1 text-[#0099A8] hover:underline">
                  <Plus className="h-3 w-3" /> Afegeix la primera instal·lació a aquest sistema
                </button>
              : "No hi ha instal·lacions configurades per a aquest sistema."
            }
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Component principal ──────────────────────────────────────────────────────

export function Visualitzador3DPage() {
  const { isAdmin, canEditView } = useAuth();
  const canEdit = isAdmin || canEditView("revit");

  const {
    sistemes, loading, error, refetch,
    createSistema, updateSistema, deleteSistema,
    createInstallacio, updateInstallacio, deleteInstallacio,
  } = useVisor3DSistemes();

  const [filterQ, setFilterQ] = useState("");
  const [modeAdmin, setModeAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && sistemes.length > 0) {
      setExpanded(new Set(sistemes.map(s => s.id)));
      initializedRef.current = true;
    }
  }, [sistemes]);

  useEffect(() => {
    setExpanded(prev => {
      const n = new Set(prev);
      sistemes.forEach(s => n.add(s.id));
      return n;
    });
  }, [sistemes]);

  const [visor, setVisor] = useState<{ inst: Installacio; sistema: Sistema } | null>(null);
  const [sistemaDialeg, setSistemaDialeg] = useState<{ open: boolean; mode: "create" | "edit"; target?: Sistema }>({ open: false, mode: "create" });
  const [installacioDialeg, setInstallacioDialeg] = useState<{ open: boolean; mode: "create" | "edit"; sistema?: Sistema; target?: Installacio }>({ open: false, mode: "create" });
  const [deleteDialeg, setDeleteDialeg] = useState<{ open: boolean; type: "sistema" | "installacio"; id: string; sistemaId?: string; nom: string } | null>(null);

  const totalInstallacions = sistemes.reduce((acc, s) => acc + s.installacions.length, 0);

  const withSave = useCallback(async (fn: () => Promise<void>) => {
    setSaving(true);
    setOpError(null);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOpError(`Error desant: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSaveSistema = (data: SistemaFormData) => {
    withSave(async () => {
      if (sistemaDialeg.mode === "create") {
        await createSistema(data);
      } else if (sistemaDialeg.target) {
        await updateSistema(sistemaDialeg.target.id, data);
      }
      setSistemaDialeg({ open: false, mode: "create" });
    });
  };

  const handleDeleteSistema = (id: string) => {
    withSave(async () => {
      await deleteSistema(id);
      setDeleteDialeg(null);
    });
  };

  const handleSaveInstallacio = (data: InstallacioFormData) => {
    const sistema = installacioDialeg.sistema;
    if (!sistema) return;
    withSave(async () => {
      if (installacioDialeg.mode === "create") {
        await createInstallacio(sistema.id, data);
      } else if (installacioDialeg.target) {
        await updateInstallacio(sistema.id, installacioDialeg.target.id, data);
      }
      setInstallacioDialeg({ open: false, mode: "create" });
    });
  };

  const handleDeleteInstallacio = (sistemaId: string, id: string) => {
    withSave(async () => {
      await deleteInstallacio(sistemaId, id);
      setDeleteDialeg(null);
    });
  };

  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Box className="h-6 w-6 text-[#0099A8]" /> Visualitzador 3D
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Models BIM de les instal·lacions del Consorci Besòs Tordera
          </p>
        </div>
        {canEdit && (
          <Button variant={modeAdmin ? "default" : "outline"} size="sm"
            onClick={() => setModeAdmin(v => !v)}
            className={cn("gap-1.5", modeAdmin
              ? "bg-[#0099A8] hover:bg-[#007a87] text-white"
              : "border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40")}>
            {modeAdmin ? <><X className="h-3.5 w-3.5" /> Sortir de l'edició</>
              : <><Settings className="h-3.5 w-3.5" /> Gestionar sistemes</>}
          </Button>
        )}
      </div>

      {modeAdmin && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-[#005A63] font-medium"
          style={{ background: "#0099A815", border: "1px solid #0099A830" }}>
          <Settings className="h-4 w-4 shrink-0" />
          Mode edició actiu — pots crear, editar i eliminar sistemes i instal·lacions.
        </div>
      )}

      {opError && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-red-700 font-medium bg-red-50 border border-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {opError}
          <button onClick={() => setOpError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Cerca instal·lació…" value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            className="pl-8 h-8 text-sm border-slate-200" />
        </div>
        {modeAdmin && (
          <Button size="sm" onClick={() => setSistemaDialeg({ open: true, mode: "create" })}
            disabled={saving}
            className="gap-1.5 bg-[#0099A8] hover:bg-[#007a87] text-white h-8">
            <Plus className="h-3.5 w-3.5" /> Nou sistema
          </Button>
        )}
        <div className="ml-auto text-xs text-slate-400 self-center flex items-center gap-1.5">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {sistemes.length} sistema{sistemes.length !== 1 ? "s" : ""} · {totalInstallacions} instal·lació{totalInstallacions !== 1 ? "ns" : ""}
        </div>
      </div>

      {loading && sistemes.length === 0 && (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin text-[#0099A8]" />
            <p className="text-sm">Carregant sistemes…</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="border border-red-200 rounded-xl bg-red-50 p-6 flex flex-col items-center gap-3 text-red-600">
          <AlertTriangle className="h-7 w-7" />
          <p className="text-sm font-medium">{error}</p>
          <Button size="sm" variant="outline" onClick={refetch} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-100">
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !error && (
        <div className="border border-slate-200 rounded-lg bg-white overflow-auto shadow-sm" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                <col style={{ width: 4 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: "auto" }} />
                <col style={{ width: 280 }} />
                <col style={{ width: modeAdmin ? 180 : 130 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                <tr className="text-left">
                  <th className="p-0" />
                  <th className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Codi</th>
                  <th className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Instal·lació</th>
                  <th className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hidden lg:table-cell">URN Model</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Accions</th>
                </tr>
              </thead>
              <tbody>
                {sistemes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-400">
                      <Building2 className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                      <p className="text-sm">No hi ha sistemes configurats.</p>
                      {modeAdmin && (
                        <Button size="sm" variant="outline" className="mt-3 gap-1"
                          onClick={() => setSistemaDialeg({ open: true, mode: "create" })}>
                          <Plus className="h-3.5 w-3.5" /> Crear primer sistema
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  [...sistemes]
                    .sort((a, b) => codiSistemaNumeric(a) - codiSistemaNumeric(b))
                    .map((sistema) => (
                    <SistemaGroup
                      key={sistema.id}
                      sistema={sistema}
                      expanded={expanded.has(sistema.id)}
                      onToggle={() => toggleExpanded(sistema.id)}
                      canEdit={canEdit}
                      modeAdmin={modeAdmin}
                      filterQ={filterQ}
                      onVisualitzar={(inst) => setVisor({ inst, sistema })}
                      onEditSistema={() => setSistemaDialeg({ open: true, mode: "edit", target: sistema })}
                      onDeleteSistema={() => setDeleteDialeg({ open: true, type: "sistema", id: sistema.id, nom: sistema.nom })}
                      onAddInstallacio={() => {
                        setExpanded(prev => new Set([...prev, sistema.id]));
                        setInstallacioDialeg({ open: true, mode: "create", sistema });
                      }}
                      onEditInstallacio={(inst) => setInstallacioDialeg({ open: true, mode: "edit", sistema, target: inst })}
                      onDeleteInstallacio={(inst) => setDeleteDialeg({ open: true, type: "installacio", id: inst.id, sistemaId: sistema.id, nom: inst.nom })}
                    />
                  ))
                )}
              </tbody>
            </table>
        </div>
      )}

      {visor && (
        <Visor3DDialog
          installacio={visor.inst}
          sistema={visor.sistema}
          onClose={() => setVisor(null)}
        />
      )}

      <SistemaFormDialog
        open={sistemaDialeg.open}
        onClose={() => setSistemaDialeg({ open: false, mode: "create" })}
        onSave={handleSaveSistema}
        title={sistemaDialeg.mode === "create" ? "Nou sistema" : "Editar sistema"}
        saving={saving}
        initial={sistemaDialeg.target
          ? { nom: sistemaDialeg.target.nom, descripcio: sistemaDialeg.target.descripcio ?? "", codi: sistemaDialeg.target.codi ?? "", color: sistemaDialeg.target.color }
          : undefined}
      />

      <InstallacioFormDialog
        open={installacioDialeg.open}
        onClose={() => setInstallacioDialeg({ open: false, mode: "create" })}
        onSave={handleSaveInstallacio}
        title={installacioDialeg.mode === "create" ? "Nova instal·lació" : "Editar instal·lació"}
        sistemaColor={installacioDialeg.sistema?.color ?? "#0099A8"}
        sistemaNom={installacioDialeg.sistema?.nom ?? ""}
        saving={saving}
        initial={installacioDialeg.target
          ? {
              nom: installacioDialeg.target.nom,
              descripcio: installacioDialeg.target.descripcio ?? "",
              codiInstallacio: installacioDialeg.target.codiInstallacio ?? "",
              embedUrl: installacioDialeg.target.embedUrl ?? "",
              urn: installacioDialeg.target.urn ?? "",
            }
          : undefined}
      />

      <AlertDialog open={!!deleteDialeg?.open} onOpenChange={(o) => !o && setDeleteDialeg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar {deleteDialeg?.type === "sistema" ? "sistema" : "instal·lació"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estàs a punt d'eliminar <strong>«{deleteDialeg?.nom}»</strong>.
              {deleteDialeg?.type === "sistema" && <> Totes les instal·lacions que conté també s'eliminaran.</>}{" "}
              Aquesta acció no es pot desfer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={saving}
              onClick={() => {
                if (!deleteDialeg) return;
                if (deleteDialeg.type === "sistema") handleDeleteSistema(deleteDialeg.id);
                else handleDeleteInstallacio(deleteDialeg.sistemaId!, deleteDialeg.id);
              }}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
