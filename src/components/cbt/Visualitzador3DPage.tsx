// src/components/cbt/Visualitzador3DPage.tsx
//
// Pàgina Visualitzador 3D
// ─────────────────────────────────────────────────────────────────────────────
// Llista totes les instal·lacions agrupades per sistema en una taula.
// Clicar "Visualitzar" obre el visor Autodesk 360 en un pop-up.
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
  Link,
  AlignLeft,
  Palette,
  Search,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  useVisor3DSistemes,
  type Sistema,
  type Installacio,
} from "@/hooks/useVisor3DSistemes";

// ─── Colors predefinits ───────────────────────────────────────────────────────

const COLORS_PRESET = [
  "#0099A8", "#6366F1", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
  "#06B6D4", "#84CC16", "#64748B", "#0EA5E9",
];

// ─── Formulari Sistema ────────────────────────────────────────────────────────

interface SistemaFormData { nom: string; descripcio: string; color: string; }
const SISTEMA_BUIT: SistemaFormData = { nom: "", descripcio: "", color: "#0099A8" };

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

interface InstallacioFormData { nom: string; descripcio: string; codiInstallacio: string; embedUrl: string; }
const INSTALLACIO_BUIDA: InstallacioFormData = { nom: "", descripcio: "", codiInstallacio: "", embedUrl: "" };

function InstallacioFormDialog({ open, onClose, onSave, initial, title, sistemaColor, sistemaNom, saving }: {
  open: boolean; onClose: () => void;
  onSave: (d: InstallacioFormData) => void;
  initial?: InstallacioFormData; title: string;
  sistemaColor: string; sistemaNom: string;
  saving?: boolean;
}) {
  const [form, setForm] = useState<InstallacioFormData>(initial ?? INSTALLACIO_BUIDA);
  useEffect(() => { if (open) setForm(initial ?? INSTALLACIO_BUIDA); }, [open, initial]);
  const valid = form.nom.trim().length > 0 && form.embedUrl.trim().length > 0;

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
              <Link className="h-3 w-3" /> URL d'embed Autodesk 360 *
            </Label>
            <Input value={form.embedUrl} onChange={(e) => setForm(f => ({ ...f, embedUrl: e.target.value }))}
              placeholder="https://besostordera.autodesk360.com/…?mode=embed"
              className="text-xs font-mono" />
            <p className="text-[10.5px] text-slate-400 leading-relaxed">
              Autodesk 360 → Compartir → Integrar. Ha d'incloure{" "}
              <code className="bg-slate-100 px-1 rounded">?mode=embed</code>.
            </p>
          </div>
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

// ─── Pop-up Visor 3D ──────────────────────────────────────────────────────────

function Visor3DDialog({ installacio, sistema, onClose }: {
  installacio: Installacio; sistema: Sistema; onClose: () => void;
}) {
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[92vw] w-full p-0 gap-0 overflow-hidden"
        style={{ maxHeight: "90vh" }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white shrink-0">
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
          <button onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative w-full bg-slate-50" style={{ height: "75vh" }}>
          {iframeError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-600 text-sm">No s'ha pogut carregar el model 3D</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-sm">
                  Autodesk 360 ha rebutjat la connexió. Comprova que el model estigui compartit
                  com a <strong>Public</strong> amb embedding activat.
                </p>
              </div>
              <a href={installacio.embedUrl.replace("?mode=embed", "")}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[#0099A8] hover:underline font-medium">
                <ExternalLink className="h-3.5 w-3.5" /> Obrir directament a Autodesk 360
              </a>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              key={installacio.id}
              src={installacio.embedUrl}
              title={installacio.nom}
              className="w-full h-full border-none"
              allowFullScreen
              onError={() => setIframeError(true)}
              onLoad={(e) => {
                try {
                  const frame = e.currentTarget as HTMLIFrameElement;
                  if (frame.contentDocument !== null) {
                    const t = frame.contentDocument?.title ?? "";
                    if (t.toLowerCase().includes("error") || t === "") setIframeError(true);
                  }
                } catch { /* cross-origin */ }
              }}
            />
          )}
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
            <span className="text-[10px] font-mono text-slate-400 truncate block max-w-[240px]"
              title={inst.embedUrl}>
              {inst.embedUrl}
            </span>
          </td>
          <td className="py-2.5 px-3 text-right whitespace-nowrap">
            <div className="flex items-center gap-1.5 justify-end">
              <Button size="sm"
                className="h-7 px-3 text-[11px] font-semibold gap-1.5 text-white"
                style={{ background: sistema.color }}
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

  // Expandeix tots quan es carreguen per primera vegada
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && sistemes.length > 0) {
      setExpanded(new Set(sistemes.map(s => s.id)));
      initializedRef.current = true;
    }
  }, [sistemes]);

  // Expandeix nous sistemes afegits
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

  const handleSaveSistema = (data: { nom: string; descripcio: string; color: string }) => {
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

  const handleSaveInstallacio = (data: { nom: string; descripcio: string; codiInstallacio: string; embedUrl: string }) => {
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
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                <col style={{ width: 4 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: "auto" }} />
                <col style={{ width: 260 }} />
                <col style={{ width: modeAdmin ? 180 : 130 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-white border-b border-slate-200">
                <tr className="text-left">
                  <th className="p-0" />
                  <th className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Codi</th>
                  <th className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Instal·lació</th>
                  <th className="py-2.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden lg:table-cell">URL Model</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Accions</th>
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
                  sistemes.map((sistema) => (
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
          ? { nom: sistemaDialeg.target.nom, descripcio: sistemaDialeg.target.descripcio ?? "", color: sistemaDialeg.target.color }
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
          ? { nom: installacioDialeg.target.nom, descripcio: installacioDialeg.target.descripcio ?? "", codiInstallacio: installacioDialeg.target.codiInstallacio ?? "", embedUrl: installacioDialeg.target.embedUrl }
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
