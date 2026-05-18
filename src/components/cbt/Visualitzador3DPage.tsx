// src/components/cbt/Visualitzador3DPage.tsx
//
// Pàgina Visualitzador 3D — permet seleccionar un Sistema i, dins d'ell,
// una Instal·lació concreta per mostrar el model Autodesk 360 incrustat.
//
// Els sistemes i instal·lacions es gestionen des de la pròpia interfície
// i es persisteixen en localStorage (clau: "cbt_visor3d_sistemes").
//
// Els usuaris Admin i Editor poden crear/editar/eliminar.
// Els Visualitzadors només poden navegar i veure els models.

import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ChevronRight,
  Layers,
  MapPin,
  AlertTriangle,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Settings,
  X,
  Check,
  Link,
  Hash,
  Tag,
  AlignLeft,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

// ─── Tipus de dades ───────────────────────────────────────────────────────────

interface Installacio {
  id: string;
  nom: string;
  descripcio?: string;
  embedUrl: string;
  codiInstallacio?: string;
}

interface Sistema {
  id: string;
  nom: string;
  descripcio?: string;
  icona?: string;
  color: string;
  installacions: Installacio[];
}

// ─── Dades inicials per defecte ──────────────────────────────────────────────

const SISTEMES_INICIALS: Sistema[] = [
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
          "https://besostordera.autodesk360.com/g/shares/SH512d4QTec90decfa6e44d59b851f10e507?mode=embed",
      },
    ],
  },
  {
    id: "sanejament",
    nom: "Sistemes de Sanejament",
    descripcio: "Xarxes i instal·lacions de sanejament i col·lectors",
    icona: "🔩",
    color: "#6366F1",
    installacions: [],
  },
];

const STORAGE_KEY = "cbt_visor3d_sistemes";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Hook de persistència ─────────────────────────────────────────────────────

function useSistemes() {
  const [sistemes, setSistemes] = useState<Sistema[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Sistema[];
    } catch {
      /* ignore */
    }
    return SISTEMES_INICIALS;
  });

  const save = useCallback((next: Sistema[]) => {
    setSistemes(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  return { sistemes, save };
}

// ─── Colors predefinits ───────────────────────────────────────────────────────

const COLORS_PRESET = [
  "#0099A8", "#6366F1", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
  "#06B6D4", "#84CC16", "#64748B", "#0EA5E9",
];

// ─── Formulari Sistema ────────────────────────────────────────────────────────

interface SistemaFormData {
  nom: string;
  descripcio: string;
  icona: string;
  color: string;
}

const SISTEMA_BUIT: SistemaFormData = {
  nom: "",
  descripcio: "",
  icona: "🏭",
  color: "#0099A8",
};

function SistemaFormDialog({
  open,
  onClose,
  onSave,
  initial,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: SistemaFormData) => void;
  initial?: SistemaFormData;
  title: string;
}) {
  const [form, setForm] = useState<SistemaFormData>(initial ?? SISTEMA_BUIT);

  useEffect(() => {
    if (open) setForm(initial ?? SISTEMA_BUIT);
  }, [open, initial]);

  const valid = form.nom.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Layers className="h-4 w-4 text-[#0099A8]" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Nom del sistema *
            </Label>
            <Input
              value={form.nom}
              onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              placeholder="p.ex. Estacions Depuradores"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <AlignLeft className="h-3 w-3" /> Descripció
            </Label>
            <Input
              value={form.descripcio}
              onChange={(e) => setForm((f) => ({ ...f, descripcio: e.target.value }))}
              placeholder="Descripció breu (opcional)"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Hash className="h-3 w-3" /> Icona (emoji)
            </Label>
            <Input
              value={form.icona}
              onChange={(e) => setForm((f) => ({ ...f, icona: e.target.value }))}
              placeholder="💧"
              className="text-sm w-24"
              maxLength={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Palette className="h-3 w-3" /> Color accent
            </Label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLORS_PRESET.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                    form.color === c ? "border-slate-800 scale-110" : "border-transparent"
                  )}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-7 w-7 rounded-full border-0 cursor-pointer bg-transparent"
                title="Color personalitzat"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel·lar
          </Button>
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => { if (valid) onSave(form); }}
            className="bg-[#0099A8] hover:bg-[#007a87] text-white"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Desar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Formulari Instal·lació ───────────────────────────────────────────────────

