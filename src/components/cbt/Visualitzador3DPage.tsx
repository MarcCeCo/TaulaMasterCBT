// src/components/cbt/Visualitzador3DPage.tsx
//
// Pàgina Visualitzador 3D
// ─────────────────────────────────────────────────────────────────────────────
// Llista totes les instal·lacions agrupades per sistema en una taula.
// Clicar "Visualitzar" obre el Viewer SDK d'Autodesk APS carregant el model
// directament via l'URN del model MASTER (sense iframe ni URL compartida).
// Admins/Editors poden crear, editar i eliminar sistemes i instal·lacions.
// Les dades es persisteixen a Supabase (taules: visor3d_sistemes, visor3d_installacions).

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { obteApsToken } from "@/lib/apsToken";
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
  FileDown,
  ListTree,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useVisor3DSistemes,
  type Sistema,
  type Installacio,
} from "@/hooks/useVisor3DSistemes";
import type { ExternalObject } from "@/lib/dbTypes";
import { useProjectes } from "@/lib/useProjectes";
import {
  NIVELLS_JERARQUIA,
  construeixArbre,
  escanejaModel,
  exportaInformeTags,
  normTag,
  tagIgnorat,
  seleccionaAlViewer,
  tornaVistaNormal,
  vistaModificada,
  type ElementModel,
  type NodeJerarquia,
} from "@/lib/visor3dModel";
import { toast } from "sonner";

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
  "#0099A8",
  "#6366F1",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#F97316",
  "#06B6D4",
  "#84CC16",
  "#64748B",
  "#0EA5E9",
];

// ─── Formulari Sistema ────────────────────────────────────────────────────────

interface SistemaFormData {
  nom: string;
  descripcio: string;
  codi: string;
  color: string;
}
const SISTEMA_BUIT: SistemaFormData = {
  nom: "",
  descripcio: "",
  codi: "",
  color: "#0099A8",
};

function SistemaFormDialog({
  open,
  onClose,
  onSave,
  initial,
  title,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (d: SistemaFormData) => void;
  initial?: SistemaFormData;
  title: string;
  saving?: boolean;
}) {
  const [form, setForm] = useState<SistemaFormData>(initial ?? SISTEMA_BUIT);
  useEffect(() => {
    if (open) setForm(initial ?? SISTEMA_BUIT);
  }, [open, initial]);
  const valid = form.nom.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
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
            <Input
              value={form.nom}
              onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              placeholder="p.ex. ESTACIONS DEPURADORES"
              className="text-sm uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <AlignLeft className="h-3 w-3" /> Descripció
            </Label>
            <Input
              value={form.descripcio}
              onChange={(e) =>
                setForm((f) => ({ ...f, descripcio: e.target.value }))
              }
              placeholder="Descripció breu (opcional)"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Box className="h-3 w-3 text-[#0099A8]" /> Codi del sistema
              <span className="text-[10px] font-normal text-slate-400 ml-1">
                (ex: 005, 012)
              </span>
            </Label>
            <Input
              value={form.codi}
              onChange={(e) =>
                setForm((f) => ({ ...f, codi: e.target.value.toUpperCase() }))
              }
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
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                    form.color === c
                      ? "border-slate-700 scale-110"
                      : "border-transparent",
                  )}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) =>
                  setForm((f) => ({ ...f, color: e.target.value }))
                }
                className="h-7 w-7 rounded-full border-0 cursor-pointer bg-transparent"
                title="Color personalitzat"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel·lar
          </Button>
          <Button
            size="sm"
            disabled={!valid || saving}
            onClick={() => valid && onSave(form)}
            className="bg-[#0099A8] hover:bg-[#007a87] text-white"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            )}
            Desar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Formulari Instal·lació ───────────────────────────────────────────────────
// El camp URN MASTER s'omple automàticament via l'agent APS. El formulari manual
// permet afegir/corregir l'URN del MASTER.

interface InstallacioFormData {
  nom: string;
  descripcio: string;
  codiInstallacio: string;
  urnMaster: string;
}
const INSTALLACIO_BUIDA: InstallacioFormData = {
  nom: "",
  descripcio: "",
  codiInstallacio: "",
  urnMaster: "",
};

function InstallacioFormDialog({
  open,
  onClose,
  onSave,
  initial,
  title,
  sistemaColor,
  sistemaNom,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (d: InstallacioFormData) => void;
  initial?: InstallacioFormData;
  title: string;
  sistemaColor: string;
  sistemaNom: string;
  saving?: boolean;
}) {
  const [form, setForm] = useState<InstallacioFormData>(
    initial ?? INSTALLACIO_BUIDA,
  );
  useEffect(() => {
    if (open) setForm(initial ?? INSTALLACIO_BUIDA);
  }, [open, initial]);
  const valid = form.nom.trim().length > 0 && form.urnMaster.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 text-sm font-bold uppercase tracking-wide">
            <Monitor className="h-4 w-4" style={{ color: sistemaColor }} />{" "}
            {title}
          </DialogTitle>
          <p className="text-xs text-slate-400 mt-1">
            Sistema:{" "}
            <span
              className="font-semibold uppercase"
              style={{ color: sistemaColor }}
            >
              {sistemaNom}
            </span>
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Nom de la instal·lació *
            </Label>
            <Input
              value={form.nom}
              onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              placeholder="p.ex. ED005 LA LLAGOSTA"
              className="text-sm uppercase"
            />
          </div>
          <div className="flex gap-3">
            <div className="space-y-1.5 w-36">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Codi
              </Label>
              <Input
                value={form.codiInstallacio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, codiInstallacio: e.target.value }))
                }
                placeholder="ED005"
                className="text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Descripció
              </Label>
              <Input
                value={form.descripcio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, descripcio: e.target.value }))
                }
                placeholder="Descripció breu (opcional)"
                className="text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Box className="h-3 w-3 text-[#0099A8]" /> URN del model MASTER
            </Label>
            <Input
              value={form.urnMaster}
              onChange={(e) =>
                setForm((f) => ({ ...f, urnMaster: e.target.value }))
              }
              placeholder="urn:adsk.wipprod:dm.lineage:XXXX…"
              className="text-xs font-mono"
            />
            <p className="text-[10.5px] text-slate-400 leading-relaxed">
              L'agent APS omple aquest camp automàticament a partir del fitxer
              *_MASTER.rvt. Normalment no cal introduir-lo manualment.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel·lar
          </Button>
          <Button
            size="sm"
            disabled={!valid || saving}
            onClick={() => valid && onSave(form)}
            style={{ background: sistemaColor }}
            className="text-white hover:opacity-90"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            )}
            Desar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Viewer SDK d'Autodesk APS ────────────────────────────────────────────────
//
// Carrega el Viewer SDK via CDN i renderitza el model MASTER de la instal·lació.
// Flux:
//   1. Injecta CSS + JS del Viewer SDK
//   2. Demana el token APS al token-service (/api/aps-token, amb la sessió de Supabase)
//   3. Inicialitza Autodesk.Viewing.Initializer
//   4. Crea GuiViewer3D i carrega el document (URN MASTER)

const VIEWER_CSS_URL =
  "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.99/style.css";
const VIEWER_JS_URL =
  "https://developer.api.autodesk.com/modelderivative/v2/viewers/7.99/viewer3D.min.js";

declare global {
  interface Window {
    Autodesk?: ExternalObject;
    _apsViewerScriptsLoaded?: boolean;
  }
}

function injectaViewerSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window._apsViewerScriptsLoaded && window.Autodesk?.Viewing) {
      resolve();
      return;
    }

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
      script.onload = () => {
        window._apsViewerScriptsLoaded = true;
        resolve();
      };
      script.onerror = () =>
        reject(new Error("No s'ha pogut carregar el Viewer SDK d'Autodesk."));
      document.head.appendChild(script);
    } else {
      const check = setInterval(() => {
        if (window.Autodesk?.Viewing) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Timeout carregant Viewer SDK."));
      }, 20000);
    }
  });
}

type ViewerEstat =
  | "idle"
  | "carregant-sdk"
  | "carregant-token"
  | "inicialitzant"
  | "carregant-model"
  | "ok"
  | "error";

// ─── Tipus per a les vistes del model ────────────────────────────────────────

interface VistaModel {
  node: ExternalObject; // Autodesk.Viewing.BubbleNode
  nom: string;
  rol: "3d" | "2d";
  index: number;
}

// ─── Helper: normalitza URN a base64url ───────────────────────────────────────

function normalitzaUrn(urn: string): string {
  return urn.startsWith("urn:")
    ? btoa(urn).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
    : urn;
}

/** URN del MASTER. Si la BD en té diversos separats per coma (dades antigues), agafa el primer. */
function urnMasterDe(inst?: Installacio): string {
  return inst?.urnMaster?.split(",")[0]?.trim() ?? "";
}

// ─── Hook useApsViewer ────────────────────────────────────────────────────────

function useApsViewer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  installacio: Installacio | undefined,
) {
  const [estat, setEstat] = useState<ViewerEstat>("idle");
  const [error, setError] = useState<string | null>(null);
  const [vistes, setVistes] = useState<VistaModel[]>([]);
  const [vistaActual, setVistaActual] = useState<number>(0);
  const [canviantVista, setCanviantVista] = useState(false);
  // Element seleccionat al visor (null = cap)
  const [seleccio, setSeleccio] = useState<SeleccioTag | null>(null);
  // Resultat de l'escaneig del model (TAGs + jerarquia)
  const [escaneig, setEscaneig] = useState<EstatEscaneig>(ESCANEIG_BUIT);
  const escanejosRef = useRef<Map<number, ElementModel[]>>(new Map());
  const escanejGenRef = useRef(0);
  // Compta les vegades que Esc ha restablert la vista (per netejar marques de l'arbre)
  const [restabliments, setRestabliments] = useState(0);

  const viewerRef = useRef<ExternalObject>(null);
  const docRef = useRef<ExternalObject>(null);
  const mountedRef = useRef(true);
  // Si Autodesk respon 401/403, es reintenta UNA vegada amb un token nou
  const forcaTokenRef = useRef(false);
  const reintentAutoRef = useRef(false);
  const inicialitzaRef = useRef<(() => Promise<void>) | null>(null);

  const reiniciaEscaneig = useCallback(() => {
    escanejGenRef.current++;
    escanejosRef.current = new Map();
    setEscaneig(ESCANEIG_BUIT);
  }, []);

  // Cada cop que el visor acaba de carregar la geometria d'un model 3D, en
  // llegeix el TAG i la jerarquia (CBT_SISTEMA … CBT_SUBPROCES) de tots els elements.
  const subscriuEscaneig = useCallback((viewer: ExternalObject) => {
    const AV = window.Autodesk?.Viewing;
    if (!AV) return;
    viewer.addEventListener(
      AV.GEOMETRY_LOADED_EVENT,
      async (ev: ExternalObject) => {
        const model = ev?.model;
        if (!model || model.is3d?.() === false) return;
        const gen = escanejGenRef.current;
        const caducat = () =>
          gen !== escanejGenRef.current || !mountedRef.current;
        setEscaneig((e) => ({ ...e, estat: "escanejant", progres: 0 }));
        try {
          const els = await escanejaModel(
            model,
            (p) => {
              if (!caducat()) setEscaneig((e) => ({ ...e, progres: p }));
            },
            caducat,
          );
          if (caducat()) return;
          escanejosRef.current.set(model.id, els);
          setEscaneig({
            estat: "ok",
            progres: 1,
            elements: [...escanejosRef.current.values()].flat(),
          });
        } catch (err) {
          console.error("[Visor3D] Error escanejant el model", err);
          if (!caducat()) setEscaneig({ ...ESCANEIG_BUIT, estat: "error" });
        }
      },
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (viewerRef.current) {
        try {
          viewerRef.current.finish();
        } catch {
          /* ignora */
        }
        viewerRef.current = null;
      }
    };
  }, []);

  const inicialitza = useCallback(async () => {
    if (!containerRef.current) {
      let waited = 0;
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          waited += 50;
          if (containerRef.current || waited >= 2000) {
            clearInterval(poll);
            resolve();
          }
        }, 50);
      });
    }

    if (!containerRef.current || !installacio) {
      setEstat("error");
      setError("No hi ha instal·lació assignada.");
      return;
    }

    // L'únic model que carrega el visor és el MASTER (federat: ja inclou tots els vincles).
    const urnMaster = urnMasterDe(installacio);
    if (!urnMaster) {
      setEstat("error");
      setError(
        "Aquesta instal·lació no té model MASTER. Cal un fitxer *_MASTER.rvt a la carpeta MODEL-BIM i executar l'agent APS per sincronitzar-lo.",
      );
      return;
    }

    if (!mountedRef.current) return;

    if (viewerRef.current) {
      try {
        viewerRef.current.finish();
      } catch {
        /* ignora */
      }
      viewerRef.current = null;
    }
    docRef.current = null;
    setSeleccio(null);
    reiniciaEscaneig();
    setVistes([]);
    setVistaActual(0);
    setEstat("carregant-sdk");
    setError(null);

    try {
      await injectaViewerSDK();
      if (!mountedRef.current) return;

      setEstat("carregant-token");
      // Envia la sessió de l'usuari al token-service. Si falla, el missatge
      // llançat és el real del servidor (p. ex. "La connexió amb Autodesk ha caducat…").
      const fresh = forcaTokenRef.current;
      forcaTokenRef.current = false;
      const { access_token } = await obteApsToken({ fresh });
      if (!mountedRef.current) return;

      setEstat("inicialitzant");
      const AV = window.Autodesk.Viewing;

      await new Promise<void>((res) => {
        AV.Initializer(
          {
            env: "AutodeskProduction2",
            api: "streamingV2",
            // El Viewer torna a cridar-ho quan el token està a punt d'expirar:
            // abans reutilitzava el mateix token caducat i el model deixava de carregar.
            getAccessToken: (cb: (t: string, e: number) => void) => {
              obteApsToken()
                .then((t) => cb(t.access_token, t.expires_in))
                .catch((e) => {
                  console.error(
                    "[Viewer] No s'ha pogut renovar el token APS:",
                    e,
                  );
                  cb(access_token, 60); // el Viewer ho reintentarà d'aquí a 1 min
                });
            },
          },
          () => res(),
        );
      });
      if (!mountedRef.current) return;

      setEstat("carregant-model");

      const viewer = new AV.GuiViewer3D(containerRef.current);
      viewer.start();
      viewerRef.current = viewer;
      subscriuSeleccioTag(viewer, setSeleccio);
      subscriuEscaneig(viewer);

      await new Promise<void>((res, rej) => {
        AV.Document.load(
          `urn:${normalitzaUrn(urnMaster)}`,
          (doc: ExternalObject) => {
            if (!mountedRef.current) {
              rej(new Error("_desmontat_"));
              return;
            }
            docRef.current = doc;
            const root = doc.getRoot();
            const nodes3d: ExternalObject[] =
              root.search({ type: "geometry", role: "3d" }) ?? [];
            const nodes2d: ExternalObject[] =
              root.search({ type: "geometry", role: "2d" }) ?? [];
            const toVista =
              (role: "3d" | "2d") =>
              (node: ExternalObject, i: number): VistaModel => ({
                node,
                nom: node.name() || `Vista ${i + 1}`,
                rol: role,
                index: i,
              });
            const totes: VistaModel[] = [
              ...nodes3d.map(toVista("3d")),
              ...nodes2d.map(toVista("2d")),
            ];
            const primerNode =
              totes[0]?.node ??
              root.getDefaultGeometry(true) ??
              root.getDefaultGeometry();
            if (!primerNode) {
              rej(new Error("El model no té geometries disponibles."));
              return;
            }
            viewer.loadDocumentNode(doc, primerNode);
            setVistes(totes);
            setVistaActual(0);
            reintentAutoRef.current = false;
            setEstat("ok");
            res();
          },
          (code: number, msg: string) =>
            rej(new Error(`Error APS (codi ${code}): ${msg}`)),
        );
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "_desmontat_") return;
      if (/\b(401|403)\b/.test(msg) && !reintentAutoRef.current) {
        reintentAutoRef.current = true;
        forcaTokenRef.current = true;
        void inicialitzaRef.current?.();
        return;
      }
      setError(msg);
      setEstat("error");
    }
  }, [containerRef, installacio, reiniciaEscaneig, subscriuEscaneig]);

  const carregaVista = useCallback(
    async (idx: number) => {
      const vista = vistes[idx];
      const doc = docRef.current;
      if (!vista || !doc || !viewerRef.current || canviantVista) return;
      setCanviantVista(true);
      // Una altra vista 3D pot contenir elements diferents: tornem a escanejar
      if (vista.rol === "3d") {
        reiniciaEscaneig();
        setSeleccio(null);
      }
      try {
        await viewerRef.current.loadDocumentNode(doc, vista.node, {
          keepCurrentModels: false, // en canviar vista, mostrem només aquesta
        });
        setVistaActual(idx);
      } catch {
        /* ignora */
      } finally {
        setCanviantVista(false);
      }
    },
    [vistes, canviantVista, reiniciaEscaneig],
  );

  useEffect(() => {
    inicialitzaRef.current = inicialitza;
    inicialitza();
  }, [inicialitza]);

  // Tecla Esc: torna a la vista normal (sense selecció, mostrant-ho tot).
  // Retorna true si hi havia res a restablir (llavors Esc no tanca res més).
  const restableixVista = useCallback((): boolean => {
    const viewer = viewerRef.current;
    if (!viewer || !vistaModificada(viewer)) return false;
    tornaVistaNormal(viewer);
    setSeleccio(null);
    setRestabliments((n) => n + 1);
    return true;
  }, []);

  // Mode pantalla completa: el navegador reserva Esc per sortir-ne i la pàgina
  // no rep la tecla. Amb el Keyboard Lock API (Chrome/Edge) la capturem perquè
  // Esc pugui deseleccionar l'element; sense selecció, Esc surt de la pantalla
  // completa (ho gestiona onEscapeKeyDown del diàleg).
  useEffect(() => {
    const kb = (
      navigator as Navigator & {
        keyboard?: {
          lock?: (k: string[]) => Promise<void>;
          unlock?: () => void;
        };
      }
    ).keyboard;
    const onFullscreen = () => {
      if (document.fullscreenElement) {
        kb?.lock?.(["Escape"])?.catch(() => {
          /* no suportat: Esc sortirà de la pantalla completa */
        });
      } else {
        kb?.unlock?.();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      kb?.unlock?.();
    };
  }, []);

  // Selecciona (i enquadra) un conjunt d'elements: selecció múltiple
  const seleccionaElements = useCallback((els: ElementModel[]) => {
    if (viewerRef.current) seleccionaAlViewer(viewerRef.current, els);
  }, []);

  return {
    estat,
    error,
    // El botó «Reintentar» demana sempre un token nou al servei
    reintentar: () => {
      forcaTokenRef.current = true;
      reintentAutoRef.current = false;
      return inicialitza();
    },
    vistes,
    vistaActual,
    carregaVista,
    canviantVista,
    seleccio,
    restableixVista,
    restabliments,
    escaneig,
    seleccionaElements,
  };
}