interface InstallacioFormData {
  nom: string;
  descripcio: string;
  codiInstallacio: string;
  embedUrl: string;
}

const INSTALLACIO_BUIDA: InstallacioFormData = {
  nom: "",
  descripcio: "",
  codiInstallacio: "",
  embedUrl: "",
};

function InstallacioFormDialog({
  open,
  onClose,
  onSave,
  initial,
  title,
  sistemaColor,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: InstallacioFormData) => void;
  initial?: InstallacioFormData;
  title: string;
  sistemaColor: string;
}) {
  const [form, setForm] = useState<InstallacioFormData>(initial ?? INSTALLACIO_BUIDA);

  useEffect(() => {
    if (open) setForm(initial ?? INSTALLACIO_BUIDA);
  }, [open, initial]);

  const valid = form.nom.trim().length > 0 && form.embedUrl.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <MapPin className="h-4 w-4" style={{ color: sistemaColor }} />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Nom de la instal·lació *
            </Label>
            <Input
              value={form.nom}
              onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              placeholder="p.ex. ED005 La Llagosta"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Hash className="h-3 w-3" /> Codi instal·lació
            </Label>
            <Input
              value={form.codiInstallacio}
              onChange={(e) => setForm((f) => ({ ...f, codiInstallacio: e.target.value }))}
              placeholder="p.ex. ED005"
              className="text-sm font-mono w-40"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <AlignLeft className="h-3 w-3" /> Descripció
            </Label>
            <Input
              value={form.descripcio}
              onChange={(e) => setForm((f) => ({ ...f, descripcio: e.target.value }))}
              placeholder="Descripció breu (opcional)"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Link className="h-3 w-3" /> URL d'embed Autodesk 360 *
            </Label>
            <Input
              value={form.embedUrl}
              onChange={(e) => setForm((f) => ({ ...f, embedUrl: e.target.value }))}
              placeholder="https://besostordera.autodesk360.com/…?mode=embed"
              className="text-sm font-mono text-xs"
            />
            <p className="text-[10.5px] text-slate-400 leading-relaxed">
              Copia la URL d'embed des de <strong>Autodesk 360 → Compartir → Integrar</strong>.
              Ha d'incloure <code className="bg-slate-100 px-1 rounded">?mode=embed</code>.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel·lar
          </Button>
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => { if (valid) onSave(form); }}
            style={{ background: sistemaColor }}
            className="text-white hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Desar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Component principal ──────────────────────────────────────────────────────

export function Visualitzador3DPage() {
  const { isAdmin, canEditView } = useAuth();
  const canEdit = isAdmin || canEditView("revit");

  const { sistemes, save } = useSistemes();

  const [sistemaActiu, setSistemaActiu] = useState<Sistema | null>(
    sistemes.length > 0 ? sistemes[0] : null
  );
  const [installacioActiva, setInstallacioActiva] = useState<Installacio | null>(
    sistemes[0]?.installacions[0] ?? null
  );
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [modeAdmin, setModeAdmin] = useState(false);

  // Diàlegs
  const [sistemaDialeg, setSistemaDialeg] = useState<{
    open: boolean; mode: "create" | "edit"; target?: Sistema;
  }>({ open: false, mode: "create" });

  const [installacioDialeg, setInstallacioDialeg] = useState<{
    open: boolean; mode: "create" | "edit"; target?: Installacio;
  }>({ open: false, mode: "create" });

  const [deleteDialeg, setDeleteDialeg] = useState<{
    open: boolean; type: "sistema" | "installacio"; id: string; nom: string;
  } | null>(null);

  // Manté sistemaActiu sincronitzat quan canvien els sistemes
  useEffect(() => {
    if (!sistemaActiu) {
      setSistemaActiu(sistemes[0] ?? null);
      setInstallacioActiva(sistemes[0]?.installacions[0] ?? null);
      return;
    }
    const updated = sistemes.find((s) => s.id === sistemaActiu.id) ?? null;
    setSistemaActiu(updated);
    if (updated && installacioActiva) {
      const updatedInst = updated.installacions.find((i) => i.id === installacioActiva.id) ?? null;
      setInstallacioActiva(updatedInst ?? updated.installacions[0] ?? null);
    } else if (updated) {
      setInstallacioActiva(updated.installacions[0] ?? null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sistemes]);

  // ── Handlers Sistemes ──────────────────────────────────────────────────────

  const handleSelectSistema = (sistema: Sistema) => {
    setSistemaActiu(sistema);
    setIframeError(false);
    setInstallacioActiva(sistema.installacions[0] ?? null);
  };

  const handleSaveSistema = (data: SistemaFormData) => {
    if (sistemaDialeg.mode === "create") {
      const nou: Sistema = { id: generateId(), ...data, installacions: [] };
      const next = [...sistemes, nou];
      save(next);
      setSistemaActiu(nou);
      setInstallacioActiva(null);
    } else if (sistemaDialeg.target) {
      const next = sistemes.map((s) =>
        s.id === sistemaDialeg.target!.id ? { ...s, ...data } : s
      );
      save(next);
    }
    setSistemaDialeg({ open: false, mode: "create" });
  };

  const handleDeleteSistema = (id: string) => {
    const next = sistemes.filter((s) => s.id !== id);
    save(next);
    if (sistemaActiu?.id === id) {
      setSistemaActiu(next[0] ?? null);
      setInstallacioActiva(next[0]?.installacions[0] ?? null);
    }
    setDeleteDialeg(null);
  };

  // ── Handlers Instal·lacions ────────────────────────────────────────────────

  const handleSelectInstallacio = (inst: Installacio) => {
    setIframeError(false);
    setInstallacioActiva(inst);
  };

  const handleSaveInstallacio = (data: InstallacioFormData) => {
    if (!sistemaActiu) return;

    if (installacioDialeg.mode === "create") {
      const nova: Installacio = { id: generateId(), ...data };
      const nextInstallacions = [...sistemaActiu.installacions, nova];
      const next = sistemes.map((s) =>
        s.id === sistemaActiu.id ? { ...s, installacions: nextInstallacions } : s
      );
      save(next);
      setInstallacioActiva(nova);
    } else if (installacioDialeg.target) {
      const nextInstallacions = sistemaActiu.installacions.map((i) =>
        i.id === installacioDialeg.target!.id ? { ...i, ...data } : i
      );
      const next = sistemes.map((s) =>
        s.id === sistemaActiu.id ? { ...s, installacions: nextInstallacions } : s
      );
      save(next);
      if (installacioActiva?.id === installacioDialeg.target.id) {
        setInstallacioActiva({ ...installacioDialeg.target, ...data });
        setIframeError(false);
      }
    }
    setInstallacioDialeg({ open: false, mode: "create" });
  };

  const handleDeleteInstallacio = (id: string) => {
    if (!sistemaActiu) return;
    const nextInstallacions = sistemaActiu.installacions.filter((i) => i.id !== id);
    const next = sistemes.map((s) =>
      s.id === sistemaActiu.id ? { ...s, installacions: nextInstallacions } : s
    );
    save(next);
    if (installacioActiva?.id === id) {
      setInstallacioActiva(nextInstallacions[0] ?? null);
      setIframeError(false);
    }
    setDeleteDialeg(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Capçalera */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Box className="h-6 w-6 text-[#0099A8]" />
            Visualitzador 3D
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Explora els models BIM de les instal·lacions del Consorci Besòs Tordera
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
                : "border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40"
            )}
          >
            {modeAdmin ? (
              <><X className="h-3.5 w-3.5" /> Sortir de l'edició</>
            ) : (
              <><Settings className="h-3.5 w-3.5" /> Gestionar sistemes</>
            )}
          </Button>
        )}
      </div>

      {/* Banner mode edició */}
      {modeAdmin && (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-[#005A63] font-medium"
          style={{ background: "#0099A815", border: "1px solid #0099A830" }}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Mode edició actiu — pots crear, editar i eliminar sistemes i instal·lacions.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* ── Panell lateral ─────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Sistemes */}
          <div>
            <div className="flex items-center justify-between px-1 py-1 mb-2">
              <div
                className="flex items-center gap-1.5"
                style={{
                  fontSize: "9px", fontWeight: 700,
                  letterSpacing: "0.15em", textTransform: "uppercase",
                  color: "rgba(0,0,0,0.3)",
                }}
              >
                <Layers className="h-3 w-3" />
                <span>Sistemes</span>
              </div>
              {modeAdmin && (
                <button
                  onClick={() => setSistemaDialeg({ open: true, mode: "create" })}
                  className="flex items-center gap-1 text-[10px] font-semibold text-[#0099A8] hover:text-[#007a87] transition-colors"
                >
                  <Plus className="h-3 w-3" /> Nou sistema
                </button>
              )}
            </div>

            <div className="space-y-1">
              {sistemes.map((sistema) => {
                const isActive = sistemaActiu?.id === sistema.id;
                return (
                  <div key={sistema.id} className="flex items-center gap-1">
                    <button
                      onClick={() => handleSelectSistema(sistema)}
                      className={cn(
                        "flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150",
                        isActive ? "shadow-sm" : "hover:bg-slate-100"
                      )}
                      style={
                        isActive
                          ? { background: `${sistema.color}12`, border: `1px solid ${sistema.color}30` }
                          : { border: "1px solid transparent" }
                      }
                    >
                      <span
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ background: isActive ? `${sistema.color}20` : "#f1f5f9" }}
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
                      {isActive && !modeAdmin && (
                        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: sistema.color }} />
                      )}
                    </button>

                    {modeAdmin && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setSistemaDialeg({ open: true, mode: "edit", target: sistema })}
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#0099A8] hover:bg-[#0099A8]/8 transition-colors"
                          title="Editar sistema"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setDeleteDialeg({ open: true, type: "sistema", id: sistema.id, nom: sistema.nom })}
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Eliminar sistema"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {sistemes.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-xs text-slate-400 italic mb-2">No hi ha sistemes configurats</p>
                  {modeAdmin && (
                    <Button size="sm" variant="outline" className="text-xs gap-1"
                      onClick={() => setSistemaDialeg({ open: true, mode: "create" })}>
                      <Plus className="h-3 w-3" /> Crear primer sistema
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Instal·lacions */}
          {sistemaActiu && (
            <div>
              <div className="flex items-center justify-between px-1 py-1 mb-2">
                <div
                  className="flex items-center gap-1.5 min-w-0"
                  style={{
                    fontSize: "9px", fontWeight: 700,
                    letterSpacing: "0.15em", textTransform: "uppercase",
                    color: "rgba(0,0,0,0.3)",
                  }}
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">Instal·lacions — {sistemaActiu.nom}</span>
                </div>
                {modeAdmin && (
                  <button
                    onClick={() => setInstallacioDialeg({ open: true, mode: "create" })}
                    className="flex items-center gap-1 text-[10px] font-semibold shrink-0 ml-1"
                    style={{ color: sistemaActiu.color }}
                  >
                    <Plus className="h-3 w-3" /> Nova
                  </button>
                )}
              </div>

              {sistemaActiu.installacions.length > 0 ? (
                <Card className="border-slate-100 shadow-sm bg-white overflow-hidden p-0">
                  <div className="divide-y divide-slate-50">
                    {sistemaActiu.installacions.map((inst) => {
                      const isActive = installacioActiva?.id === inst.id;
                      return (
                        <div
                          key={inst.id}
                          className="flex items-center"
                          style={isActive ? { background: `${sistemaActiu.color}08` } : {}}
                        >
                          <button
                            onClick={() => handleSelectInstallacio(inst)}
                            className={cn(
                              "flex-1 flex items-center gap-3 px-4 py-3 text-left transition-all duration-150",
                              !isActive && "hover:bg-slate-50"
                            )}
                          >
                            <div
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ background: isActive ? sistemaActiu.color : "#cbd5e1" }}
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[12.5px] font-medium truncate leading-tight"
                                style={{ color: isActive ? sistemaActiu.color : "#475569" }}
                              >
                                {inst.nom}
                              </p>
                              {inst.codiInstallacio && (
                                <p className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                                  {inst.codiInstallacio}
                                </p>
                              )}
                            </div>
                            {isActive && !modeAdmin && (
                              <span className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{ background: sistemaActiu.color }} />
                            )}
                          </button>

                          {modeAdmin && (
                            <div className="flex items-center gap-0.5 pr-2 shrink-0">
                              <button
                                onClick={() => setInstallacioDialeg({ open: true, mode: "edit", target: inst })}
                                className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-[#0099A8] hover:bg-[#0099A8]/8 transition-colors"
                                title="Editar"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => setDeleteDialeg({ open: true, type: "installacio", id: inst.id, nom: inst.nom })}
                                className="h-6 w-6 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ) : (
                <Card className="border-slate-100 shadow-sm bg-white p-6 text-center">
                  <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 mb-3">
                    No hi ha instal·lacions configurades.
                  </p>
                  {modeAdmin && (
                    <Button size="sm" variant="outline" className="text-xs gap-1"
                      onClick={() => setInstallacioDialeg({ open: true, mode: "create" })}>
                      <Plus className="h-3 w-3" /> Afegir instal·lació
                    </Button>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>

        {/* ── Visor 3D ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {installacioActiva ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
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
                    <p className="text-xs text-slate-400 mt-1">{installacioActiva.descripcio}</p>
                  )}
                </div>
              </div>

              <Card className="border-slate-100 shadow-sm bg-white overflow-hidden p-0">
                <div className="relative w-full" style={{ paddingBottom: "56.25%", minHeight: "400px" }}>
                  {iframeError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-50 px-8 text-center">
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
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                      allowFullScreen
                      onError={() => setIframeError(true)}
                      onLoad={(e) => {
                        try {
                          const frame = e.currentTarget as HTMLIFrameElement;
                          if (frame.contentDocument !== null) {
                            const t = frame.contentDocument?.title ?? "";
                            if (t.toLowerCase().includes("error") || t === "") setIframeError(true);
                          }
                        } catch { /* cross-origin, normal */ }
                      }}
                    />
                  )}
                </div>
              </Card>

              <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Model allotjat a Autodesk 360. Utilitza el ratolí per orbitar,
                  fer zoom i fer panar el model 3D.
                </span>
              </div>
            </>
          ) : (
            <Card className="border-slate-100 shadow-sm bg-white flex flex-col items-center justify-center p-16 text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                <Box className="h-6 w-6 text-slate-300" />
              </div>
              <div>
                <p className="font-semibold text-slate-500 text-[14px]">
                  {sistemaActiu ? "No hi ha instal·lacions" : "Selecciona una instal·lació"}
                </p>
                <p className="text-[12.5px] text-slate-400 mt-1 leading-relaxed">
                  {sistemaActiu
                    ? modeAdmin
                      ? "Afegeix una instal·lació al panell esquerre."
                      : "Aquest sistema no té instal·lacions configurades."
                    : <>Escull un sistema al panell esquerre i<br />selecciona una instal·lació per veure el model 3D.</>
                  }
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Diàlegs ──────────────────────────────────────────────────────────── */}

      <SistemaFormDialog
        open={sistemaDialeg.open}
        onClose={() => setSistemaDialeg({ open: false, mode: "create" })}
        onSave={handleSaveSistema}
        title={sistemaDialeg.mode === "create" ? "Nou sistema" : "Editar sistema"}
        initial={
          sistemaDialeg.target
            ? {
                nom: sistemaDialeg.target.nom,
                descripcio: sistemaDialeg.target.descripcio ?? "",
                icona: sistemaDialeg.target.icona ?? "🏭",
                color: sistemaDialeg.target.color,
              }
            : undefined
        }
      />

      <InstallacioFormDialog
        open={installacioDialeg.open}
        onClose={() => setInstallacioDialeg({ open: false, mode: "create" })}
        onSave={handleSaveInstallacio}
        title={installacioDialeg.mode === "create" ? "Nova instal·lació" : "Editar instal·lació"}
        sistemaColor={sistemaActiu?.color ?? "#0099A8"}
        initial={
          installacioDialeg.target
            ? {
                nom: installacioDialeg.target.nom,
                descripcio: installacioDialeg.target.descripcio ?? "",
                codiInstallacio: installacioDialeg.target.codiInstallacio ?? "",
                embedUrl: installacioDialeg.target.embedUrl,
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
              Eliminar {deleteDialeg?.type === "sistema" ? "sistema" : "instal·lació"}
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
            <AlertDialogCancel>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => {
                if (!deleteDialeg) return;
                if (deleteDialeg.type === "sistema") handleDeleteSistema(deleteDialeg.id);
                else handleDeleteInstallacio(deleteDialeg.id);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