// ─── Selector de vistes ───────────────────────────────────────────────────────

function SelectorVistes({
  vistes,
  vistaActual,
  canviantVista,
  onSeleccionar,
  sistemaColor,
}: {
  vistes: VistaModel[];
  vistaActual: number;
  canviantVista: boolean;
  onSeleccionar: (idx: number) => void;
  sistemaColor: string;
}) {
  const [obert, setObert] = useState(false);
  const [filtre, setFiltre] = useState("");
  const panellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!obert) return;
    const handle = (e: MouseEvent) => {
      if (panellRef.current && !panellRef.current.contains(e.target as Node))
        setObert(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [obert]);

  if (vistes.length === 0) return null;

  const vistasel = vistes[vistaActual];
  const filtrades = vistes.filter((v) =>
    v.nom.toLowerCase().includes(filtre.toLowerCase()),
  );

  // Agrupa les vistes filtrades per rol (3D / plànols)
  type Grup = {
    label: string;
    color: string;
    icona: "3d" | "2d";
    vistes: VistaModel[];
  };
  const grups: Grup[] = [];
  const vs3d = filtrades.filter((v) => v.rol === "3d");
  const vs2d = filtrades.filter((v) => v.rol === "2d");
  if (vs3d.length > 0)
    grups.push({
      label: "3D",
      color: sistemaColor,
      icona: "3d",
      vistes: vs3d,
    });
  if (vs2d.length > 0)
    grups.push({
      label: "Plànols i seccions",
      color: "#94a3b8",
      icona: "2d",
      vistes: vs2d,
    });

  return (
    <div className="relative shrink-0" ref={panellRef}>
      <button
        onClick={() => setObert((o) => !o)}
        disabled={canviantVista}
        className={cn(
          "flex items-center gap-2 h-7 pl-2.5 pr-2 rounded-lg border text-[11px] font-semibold transition-all select-none",
          "bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-slate-600",
          obert && "bg-slate-700 border-slate-500",
          canviantVista && "opacity-60 cursor-wait",
        )}
      >
        {canviantVista ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400 shrink-0" />
        ) : (
          <Monitor
            className="h-3 w-3 shrink-0"
            style={{ color: vistasel?.rol === "2d" ? "#94a3b8" : sistemaColor }}
          />
        )}
        <span className="max-w-[160px] truncate hidden sm:block">
          {vistasel?.nom ?? "Vistes"}
        </span>
        <span
          className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0"
          style={{ background: `${sistemaColor}25`, color: sistemaColor }}
        >
          {vistes.length}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-slate-400 transition-transform shrink-0",
            obert && "rotate-180",
          )}
        />
      </button>

      {obert && (
        <div
          className={cn(
            "absolute right-0 top-9 z-50 w-72 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl",
            "flex flex-col overflow-hidden",
          )}
        >
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
                  onChange={(e) => setFiltre(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 outline-none focus:border-slate-500 transition-colors"
                />
              </div>
            )}
          </div>

          <div className="overflow-y-auto max-h-80 py-1.5 space-y-0.5 px-1.5">
            {grups.map((grup) => (
              <div key={grup.label}>
                <p
                  className="px-2 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: grup.color }}
                >
                  {grup.label}
                </p>
                {grup.vistes.map((v) => (
                  <button
                    key={v.index}
                    onClick={() => {
                      onSeleccionar(v.index);
                      setObert(false);
                      setFiltre("");
                    }}
                    disabled={canviantVista}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all",
                      vistaActual === v.index
                        ? "text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white",
                      canviantVista && "opacity-50 cursor-wait",
                    )}
                    style={
                      vistaActual === v.index
                        ? { background: `${grup.color}20` }
                        : undefined
                    }
                  >
                    <div
                      className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                      style={
                        vistaActual === v.index
                          ? { background: `${grup.color}30`, color: grup.color }
                          : { background: "#1e293b", color: "#64748b" }
                      }
                    >
                      {v.rol === "3d" ? (
                        <Box className="h-2.5 w-2.5" />
                      ) : (
                        <AlignLeft className="h-2.5 w-2.5" />
                      )}
                    </div>
                    <span className="text-[11px] font-medium truncate flex-1">
                      {v.nom}
                    </span>
                    {vistaActual === v.index && (
                      <Check
                        className="h-3 w-3 shrink-0"
                        style={{ color: grup.color }}
                      />
                    )}
                  </button>
                ))}
              </div>
            ))}

            {grups.length === 0 && (
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

// ─── Panell lateral fix del visor ─────────────────────────────────────────────
//
// El panell és SEMPRE visible. Té dues pestanyes:
//   · «Equip»     → sense selecció: nom i codi de la instal·lació, equips donats
//                   d'alta (Rosmiman) i informe de TAGs que no són al model.
//                   Amb selecció: TAG i descripció de l'element (o el recompte
//                   si se n'han seleccionat diversos).
//   · «Jerarquia» → arbre CBT_SISTEMA > CBT_SUBSISTEMA > CBT_LINIA_DE_TRACTAMENT
//                   > CBT_PROCES > CBT_SUBPROCES; clicar un nivell selecciona
//                   al visor tots els equips que conté.
// El TAG es llegeix del paràmetre de Revit CBT_TAG (model.getProperties); la
// descripció es busca al llistat Rosmiman (rosmiman_equips) dins del panell,
// de manera que la càrrega del visor no depèn de les dades de Rosmiman.

interface SeleccioTag {
  /** TAG de l'element seleccionat ("" = sense TAG o selecció múltiple) */
  tag: string;
  /** Nombre d'elements seleccionats */
  count: number;
  /** Només en selecció múltiple: identificadors dels elements */
  elements?: { modelId: number; dbId: number }[];
}

interface EstatEscaneig {
  estat: "idle" | "escanejant" | "ok" | "error";
  progres: number;
  elements: ElementModel[];
}
const ESCANEIG_BUIT: EstatEscaneig = {
  estat: "idle",
  progres: 0,
  elements: [],
};

function subscriuSeleccioTag(
  viewer: ExternalObject,
  onChange: (s: SeleccioTag | null) => void,
) {
  const AV = window.Autodesk?.Viewing;
  if (!AV) return;
  let peticio = 0;
  // No depenem del format de l'esdeveniment: a cada canvi llegim la selecció
  // agregada del viewer (vàlid amb models federats).
  const onSeleccio = () => {
    const id = ++peticio;
    const agregada: ExternalObject[] = viewer.getAggregateSelection?.() ?? [];
    const total = agregada.reduce((n, g) => n + (g?.selection?.length ?? 0), 0);
    if (total === 0) {
      onChange(null);
      return;
    }
    // Selecció múltiple: només comptem elements
    if (total > 1) {
      onChange({
        tag: "",
        count: total,
        elements: agregada.flatMap((g) =>
          (g.selection as number[]).map((dbId) => ({
            modelId: g.model?.id as number,
            dbId,
          })),
        ),
      });
      return;
    }
    const sel = agregada.find((g) => g?.selection?.length);
    const dbId = sel?.selection?.[0];
    if (dbId === undefined || !sel?.model) {
      onChange(null);
      return;
    }
    sel.model.getProperties(
      dbId,
      (res: ExternalObject) => {
        if (id !== peticio) return; // ja s'ha seleccionat un altre element
        const props: ExternalObject[] = res?.properties ?? [];
        const p = props.find((x) =>
          /^(CBT_)?TAG$/.test(normTag(x.displayName ?? x.attributeName)),
        );
        const tag = normTag(p?.displayValue);
        if (!tag) {
          console.info("[Visor3D] Element sense TAG", {
            dbId,
            nom: res?.name,
            propietats: props.map((x) => x.displayName),
          });
        }
        onChange({ tag, count: 1 });
      },
      (err: ExternalObject) => {
        console.warn("[Visor3D] No s'han pogut llegir les propietats", err);
        if (id === peticio) onChange(null);
      },
    );
  };
  viewer.addEventListener(
    AV.AGGREGATE_SELECTION_CHANGED_EVENT ?? AV.SELECTION_CHANGED_EVENT,
    onSeleccio,
  );
}

const ETIQUETA =
  "text-[10px] font-bold uppercase tracking-widest text-slate-400";

// ── Arbre de jerarquia ────────────────────────────────────────────────────────

const MAX_FULLES_VISIBLES = 200;

function FilaNode({
  node,
  fondaria,
  obert,
  marcat,
  onToggleObert,
  onToggleMarca,
  onSeleccionar,
  obertsSet,
  marcatsSet,
  color,
}: {
  node: NodeJerarquia;
  fondaria: number;
  obert: boolean;
  marcat: boolean;
  onToggleObert: (id: string) => void;
  onToggleMarca: (n: NodeJerarquia) => void;
  onSeleccionar: (els: ElementModel[]) => void;
  obertsSet: Set<string>;
  marcatsSet: Set<string>;
  color: string;
}) {
  const teFills = node.fills.length > 0 || node.directs.length > 0;
  const etiquetaNivell =
    node.nivell >= 0 ? NIVELLS_JERARQUIA[node.nivell].etiqueta : "";
  return (
    <>
      <div
        className="group flex items-center gap-1 rounded-md pr-1 hover:bg-slate-50"
        style={{ paddingLeft: 4 + fondaria * 12 }}
      >
        <button
          type="button"
          onClick={() => onToggleObert(node.id)}
          disabled={!teFills}
          aria-label={obert ? "Replega" : "Desplega"}
          className="h-5 w-4 shrink-0 flex items-center justify-center text-slate-400 disabled:opacity-0"
        >
          {obert ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <input
          type="checkbox"
          checked={marcat}
          onChange={() => onToggleMarca(node)}
          title="Afegeix / treu aquest nivell de la selecció múltiple"
          className="h-3 w-3 shrink-0 cursor-pointer"
          style={{ accentColor: color }}
        />
        <button
          type="button"
          onClick={() => onSeleccionar(node.elements)}
          title={`Selecciona els ${node.elements.length} equips de «${node.nom}»`}
          className="flex-1 min-w-0 flex items-center gap-1.5 py-1 text-left"
        >
          <span className="text-[11px] font-medium text-slate-700 truncate">
            {node.nom}
          </span>
          {etiquetaNivell && (
            <span className="hidden xl:inline text-[8.5px] uppercase tracking-wider text-slate-300 shrink-0">
              {etiquetaNivell}
            </span>
          )}
          <span
            className="ml-auto text-[10px] font-semibold px-1.5 rounded shrink-0"
            style={{ background: `${color}18`, color }}
          >
            {node.elements.length}
          </span>
        </button>
      </div>

      {obert && (
        <>
          {node.fills.map((f) => (
            <FilaNode
              key={f.id}
              node={f}
              fondaria={fondaria + 1}
              obert={obertsSet.has(f.id)}
              marcat={marcatsSet.has(f.id)}
              onToggleObert={onToggleObert}
              onToggleMarca={onToggleMarca}
              onSeleccionar={onSeleccionar}
              obertsSet={obertsSet}
              marcatsSet={marcatsSet}
              color={color}
            />
          ))}
          {node.directs.slice(0, MAX_FULLES_VISIBLES).map((el) => (
            <button
              key={`${el.modelId}:${el.dbId}`}
              type="button"
              onClick={() => onSeleccionar([el])}
              className="w-full text-left rounded-md py-0.5 pr-2 font-mono text-[10.5px] text-slate-500 hover:bg-slate-50 hover:text-slate-800 truncate"
              style={{ paddingLeft: 24 + (fondaria + 1) * 12 }}
              title={el.tag || `Element ${el.dbId}`}
            >
              {el.tag || `(sense TAG) #${el.dbId}`}
            </button>
          ))}
          {node.directs.length > MAX_FULLES_VISIBLES && (
            <p
              className="py-0.5 text-[10px] italic text-slate-400"
              style={{ paddingLeft: 24 + (fondaria + 1) * 12 }}
            >
              … i {node.directs.length - MAX_FULLES_VISIBLES} equips més
              (selecciona el nivell per veure'ls tots al model)
            </p>
          )}
        </>
      )}
    </>
  );
}

function PestanyaJerarquia({
  restabliments,
  escaneig,
  onSeleccionar,
  color,
}: {
  restabliments: number;
  escaneig: EstatEscaneig;
  onSeleccionar: (els: ElementModel[]) => void;
  color: string;
}) {
  const arbre = useMemo(
    () => construeixArbre(escaneig.elements),
    [escaneig.elements],
  );
  const [oberts, setOberts] = useState<Set<string>>(new Set());
  const [marcats, setMarcats] = useState<Map<string, NodeJerarquia>>(new Map());

  // Esc ha tornat a la vista normal: ja no hi ha nivells seleccionats
  useEffect(() => {
    setMarcats(new Map());
  }, [restabliments]);

  // Si es torna a escanejar (altra vista) les marques ja no són vàlides
  useEffect(() => {
    setMarcats(new Map());
    setOberts(new Set());
  }, [escaneig.elements]);

  const toggleObert = (id: string) =>
    setOberts((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Selecció múltiple: unió dels elements de tots els nivells marcats
  const toggleMarca = (node: NodeJerarquia) => {
    setMarcats((p) => {
      const n = new Map(p);
      if (n.has(node.id)) n.delete(node.id);
      else n.set(node.id, node);
      onSeleccionar(unio([...n.values()]));
      return n;
    });
  };

  const marcatsSet = useMemo(() => new Set(marcats.keys()), [marcats]);

  if (escaneig.estat === "idle" || escaneig.estat === "escanejant") {
    return (
      <div className="p-4 flex flex-col items-center gap-2 text-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-[#0099A8]" />
        <p className="text-xs">
          {escaneig.estat === "idle"
            ? "Esperant que el model acabi de carregar…"
            : `Llegint la jerarquia del model… ${Math.round(escaneig.progres * 100)}%`}
        </p>
      </div>
    );
  }
  if (escaneig.estat === "error") {
    return (
      <p className="p-4 text-xs text-amber-600 italic">
        No s'ha pogut llegir la jerarquia d'aquest model.
      </p>
    );
  }
  if (arbre.length === 0) {
    return (
      <p className="p-4 text-xs text-slate-400 italic leading-relaxed">
        Cap element del model té els paràmetres{" "}
        {NIVELLS_JERARQUIA.map((n) => `CBT_${n.param}`).join(", ")} omplerts.
      </p>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
        <p className="text-[10.5px] text-slate-400 leading-snug flex-1">
          Clica un nivell per seleccionar-ne tots els equips. Amb les caselles
          pots combinar-ne diversos.
        </p>
        {marcats.size > 0 && (
          <button
            type="button"
            onClick={() => {
              setMarcats(new Map());
              onSeleccionar([]);
            }}
            className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 shrink-0"
          >
            Desmarca ({marcats.size})
          </button>
        )}
      </div>
      <div className="overflow-y-auto px-1.5 py-1.5">
        {arbre.map((n) => (
          <FilaNode
            key={n.id}
            node={n}
            fondaria={0}
            obert={oberts.has(n.id)}
            marcat={marcatsSet.has(n.id)}
            onToggleObert={toggleObert}
            onToggleMarca={toggleMarca}
            onSeleccionar={onSeleccionar}
            obertsSet={oberts}
            marcatsSet={marcatsSet}
            color={color}
          />
        ))}
      </div>
    </div>
  );
}

/** Unió sense duplicats dels elements de diversos nodes */
function unio(nodes: NodeJerarquia[]): ElementModel[] {
  const vist = new Set<string>();
  const res: ElementModel[] = [];
  for (const n of nodes)
    for (const el of n.elements) {
      const k = `${el.modelId}:${el.dbId}`;
      if (!vist.has(k)) {
        vist.add(k);
        res.push(el);
      }
    }
  return res;
}

// ── Pestanya «Equip» ──────────────────────────────────────────────────────────

function PestanyaEquip({
  installacio,
  sistema,
  seleccio,
  escaneig,
}: {
  installacio: Installacio;
  sistema: Sistema;
  seleccio: SeleccioTag | null;
  escaneig: EstatEscaneig;
}) {
  const { rosmimanEquips } = useProjectes();
  const [exportant, setExportant] = useState(false);

  const codi = normTag(installacio.codiInstallacio);

  // Equips donats d'alta (Rosmiman) d'aquesta instal·lació
  const tagsAlta = useMemo(
    () =>
      codi
        ? rosmimanEquips.filter(
            (e) =>
              !tagIgnorat(e.tag) &&
              (normTag(e.codiInstallacio) === codi ||
                normTag(e.tag).startsWith(codi)),
          )
        : [],
    [rosmimanEquips, codi],
  );

  const tagsModel = useMemo(
    () =>
      new Set(
        escaneig.elements
          .map((e) => e.tag)
          .filter((t) => t.length > 0 && !tagIgnorat(t)),
      ),
    [escaneig.elements],
  );
  const escanejat = escaneig.estat === "ok";

  const descripcio = useMemo(
    () =>
      seleccio?.tag
        ? (rosmimanEquips.find((e) => normTag(e.tag) === seleccio.tag)
            ?.descripcio ?? null)
        : null,
    [rosmimanEquips, seleccio?.tag],
  );

  // Selecció múltiple: quants dels elements tenen TAG / consten a Rosmiman
  const resumMultiple = useMemo(() => {
    if (!seleccio?.elements) return null;
    const perClau = new Map(
      escaneig.elements.map((e) => [`${e.modelId}:${e.dbId}`, e.tag]),
    );
    const alta = new Set(tagsAlta.map((t) => normTag(t.tag)));
    let ambTag = 0;
    let donatsAlta = 0;
    for (const el of seleccio.elements) {
      const tag = perClau.get(`${el.modelId}:${el.dbId}`);
      if (tag) {
        ambTag++;
        if (alta.has(tag)) donatsAlta++;
      }
    }
    return { ambTag, donatsAlta };
  }, [seleccio?.elements, escaneig.elements, tagsAlta]);

  const exporta = async () => {
    setExportant(true);
    try {
      await exportaInformeTags({
        instalacioNom: installacio.nom,
        instalacioCodi: installacio.codiInstallacio ?? "",
        sistemaNom: sistema.nom,
        tagsAlta,
        tagsModel,
      });
      toast.success("Informe exportat");
    } catch (e) {
      toast.error(
        `No s'ha pogut exportar l'informe: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setExportant(false);
    }
  };

  // ── Amb selecció ──
  if (seleccio) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        {seleccio.count > 1 ? (
          <>
            <div className="space-y-1.5">
              <p className={ETIQUETA}>Selecció múltiple</p>
              <p className="text-sm text-slate-700">
                <span className="font-bold">{seleccio.count}</span> elements
                seleccionats
              </p>
            </div>
            {resumMultiple && (
              <div className="space-y-1 text-xs text-slate-500">
                <p>
                  Amb TAG:{" "}
                  <span className="font-semibold text-slate-700">
                    {resumMultiple.ambTag}
                  </span>
                </p>
                <p>
                  Donats d'alta:{" "}
                  <span className="font-semibold text-slate-700">
                    {resumMultiple.donatsAlta}
                  </span>
                </p>
              </div>
            )}
          </>
        ) : tagIgnorat(seleccio.tag) ? (
          <p className="text-xs text-slate-400 italic leading-relaxed">
            Aquest element s'ignora (el TAG conté CN00).
          </p>
        ) : !seleccio.tag ? (
          <p className="text-xs text-slate-400 italic leading-relaxed">
            L'element seleccionat no té TAG.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className={ETIQUETA}>TAG</p>
              <p className="text-sm text-slate-700 leading-snug break-all">
                {seleccio.tag}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className={ETIQUETA}>Descripció</p>
              {descripcio ? (
                <p className="text-sm text-slate-700 leading-snug">
                  {descripcio}
                </p>
              ) : (
                <p className="text-xs text-amber-600 italic leading-snug">
                  Aquest TAG no consta al llistat Rosmiman.
                </p>
              )}
            </div>
          </>
        )}
        <p className="text-[10px] text-slate-300">
          Esc per tornar a la vista normal
        </p>
      </div>
    );
  }

  // ── Sense selecció: resum de la instal·lació ──
  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      <div className="space-y-1.5">
        <p className={ETIQUETA}>Instal·lació</p>
        <p className="text-sm font-bold text-slate-800 uppercase tracking-wide leading-snug">
          {installacio.nom}
        </p>
      </div>
      <div className="space-y-1.5">
        <p className={ETIQUETA}>Codi</p>
        {installacio.codiInstallacio ? (
          <span className="inline-block font-mono text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
            {installacio.codiInstallacio}
          </span>
        ) : (
          <p className="text-xs text-slate-300">—</p>
        )}
      </div>
      <div className="space-y-1.5">
        <p className={ETIQUETA}>Equips donats d'alta</p>
        <p
          className="text-2xl font-bold leading-none"
          style={{ color: sistema.color }}
        >
          {tagsAlta.length}
        </p>
        {!codi && (
          <p className="text-[10.5px] text-amber-600 italic">
            La instal·lació no té codi: no es poden comptar els equips.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <p className={ETIQUETA}>Informe de TAGs</p>
        {escaneig.estat === "error" ? (
          <p className="text-xs text-amber-600 italic">
            No s'han pogut llegir els TAGs del model.
          </p>
        ) : escaneig.estat !== "ok" ? (
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            {escaneig.estat === "escanejant"
              ? `Llegint els TAGs del model… ${Math.round(escaneig.progres * 100)}%`
              : "Esperant el model…"}
          </p>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={!escanejat || tagsAlta.length === 0 || exportant}
          onClick={exporta}
          className="w-full h-8 gap-1.5 text-[11px] font-semibold"
          title={
            tagsAlta.length === 0
              ? "No hi ha equips donats d'alta per a aquesta instal·lació"
              : undefined
          }
        >
          {exportant ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          Exportar informe (.xlsx)
        </Button>
        <p className="text-[10px] text-slate-300 leading-snug">
          L'informe compara amb la vista 3D carregada actualment.
        </p>
      </div>

      <p className="text-[10.5px] text-slate-400 italic leading-relaxed">
        Selecciona un element del model per veure'n el TAG i la descripció.
      </p>
    </div>
  );
}

// ── Panell (contenidor amb pestanyes) ─────────────────────────────────────────

function PanellVisor({
  restabliments,
  installacio,
  sistema,
  seleccio,
  escaneig,
  onSeleccionarElements,
}: {
  installacio: Installacio;
  sistema: Sistema;
  seleccio: SeleccioTag | null;
  escaneig: EstatEscaneig;
  onSeleccionarElements: (els: ElementModel[]) => void;
  restabliments: number;
}) {
  const [pestanya, setPestanya] = useState<"equip" | "jerarquia">("equip");

  const Tab = ({
    id,
    icona,
    text,
  }: {
    id: "equip" | "jerarquia";
    icona: React.ReactNode;
    text: string;
  }) => (
    <button
      type="button"
      onClick={() => setPestanya(id)}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold border-b-2 transition-colors",
        pestanya === id
          ? "text-slate-800"
          : "border-transparent text-slate-400 hover:text-slate-600",
      )}
      style={pestanya === id ? { borderColor: sistema.color } : undefined}
    >
      {icona} {text}
    </button>
  );

  return (
    <aside className="w-80 shrink-0 flex flex-col min-h-0 border-l border-slate-200 bg-white">
      <div className="flex border-b border-slate-100 shrink-0">
        <Tab id="equip" icona={<Info className="h-3.5 w-3.5" />} text="Equip" />
        <Tab
          id="jerarquia"
          icona={<ListTree className="h-3.5 w-3.5" />}
          text="Jerarquia"
        />
      </div>
      {pestanya === "equip" ? (
        <PestanyaEquip
          installacio={installacio}
          sistema={sistema}
          seleccio={seleccio}
          escaneig={escaneig}
        />
      ) : (
        <PestanyaJerarquia
          restabliments={restabliments}
          escaneig={escaneig}
          onSeleccionar={onSeleccionarElements}
          color={sistema.color}
        />
      )}
    </aside>
  );
}

// ─── Pop-up Visor 3D ──────────────────────────────────────────────────────────

function Visor3DDialog({
  installacio,
  sistema,
  onClose,
}: {
  installacio: Installacio;
  sistema: Sistema;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const urnDisponible = !!urnMasterDe(installacio);

  const {
    estat,
    error,
    reintentar,
    vistes,
    vistaActual,
    carregaVista,
    canviantVista,
    seleccio,
    restableixVista,
    restabliments,
    escaneig,
    seleccionaElements,
  } = useApsViewer(containerRef, installacio);
  const carregant = estat !== "ok" && estat !== "error";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* [&>button]:hidden amaga el botó X per defecte de Radix per evitar solapament */}
      <DialogContent
        className="max-w-[92vw] w-full p-0 gap-0 overflow-hidden [&>button:last-child]:hidden"
        style={{ maxHeight: "90vh" }}
        onEscapeKeyDown={(e) => {
          // Esc torna a la vista normal (sense selecció i mostrant-ho tot).
          // Si ja hi és: en pantalla completa en surt; si no, tanca el visor.
          if (restableixVista()) {
            e.preventDefault();
            return;
          }
          if (document.fullscreenElement) {
            e.preventDefault();
            void document.exitFullscreen();
          }
        }}
        aria-describedby={undefined}
      >
        {/* DialogTitle ocult però present per accessibilitat (Radix ho requereix) */}
        <DialogHeader className="sr-only">
          <DialogTitle>
            {sistema.nom} — {installacio.nom}
          </DialogTitle>
        </DialogHeader>

        {/* Capçalera personalitzada */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white shrink-0">
          <div
            className="h-7 w-1 rounded-full shrink-0"
            style={{ background: sistema.color }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: sistema.color }}
              >
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
              <p className="text-xs text-slate-400 mt-0.5">
                {installacio.descripcio}
              </p>
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

        <div className="flex w-full" style={{ height: "75vh" }}>
          <div className="relative min-w-0 flex-1 bg-slate-900">
            {carregant && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-slate-900">
                <Loader2 className="h-8 w-8 animate-spin text-[#0099A8]" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">
                    {estat === "carregant-sdk" && "Carregant Viewer SDK…"}
                    {estat === "carregant-token" && "Autenticant amb APS…"}
                    {estat === "inicialitzant" && "Inicialitzant el visor…"}
                    {estat === "carregant-model" && "Carregant el model 3D…"}
                    {estat === "idle" && "Preparant…"}
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
                  <p className="font-semibold text-white text-sm">
                    No s'ha pogut carregar el model 3D
                  </p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-sm">
                    {error}
                  </p>
                  {!urnDisponible && (
                    <p className="text-xs text-amber-400 mt-2 leading-relaxed max-w-sm">
                      Executa l'agent APS per sincronitzar el MASTER d'aquesta
                      instal·lació.
                    </p>
                  )}
                </div>
                {urnDisponible && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
                    onClick={reintentar}
                  >
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
          <PanellVisor
            restabliments={restabliments}
            installacio={installacio}
            sistema={sistema}
            seleccio={seleccio}
            escaneig={escaneig}
            onSeleccionarElements={seleccionaElements}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fila de grup (sistema) ───────────────────────────────────────────────────

function SistemaGroup({
  sistema,
  expanded,
  onToggle,
  canEdit,
  modeAdmin,
  onEditSistema,
  onDeleteSistema,
  onAddInstallacio,
  onEditInstallacio,
  onDeleteInstallacio,
  onVisualitzar,
  filterQ,
}: {
  sistema: Sistema;
  expanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  modeAdmin: boolean;
  onEditSistema: () => void;
  onDeleteSistema: () => void;
  onAddInstallacio: () => void;
  onEditInstallacio: (i: Installacio) => void;
  onDeleteInstallacio: (i: Installacio) => void;
  onVisualitzar: (i: Installacio) => void;
  filterQ: string;
}) {
  const filtered = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    if (!q) return sistema.installacions;
    return sistema.installacions.filter(
      (i) =>
        i.nom.toLowerCase().includes(q) ||
        (i.codiInstallacio ?? "").toLowerCase().includes(q) ||
        (i.descripcio ?? "").toLowerCase().includes(q),
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
            <div
              className="h-5 w-1 rounded-full shrink-0"
              style={{ background: sistema.color }}
            />
            {expanded ? (
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: sistema.color }}
              />
            ) : (
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: sistema.color }}
              />
            )}
            {codiSistema(sistema) && (
              <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                {codiSistema(sistema)}
              </span>
            )}
            <span
              className="text-[11px] font-bold uppercase tracking-widest"
              style={{ color: sistema.color }}
            >
              {sistema.nom}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {sistema.installacions.length} instal·lació
              {sistema.installacions.length !== 1 ? "ns" : ""}
            </span>
            {sistema.descripcio && (
              <span className="text-[10px] text-slate-400 hidden md:inline">
                — {sistema.descripcio}
              </span>
            )}
          </div>
        </td>
        {modeAdmin && (
          <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1 justify-end">
              <button
                onClick={onAddInstallacio}
                className="h-6 px-2 rounded flex items-center gap-1 text-[10px] font-semibold transition-colors hover:opacity-80"
                style={{
                  color: sistema.color,
                  background: `${sistema.color}15`,
                }}
              >
                <Plus className="h-3 w-3" /> Nova instal·lació
              </button>
              <button
                onClick={onEditSistema}
                className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-[#0099A8] hover:bg-[#0099A8]/10 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={onDeleteSistema}
                className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </td>
        )}
      </tr>

      {expanded &&
        filtered.map((inst, idx) => (
          <tr
            key={inst.id}
            className={cn(
              "border-t border-slate-50 hover:bg-slate-50/60 transition-colors",
              idx % 2 === 0 ? "bg-white" : "bg-slate-50/30",
            )}
          >
            <td className="p-0 w-0">
              <div
                className="h-full w-0.5 ml-6"
                style={{ background: `${sistema.color}30` }}
              />
            </td>
            <td className="py-2.5 pl-8 pr-2">
              {inst.codiInstallacio ? (
                <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {inst.codiInstallacio}
                </span>
              ) : (
                <span className="text-slate-300 text-xs">—</span>
              )}
            </td>
            <td className="py-2.5 px-2">
              <p className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide leading-tight">
                {inst.nom}
              </p>
              {inst.descripcio && (
                <p className="text-[10.5px] text-slate-400 mt-0.5 leading-snug">
                  {inst.descripcio}
                </p>
              )}
            </td>
            <td className="py-2.5 px-2 hidden lg:table-cell">
              {urnMasterDe(inst) ? (
                <span
                  className="text-[10px] font-mono text-[#0099A8] bg-[#0099A8]/8 px-1.5 py-0.5 rounded truncate block max-w-[260px]"
                  title={urnMasterDe(inst)}
                >
                  {urnMasterDe(inst).length > 42
                    ? urnMasterDe(inst).slice(0, 42) + "…"
                    : urnMasterDe(inst)}
                </span>
              ) : (
                <span className="text-[10px] text-slate-300 italic">
                  Sense MASTER — sincronitza l'agent
                </span>
              )}
            </td>
            <td className="py-2.5 px-3 text-right whitespace-nowrap">
              <div className="flex items-center gap-1.5 justify-end">
                <Button
                  size="sm"
                  className="h-7 px-3 text-[11px] font-semibold gap-1.5 text-white disabled:opacity-40"
                  style={{ background: sistema.color }}
                  disabled={!urnMasterDe(inst)}
                  title={
                    !urnMasterDe(inst)
                      ? "Sense MASTER — executa l'agent APS"
                      : undefined
                  }
                  onClick={() => onVisualitzar(inst)}
                >
                  <Monitor className="h-3 w-3" /> Visualitzar
                </Button>
                {modeAdmin && (
                  <>
                    <button
                      onClick={() => onEditInstallacio(inst)}
                      className="h-7 w-7 rounded flex items-center justify-center text-slate-400 hover:text-[#0099A8] hover:bg-[#0099A8]/10 transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onDeleteInstallacio(inst)}
                      className="h-7 w-7 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
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
          <td
            colSpan={modeAdmin ? 6 : 5}
            className="py-4 pl-12 text-xs text-slate-400 italic"
          >
            {modeAdmin ? (
              <button
                onClick={onAddInstallacio}
                className="flex items-center gap-1 text-[#0099A8] hover:underline"
              >
                <Plus className="h-3 w-3" /> Afegeix la primera instal·lació a
                aquest sistema
              </button>
            ) : (
              "No hi ha instal·lacions configurades per a aquest sistema."
            )}
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
    sistemes,
    loading,
    error,
    refetch,
    createSistema,
    updateSistema,
    deleteSistema,
    createInstallacio,
    updateInstallacio,
    deleteInstallacio,
  } = useVisor3DSistemes();

  const [filterQ, setFilterQ] = useState("");
  const [modeAdmin, setModeAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && sistemes.length > 0) {
      setExpanded(new Set(sistemes.map((s) => s.id)));
      initializedRef.current = true;
    }
  }, [sistemes]);

  useEffect(() => {
    setExpanded((prev) => {
      const n = new Set(prev);
      sistemes.forEach((s) => n.add(s.id));
      return n;
    });
  }, [sistemes]);

  const [visor, setVisor] = useState<{
    inst: Installacio;
    sistema: Sistema;
  } | null>(null);
  const [sistemaDialeg, setSistemaDialeg] = useState<{
    open: boolean;
    mode: "create" | "edit";
    target?: Sistema;
  }>({ open: false, mode: "create" });
  const [installacioDialeg, setInstallacioDialeg] = useState<{
    open: boolean;
    mode: "create" | "edit";
    sistema?: Sistema;
    target?: Installacio;
  }>({ open: false, mode: "create" });
  const [deleteDialeg, setDeleteDialeg] = useState<{
    open: boolean;
    type: "sistema" | "installacio";
    id: string;
    sistemaId?: string;
    nom: string;
  } | null>(null);
  const [resetDialeg, setResetDialeg] = useState(false);

  const handleResetAll = async () => {
    setSaving(true);
    setOpError(null);
    try {
      // Elimina tots els sistemes (les instal·lacions s'eliminen en cascada per FK a Supabase)
      for (const s of sistemes) {
        await deleteSistema(s.id);
      }
      setExpanded(new Set());
      setResetDialeg(false);
    } catch (e) {
      setOpError(
        e instanceof Error ? e.message : "Error eliminant totes les dades.",
      );
    } finally {
      setSaving(false);
    }
  };

  const totalInstallacions = sistemes.reduce(
    (acc, s) => acc + s.installacions.length,
    0,
  );

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
    <div className="flex flex-col gap-6">
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
          <Button
            variant={modeAdmin ? "default" : "outline"}
            size="sm"
            onClick={() => setModeAdmin((v) => !v)}
            className={cn(
              "gap-1.5",
              modeAdmin
                ? "bg-[#0099A8] hover:bg-[#007a87] text-white"
                : "border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40",
            )}
          >
            {modeAdmin ? (
              <>
                <X className="h-3.5 w-3.5" /> Sortir de l'edició
              </>
            ) : (
              <>
                <Settings className="h-3.5 w-3.5" /> Gestionar sistemes
              </>
            )}
          </Button>
        )}
      </div>

      {modeAdmin && (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-[#005A63] font-medium"
          style={{ background: "#0099A815", border: "1px solid #0099A830" }}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Mode edició actiu — pots crear, editar i eliminar sistemes i
          instal·lacions.
        </div>
      )}

      {opError && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-red-700 font-medium bg-red-50 border border-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {opError}
          <button
            onClick={() => setOpError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Cerca instal·lació…"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            className="pl-8 h-8 text-sm border-slate-200"
          />
        </div>
        {modeAdmin && (
          <Button
            size="sm"
            onClick={() => setSistemaDialeg({ open: true, mode: "create" })}
            disabled={saving}
            className="gap-1.5 bg-[#0099A8] hover:bg-[#007a87] text-white h-8"
          >
            <Plus className="h-3.5 w-3.5" /> Nou sistema
          </Button>
        )}
        {modeAdmin && sistemes.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setResetDialeg(true)}
            disabled={saving}
            className="gap-1.5 border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 h-8"
          >
            <Trash2 className="h-3.5 w-3.5" /> Esborrar tot
          </Button>
        )}
        <div className="ml-auto text-xs text-slate-400 self-center flex items-center gap-1.5">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {sistemes.length} sistema{sistemes.length !== 1 ? "s" : ""} ·{" "}
          {totalInstallacions} instal·lació
          {totalInstallacions !== 1 ? "ns" : ""}
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
          <Button
            size="sm"
            variant="outline"
            onClick={refetch}
            className="gap-1.5 text-red-600 border-red-200 hover:bg-red-100"
          >
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !error && (
        <div
          className="border border-slate-200 rounded-lg bg-white overflow-auto shadow-sm"
          style={{ maxHeight: "calc(100vh - 280px)" }}
        >
          <table
            className="w-full text-sm"
            style={{ tableLayout: "fixed", minWidth: 700 }}
          >
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
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Codi
                </th>
                <th className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Instal·lació
                </th>
                <th className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hidden lg:table-cell">
                  URN Model
                </th>
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">
                  Accions
                </th>
              </tr>
            </thead>
            <tbody>
              {sistemes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-400">
                    <Building2 className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                    <p className="text-sm">No hi ha sistemes configurats.</p>
                    {modeAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 gap-1"
                        onClick={() =>
                          setSistemaDialeg({ open: true, mode: "create" })
                        }
                      >
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
                      onEditSistema={() =>
                        setSistemaDialeg({
                          open: true,
                          mode: "edit",
                          target: sistema,
                        })
                      }
                      onDeleteSistema={() =>
                        setDeleteDialeg({
                          open: true,
                          type: "sistema",
                          id: sistema.id,
                          nom: sistema.nom,
                        })
                      }
                      onAddInstallacio={() => {
                        setExpanded((prev) => new Set([...prev, sistema.id]));
                        setInstallacioDialeg({
                          open: true,
                          mode: "create",
                          sistema,
                        });
                      }}
                      onEditInstallacio={(inst) =>
                        setInstallacioDialeg({
                          open: true,
                          mode: "edit",
                          sistema,
                          target: inst,
                        })
                      }
                      onDeleteInstallacio={(inst) =>
                        setDeleteDialeg({
                          open: true,
                          type: "installacio",
                          id: inst.id,
                          sistemaId: sistema.id,
                          nom: inst.nom,
                        })
                      }
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
        title={
          sistemaDialeg.mode === "create" ? "Nou sistema" : "Editar sistema"
        }
        saving={saving}
        initial={
          sistemaDialeg.target
            ? {
                nom: sistemaDialeg.target.nom,
                descripcio: sistemaDialeg.target.descripcio ?? "",
                codi: sistemaDialeg.target.codi ?? "",
                color: sistemaDialeg.target.color,
              }
            : undefined
        }
      />

      <InstallacioFormDialog
        open={installacioDialeg.open}
        onClose={() => setInstallacioDialeg({ open: false, mode: "create" })}
        onSave={handleSaveInstallacio}
        title={
          installacioDialeg.mode === "create"
            ? "Nova instal·lació"
            : "Editar instal·lació"
        }
        sistemaColor={installacioDialeg.sistema?.color ?? "#0099A8"}
        sistemaNom={installacioDialeg.sistema?.nom ?? ""}
        saving={saving}
        initial={
          installacioDialeg.target
            ? {
                nom: installacioDialeg.target.nom,
                descripcio: installacioDialeg.target.descripcio ?? "",
                codiInstallacio: installacioDialeg.target.codiInstallacio ?? "",
                urnMaster: installacioDialeg.target.urnMaster ?? "",
              }
            : undefined
        }
      />

      <AlertDialog
        open={!!deleteDialeg?.open}
        onOpenChange={(o) => !o && setDeleteDialeg(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar{" "}
              {deleteDialeg?.type === "sistema" ? "sistema" : "instal·lació"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estàs a punt d'eliminar <strong>«{deleteDialeg?.nom}»</strong>.
              {deleteDialeg?.type === "sistema" && (
                <> Totes les instal·lacions que conté també s'eliminaran.</>
              )}{" "}
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
                if (deleteDialeg.type === "sistema")
                  handleDeleteSistema(deleteDialeg.id);
                else
                  handleDeleteInstallacio(
                    deleteDialeg.sistemaId!,
                    deleteDialeg.id,
                  );
              }}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Diàleg confirmació RESET ─────────────────────────────────────── */}
      <AlertDialog open={resetDialeg} onOpenChange={setResetDialeg}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-4 w-4" /> Esborrar tots els sistemes i
              instal·lacions
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estàs a punt d'eliminar{" "}
              <strong>tots els {sistemes.length} sistemes</strong> i totes les
              seves instal·lacions ({totalInstallacions} en total).
              <br />
              <br />
              Aquesta acció <strong>no es pot desfer</strong>. Hauràs de tornar
              a executar l'agent APS per recuperar les dades.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={saving}
              onClick={handleResetAll}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{" "}
                  Esborrant…
                </>
              ) : (
                "Sí, esborrar tot"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
