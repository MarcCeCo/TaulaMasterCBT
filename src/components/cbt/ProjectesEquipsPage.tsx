// src/components/cbt/ProjectesEquipsPage.tsx
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Archive, ChevronRight, FolderOpen, FolderArchive,
  Plus, Trash2, Tags, CheckCircle2, XCircle, Pencil,
  ArrowLeft, AlertTriangle, Info, Eye, ClipboardCheck, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uid } from "@/lib/storage";
import { useDebouncedLocalStorage } from "@/lib/storage";
import { useDataStore } from "@/lib/dataStore";
import { ProjecteEquipDetailDialog } from "./ProjecteEquipDetailDialog";
import { EquipmentFormDialog } from "./EquipmentFormDialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

// ─── tipus ───────────────────────────────────────────────────────────────────

type ProjectStatus = "actiu" | "arxivat";
type TagStatus = "pendent" | "validat" | "rebutjat";

export interface ProjectTag {
  id: string;
  equipId: string;        // id de l'equip a EquipmentsTable
  codiInstallacio: string; // 5 dígits alfanumèrics
  ccm: string;            // 1 dígit numèric
  funcio: string;         // 2 dígits numèrics
  duplicitat: string;     // 1 dígit alfabètic
  tagComplet: string;     // CODIINSTALLACIO_CODIEQUIP_CCMFUNCIODUPLICITATAT
  status: TagStatus;
  comentari: string;
  fieldValues: Record<string, string>;
  createdAt: number;
}

export interface Projecte {
  id: string;
  nom: string;
  descripcio: string;
  codiProjecte: string;      // format NNNN-N a NNNN-NNNN
  codiInstallacio: string;   // 5 dígits alfanumèrics, comú a tot el projecte
  status: ProjectStatus;
  tags: ProjectTag[];
  createdAt: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildTag(codiInstallacio: string, codiEquip: string, ccm: string, funcio: string, duplicitat: string): string {
  return `${codiInstallacio.toUpperCase()}_${codiEquip.toUpperCase()}_${ccm}${funcio.padStart(2,"0")}${duplicitat.toUpperCase()}`;
}

// Retorna la propera lletra de duplicitat disponible donada una llista de lletres ja usades
function nextDuplicitatDisponible(usades: string[]): string | null {
  const usadesUp = usades.map(l => l.toUpperCase());
  for (let i = 0; i < 26; i++) {
    const lletra = String.fromCharCode(65 + i); // A, B, C...
    if (!usadesUp.includes(lletra)) return lletra;
  }
  return null; // totes 26 lletres usades
}

// Comprova si el tag (sense duplicitat) ja existeix i retorna les duplicitats usades
function duplicitatsUsades(
  tags: ProjectTag[],
  codiInstallacio: string,
  codiEquip: string,
  ccm: string,
  funcio: string,
  excludeTagId?: string
): string[] {
  const prefix = `${codiInstallacio.toUpperCase()}_${codiEquip.toUpperCase()}_${ccm}${funcio.padStart(2,"0")}`;
  return tags
    .filter(t => t.id !== excludeTagId && t.tagComplet.startsWith(prefix) && t.tagComplet.length === prefix.length + 1)
    .map(t => t.duplicitat.toUpperCase());
}

function validateCodiProjecte(codi: string): string | null {
  if (!codi.trim()) return null; // opcional
  if (!/^\d{4}-\d{1,4}$/.test(codi.trim())) return "El codi de projecte ha de tenir el format NNNN-N a NNNN-NNNN (ex: 2024-1 o 2024-1234).";
  return null;
}

function validateTagFields(codiInstallacio: string, ccm: string, funcio: string, duplicitat: string): string | null {
  if (!/^[A-Z0-9]{5}$/i.test(codiInstallacio)) return "El codi d'instal·lació ha de tenir exactament 5 caràcters alfanumèrics.";
  if (!/^\d$/.test(ccm)) return "El CCM ha de ser 1 dígit numèric (0-9).";
  if (!/^\d{1,2}$/.test(funcio) || parseInt(funcio) > 99) return "La funció ha de ser 1-2 dígits numèrics (00-99).";
  if (!/^[A-Z]$/i.test(duplicitat)) return "La duplicitat ha de ser 1 lletra alfabètica.";
  return null;
}

// ─── Badge d'estat del tag ────────────────────────────────────────────────────
function TagStatusBadge({ status }: { status: TagStatus }) {
  if (status === "validat") return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Validat</Badge>;
  if (status === "rebutjat") return <Badge className="bg-red-100 text-red-700 border-0 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rebutjat</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Pendent</Badge>;
}

// ─── Badge d'estat del projecte ───────────────────────────────────────────────
function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  if (status === "arxivat") return <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px]"><FolderArchive className="h-3 w-3 mr-1" />Arxivat</Badge>;
  return <Badge className="bg-[#0099A8]/15 text-[#006E7A] border-0 text-[10px]"><FolderOpen className="h-3 w-3 mr-1" />Actiu</Badge>;
}

// ─── component principal ──────────────────────────────────────────────────────
export function ProjectesEquipsPage() {
  const { canEdit } = useAuth();
  const { equipments, gubimNodes, gubimNodeMap, fieldMap, fields, upsertEquip, isEquipCodeTaken } = useDataStore();

  // Persistència en localStorage
  const [projectes, setProjectes] = useDebouncedLocalStorage<Projecte[]>("cbt_projectes", []);

  // Navegació
  const [projecteActiu, setProjecteActiu] = useState<string | null>(null);
  const [vista, setVista] = useState<"llistat" | "detail">("llistat");

  // Diàlegs
  const [dialogNouProjecte, setDialogNouProjecte] = useState(false);
  const [dialogNouTag, setDialogNouTag] = useState(false);
  const [dialogEditTag, setDialogEditTag] = useState<ProjectTag | null>(null);
  const [dialogValidar, setDialogValidar] = useState<ProjectTag | null>(null);
  const [dialogEliminarProjecte, setDialogEliminarProjecte] = useState<string | null>(null);
  const [dialogArxivar, setDialogArxivar] = useState<string | null>(null);
  const [detallEquip, setDetallEquip] = useState<string | null>(null); // tagId
  const [editEquip, setEditEquip] = useState<string | null>(null);

  // Filtre
  const [filtreStatus, setFiltreStatus] = useState<"tots" | ProjectStatus>("tots");

  // Formularis
  const [nouNom, setNouNom] = useState("");
  const [nouDesc, setNouDesc] = useState("");
  const [nouCodiProjecte, setNouCodiProjecte] = useState("");
  const [nouCodiInstallacio, setNouCodiInstallacio] = useState("");
  const [nouProjecteError, setNouProjecteError] = useState<string | null>(null);
  const [tagCodiInstallacio, setTagCodiInstallacio] = useState("");
  const [tagEquipId, setTagEquipId] = useState("");
  const [tagCcm, setTagCcm] = useState("");
  const [tagFuncio, setTagFuncio] = useState("");
  const [tagDuplicitat, setTagDuplicitat] = useState("A");
  const [tagComentari, setTagComentari] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [equipSearch, setEquipSearch] = useState("");

  // Derived
  const projecteFiltrats = useMemo(() =>
    projectes.filter(p => filtreStatus === "tots" || p.status === filtreStatus)
      .sort((a, b) => b.createdAt - a.createdAt),
    [projectes, filtreStatus]
  );

  const projecteSeleccionat = useMemo(() =>
    projectes.find(p => p.id === projecteActiu) ?? null,
    [projectes, projecteActiu]
  );

  const equipMap = useMemo(() => new Map(equipments.map(e => [e.id, e])), [equipments]);

  // Equips disponibles per selector: només els que tenen codi, ordenats
  const equipmentsAmbCodi = useMemo(() =>
    equipments
      .filter(e => e.equipCode && e.equipCode.trim() !== "")
      .sort((a, b) => a.equipCode.localeCompare(b.equipCode)),
    [equipments]
  );

  const detallTag = detallEquip ? projecteSeleccionat?.tags.find(t => t.id === detallEquip) ?? null : null;
  const detallEquipObj = detallTag ? equipMap.get(detallTag.equipId) ?? null : null;
  const editEquipObj = editEquip ? equipMap.get(editEquip) ?? null : null; // usat només des de la taula master

  // ─── accions projectes ──────────────────────────────────────────────────────
  function crearProjecte() {
    if (!nouNom.trim()) return;
    const errCodi = validateCodiProjecte(nouCodiProjecte);
    if (errCodi) { setNouProjecteError(errCodi); return; }
    if (nouCodiInstallacio && !/^[A-Z0-9]{5}$/i.test(nouCodiInstallacio)) {
      setNouProjecteError("El codi d'instal·lació ha de tenir exactament 5 caràcters alfanumèrics.");
      return;
    }
    const nou: Projecte = {
      id: uid(),
      nom: nouNom.trim(),
      descripcio: nouDesc.trim(),
      codiProjecte: nouCodiProjecte.trim(),
      codiInstallacio: nouCodiInstallacio.toUpperCase().trim(),
      status: "actiu",
      tags: [],
      createdAt: Date.now(),
    };
    setProjectes(prev => [nou, ...prev]);
    setDialogNouProjecte(false);
    setNouNom(""); setNouDesc(""); setNouCodiProjecte(""); setNouCodiInstallacio(""); setNouProjecteError(null);
    toast.success("Projecte creat");
  }

  function arxivarProjecte(id: string) {
    setProjectes(prev => prev.map(p => p.id === id ? { ...p, status: p.status === "arxivat" ? "actiu" : "arxivat" } : p));
    toast.success("Estat del projecte actualitzat");
  }

  function eliminarProjecte(id: string) {
    setProjectes(prev => prev.filter(p => p.id !== id));
    if (projecteActiu === id) { setProjecteActiu(null); setVista("llistat"); }
    toast.success("Projecte eliminat");
  }

  // ─── accions tags ───────────────────────────────────────────────────────────
  function obrirNouTag() {
    const projecteActual = projectes.find(p => p.id === projecteActiu);
    setTagCodiInstallacio(projecteActual?.codiInstallacio ?? "");
    setTagEquipId(""); setTagCcm("");
    setTagFuncio(""); setTagDuplicitat("A"); setTagComentari(""); setTagError(null);
    setDialogNouTag(true);
  }

  function guardarNouTag() {
    const equip = equipMap.get(tagEquipId);
    if (!equip) { setTagError("Selecciona un equip de la Taula Master."); return; }
    const err = validateTagFields(tagCodiInstallacio, tagCcm, tagFuncio, tagDuplicitat);
    if (err) { setTagError(err); return; }
    // Comprova duplicitat de TAG complet
    const projecteActual = projectes.find(p => p.id === projecteActiu);
    const tagCandidat = buildTag(tagCodiInstallacio, equip.equipCode, tagCcm, tagFuncio, tagDuplicitat);
    if (projecteActual?.tags.some(t => t.tagComplet === tagCandidat)) {
      setTagError(`El TAG "${tagCandidat}" ja existeix en aquest projecte.`);
      return;
    }

    const tag: ProjectTag = {
      id: uid(),
      equipId: tagEquipId,
      codiInstallacio: tagCodiInstallacio.toUpperCase(),
      ccm: tagCcm,
      funcio: tagFuncio.padStart(2, "0"),
      duplicitat: tagDuplicitat.toUpperCase(),
      tagComplet: tagCandidat,
      status: "pendent",
      comentari: tagComentari,
      fieldValues: {},
      createdAt: Date.now(),
    };
    setProjectes(prev => prev.map(p => p.id === projecteActiu ? { ...p, tags: [...p.tags, tag] } : p));
    setDialogNouTag(false);
    setEquipSearch("");
    toast.success("Tag creat");
  }

  function guardarEditTag() {
    if (!dialogEditTag) return;
    const equip = equipMap.get(dialogEditTag.equipId);
    if (!equip) return;
    const err = validateTagFields(tagCodiInstallacio, tagCcm, tagFuncio, tagDuplicitat);
    if (err) { setTagError(err); return; }
    const tagCandidatEdit = buildTag(tagCodiInstallacio, equip.equipCode, tagCcm, tagFuncio, tagDuplicitat);
    const projecteActual2 = projectes.find(p => p.id === projecteActiu);
    if (projecteActual2?.tags.some(t => t.id !== dialogEditTag.id && t.tagComplet === tagCandidatEdit)) {
      setTagError(`El TAG "${tagCandidatEdit}" ja existeix en aquest projecte.`);
      return;
    }
    const updated: ProjectTag = {
      ...dialogEditTag,
      codiInstallacio: tagCodiInstallacio.toUpperCase(),
      ccm: tagCcm,
      funcio: tagFuncio.padStart(2, "0"),
      duplicitat: tagDuplicitat.toUpperCase(),
      tagComplet: tagCandidatEdit,
      comentari: tagComentari,
    };
    setProjectes(prev => prev.map(p => p.id === projecteActiu
      ? { ...p, tags: p.tags.map(t => t.id === updated.id ? updated : t) }
      : p
    ));
    setDialogEditTag(null);
    toast.success("Tag actualitzat");
  }

  function eliminarTag(tagId: string) {
    setProjectes(prev => prev.map(p => p.id === projecteActiu
      ? { ...p, tags: p.tags.filter(t => t.id !== tagId) }
      : p
    ));
    toast.success("Tag eliminat");
  }

  function validarTag(tag: ProjectTag, nouStatus: TagStatus, comentari: string) {
    setProjectes(prev => prev.map(p => p.id === projecteActiu
      ? { ...p, tags: p.tags.map(t => t.id === tag.id ? { ...t, status: nouStatus, comentari } : t) }
      : p
    ));
    setDialogValidar(null);
    toast.success(nouStatus === "validat" ? "Tag validat ✓" : "Tag rebutjat");
  }

  function saveFieldValues(tagId: string, values: Record<string, string>) {
    setProjectes(prev => prev.map(p => p.id === projecteActiu
      ? { ...p, tags: p.tags.map(t => t.id === tagId ? { ...t, fieldValues: values } : t) }
      : p
    ));
  }

  function obrirEditTag(tag: ProjectTag) {
    setTagCodiInstallacio(tag.codiInstallacio);
    setTagEquipId(tag.equipId);
    setTagCcm(tag.ccm);
    setTagFuncio(tag.funcio);
    setTagDuplicitat(tag.duplicitat);
    setTagComentari(tag.comentari);
    setTagError(null);
    setDialogEditTag(tag);
  }

  // ─── preview tag en temps real + suggeriment duplicitat ──────────────────
  const previewEquip = tagEquipId ? equipMap.get(tagEquipId) : null;
  const previewTag = previewEquip && tagCodiInstallacio.length === 5 && tagCcm && tagFuncio && tagDuplicitat
    ? buildTag(tagCodiInstallacio, previewEquip.equipCode, tagCcm, tagFuncio, tagDuplicitat)
    : null;

  // Si el TAG fins a funció coincideix amb un existent, calcula la propera duplicitat disponible
  const suggerimentDuplicitatInfo = useMemo(() => {
    const projecteActual = projectes.find(p => p.id === projecteActiu);
    if (!projecteActual || !previewEquip || tagCodiInstallacio.length !== 5 || !tagCcm || !tagFuncio) return null;
    const usades = duplicitatsUsades(
      projecteActual.tags, tagCodiInstallacio, previewEquip.equipCode, tagCcm, tagFuncio,
      dialogEditTag?.id
    );
    if (usades.length === 0) return null;
    const propera = nextDuplicitatDisponible(usades);
    return { usades, propera };
  }, [projectes, projecteActiu, previewEquip, tagCodiInstallacio, tagCcm, tagFuncio, dialogEditTag]);

  // Equips filtrats per cerca
  const equipsFiltrats = useMemo(() => {
    const q = equipSearch.toLowerCase().trim();
    if (!q) return equipmentsAmbCodi;
    return equipmentsAmbCodi.filter(e =>
      e.equipCode.toLowerCase().includes(q) || e.equipName.toLowerCase().includes(q) || (e.tableName && e.tableName.toLowerCase().includes(q))
    );
  }, [equipmentsAmbCodi, equipSearch]);

  // ─── render ─────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Capçalera */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {vista === "detail" && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" onClick={() => { setVista("llistat"); setProjecteActiu(null); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                {vista === "llistat" ? "Llistat d'equips per projectes" : projecteSeleccionat?.nom ?? "Projecte"}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {vista === "llistat"
                  ? "Gestió de projectes i tags d'equips"
                  : `Tags i equips del projecte · ${projecteSeleccionat?.descripcio || "sense descripció"}`}
              </p>
            </div>
          </div>
          {vista === "llistat" && canEdit && (
            <Button size="sm" className="bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => { setNouNom(""); setNouDesc(""); setDialogNouProjecte(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Nou projecte
            </Button>
          )}
          {vista === "detail" && projecteSeleccionat?.status === "actiu" && canEdit && (
            <Button size="sm" className="bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={obrirNouTag}>
              <Tags className="h-3.5 w-3.5 mr-1.5" /> Nou TAG
            </Button>
          )}
        </div>

        {/* ── VISTA: LLISTAT DE PROJECTES ─────────────────────────────────── */}
        {vista === "llistat" && (
          <>
            {/* Filtre */}
            <div className="flex gap-2 flex-wrap">
              {(["tots", "actiu", "arxivat"] as const).map(f => (
                <button key={f} onClick={() => setFiltreStatus(f)}
                  className={cn("text-xs px-3 py-1.5 rounded-full border transition-all",
                    filtreStatus === f
                      ? "bg-[#0099A8] text-white border-[#0099A8]"
                      : "bg-white text-slate-600 border-slate-200 hover:border-[#0099A8]/40"
                  )}>
                  {f === "tots" ? "Tots" : f === "actiu" ? "Actius" : "Arxivats"}
                </button>
              ))}
              <span className="text-xs text-slate-400 self-center ml-2">{projecteFiltrats.length} projecte{projecteFiltrats.length !== 1 ? "s" : ""}</span>
            </div>

            {projecteFiltrats.length === 0 ? (
              <Card className="p-12 border-0 shadow-sm bg-white flex flex-col items-center gap-3 text-center">
                <FolderOpen className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Cap projecte trobat</p>
                <p className="text-xs text-slate-400">Crea un nou projecte per començar a gestionar tags d'equips.</p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {projecteFiltrats.map(p => {
                  const total = p.tags.length;
                  const validats = p.tags.filter(t => t.status === "validat").length;
                  const pendents = p.tags.filter(t => t.status === "pendent").length;
                  const rebutjats = p.tags.filter(t => t.status === "rebutjat").length;
                  const pct = total > 0 ? Math.round((validats / total) * 100) : 0;

                  return (
                    <Card key={p.id} className={cn("p-4 border-0 shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer group", p.status === "arxivat" && "opacity-70")}
                      onClick={() => { setProjecteActiu(p.id); setVista("detail"); }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <ProjectStatusBadge status={p.status} />
                          </div>
                          <p className="font-semibold text-slate-700 truncate">{p.nom}</p>
                          {p.codiProjecte && <p className="text-[10px] font-mono text-[#006E7A] mt-0.5">#{p.codiProjecte}</p>}
                          {p.descripcio && <p className="text-xs text-slate-400 truncate mt-0.5">{p.descripcio}</p>}
                          {p.codiInstallacio && <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Instal·lació: {p.codiInstallacio}</p>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#0099A8] shrink-0 mt-1 transition-colors" />
                      </div>

                      {/* Barra de progrés */}
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                          <span>{total} tags</span>
                          <span>{pct}% validats</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex gap-3 mt-1.5 text-[10px] text-slate-400">
                          {validats > 0 && <span className="text-emerald-600">✓ {validats} validats</span>}
                          {pendents > 0 && <span className="text-amber-600">◐ {pendents} pendents</span>}
                          {rebutjats > 0 && <span className="text-red-500">✗ {rebutjats} rebutjats</span>}
                        </div>
                      </div>

                      {/* Accions ràpides */}
                      {canEdit && (
                        <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                          <Button variant="outline" size="sm" className="h-7 text-[11px] flex-1 border-slate-200"
                            onClick={() => setDialogArxivar(p.id)}>
                            <Archive className="h-3 w-3 mr-1" />{p.status === "arxivat" ? "Desarxivar" : "Arxivar"}
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-[11px] border-red-200 text-red-500 hover:bg-red-50"
                            onClick={() => setDialogEliminarProjecte(p.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── VISTA: DETALL PROJECTE ──────────────────────────────────────── */}
        {vista === "detail" && projecteSeleccionat && (
          <div className="space-y-4">
            {/* Resum ràpid */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total tags", value: projecteSeleccionat.tags.length, color: "text-slate-700" },
                { label: "Validats", value: projecteSeleccionat.tags.filter(t=>t.status==="validat").length, color: "text-emerald-600" },
                { label: "Pendents / Rebutjats", value: `${projecteSeleccionat.tags.filter(t=>t.status==="pendent").length} / ${projecteSeleccionat.tags.filter(t=>t.status==="rebutjat").length}`, color: "text-amber-600" },
              ].map(s => (
                <Card key={s.label} className="p-3 border-0 shadow-sm bg-white text-center">
                  <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
                </Card>
              ))}
            </div>

            {/* Taula de tags */}
            {projecteSeleccionat.tags.length === 0 ? (
              <Card className="p-10 border-0 shadow-sm bg-white flex flex-col items-center gap-2 text-center">
                <Tags className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Sense tags</p>
                <p className="text-xs text-slate-400">Afegeix el primer tag d'equip a aquest projecte.</p>
              </Card>
            ) : (
              <Card className="border-0 shadow-sm bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50/60">
                        <th className="text-left p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">TAG complet</th>
                        <th className="text-left p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Equip</th>
                        <th className="text-left p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estat</th>
                        <th className="text-left p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Comentari</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {projecteSeleccionat.tags.map(tag => {
                        const equip = equipMap.get(tag.equipId);
                        return (
                          <tr key={tag.id} className="border-t hover:bg-muted/30">
                            <td className="p-3">
                              <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded inline-block text-slate-700">
                                {tag.tagComplet}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help flex items-center gap-1"><Info className="h-3 w-3" />Estructura</span>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs space-y-0.5 max-w-xs">
                                    <p><b>Codi instal·lació:</b> {tag.codiInstallacio}</p>
                                    <p><b>Codi equip:</b> {equip?.equipCode ?? "—"}</p>
                                    <p><b>CCM:</b> {tag.ccm}</p>
                                    <p><b>Funció:</b> {tag.funcio}</p>
                                    <p><b>Duplicitat:</b> {tag.duplicitat}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                            <td className="p-3">
                              {equip ? (
                                <button
                                  className="text-left group/eq hover:underline underline-offset-2"
                                  onClick={() => setDetallEquip(tag.id)}
                                >
                                  <p className="font-medium text-[#006E7A] group-hover/eq:text-[#0099A8] text-xs transition-colors">{equip.equipName}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{equip.equipCode}</p>
                                </button>
                              ) : (
                                <span className="flex items-center gap-1 text-amber-600 text-xs"><AlertTriangle className="h-3.5 w-3.5" />Equip no trobat</span>
                              )}
                            </td>
                            <td className="p-3"><TagStatusBadge status={tag.status} /></td>
                            <td className="p-3 text-xs text-slate-500 max-w-[180px] truncate">{tag.comentari || "—"}</td>
                            <td className="p-3">
                              <div className="flex gap-1 justify-end">
                                {/* Veure detall equip */}
                                {equip && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-[#0099A8]"
                                        onClick={() => setDetallEquip(tag.id)}>
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Veure / omplir camps de l'equip</TooltipContent>
                                  </Tooltip>
                                )}
                                {/* Validar */}
                                {canEdit && tag.status !== "validat" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-emerald-600"
                                        onClick={() => { setTagComentari(tag.comentari); setDialogValidar(tag); }}>
                                        <ClipboardCheck className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Validar / Rebutjar tag</TooltipContent>
                                  </Tooltip>
                                )}
                                {/* Editar */}
                                {canEdit && projecteSeleccionat.status === "actiu" && tag.status !== "validat" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700"
                                        onClick={() => obrirEditTag(tag)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Editar tag</TooltipContent>
                                  </Tooltip>
                                )}
                                {/* Eliminar */}
                                {canEdit && projecteSeleccionat.status === "actiu" && tag.status !== "validat" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500"
                                        onClick={() => eliminarTag(tag.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Eliminar tag</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── DIÀLEG: NOU PROJECTE ────────────────────────────────────────── */}
        <Dialog open={dialogNouProjecte} onOpenChange={(b) => { setDialogNouProjecte(b); if (!b) setNouProjecteError(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nou projecte</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs font-medium">Nom del projecte *</Label>
                <Input className="mt-1" placeholder="Nom del projecte" value={nouNom} onChange={e => setNouNom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-medium">Descripció</Label>
                <Input className="mt-1" placeholder="Descripció opcional" value={nouDesc} onChange={e => setNouDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Codi de projecte <span className="text-slate-400 font-normal">(NNNN-N)</span></Label>
                  <Input
                    className="mt-1 font-mono"
                    placeholder="2024-1"
                    value={nouCodiProjecte}
                    onChange={e => { setNouCodiProjecte(e.target.value.replace(/[^0-9-]/g, "")); setNouProjecteError(null); }}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Codi instal·lació <span className="text-slate-400 font-normal">(5 car.)</span></Label>
                  <Input
                    className="mt-1 font-mono uppercase"
                    placeholder="XXXXX"
                    maxLength={5}
                    value={nouCodiInstallacio}
                    onChange={e => { setNouCodiInstallacio(e.target.value.toUpperCase()); setNouProjecteError(null); }}
                  />
                </div>
              </div>
              {nouProjecteError && (
                <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{nouProjecteError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogNouProjecte(false)}>Cancel·la</Button>
              <Button className="bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={crearProjecte} disabled={!nouNom.trim()}>Crear projecte</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── DIÀLEG: NOU / EDITAR TAG ────────────────────────────────────── */}
        {(dialogNouTag || dialogEditTag) && (
          <Dialog open onOpenChange={() => { setDialogNouTag(false); setDialogEditTag(null); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{dialogEditTag ? "Editar TAG" : "Nou TAG d'equip"}</DialogTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Estructura: <span className="font-mono bg-slate-100 px-1 rounded">CODIINSTALLACIO_CODIEQUIP_CCMFUNCIODUPLICITATAT</span>
                </p>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Equip */}
                {!dialogEditTag && (
                  <div>
                    <Label className="text-xs font-medium">Equip de la Taula Master *</Label>
                    <div className="mt-1 border rounded-md overflow-hidden">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b bg-slate-50">
                        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <input
                          className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400"
                          placeholder="Cerca per codi o nom..."
                          value={equipSearch}
                          onChange={e => setEquipSearch(e.target.value)}
                        />
                        {equipSearch && (
                          <button onClick={() => setEquipSearch("")} className="text-slate-400 hover:text-slate-600">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-44 overflow-y-auto">
                        {equipsFiltrats.length === 0 ? (
                          <p className="text-xs text-slate-400 px-3 py-2">Cap equip trobat</p>
                        ) : (
                          equipsFiltrats.map(e => (
                            <button key={e.id} onClick={() => setTagEquipId(e.id)}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors",
                                tagEquipId === e.id ? "bg-[#0099A8]/10 text-[#006E7A] font-medium" : "text-slate-700"
                              )}>
                              <span className="font-mono shrink-0">{e.equipCode}</span>
                              <span className="text-slate-500 truncate">{e.tableName || e.equipName}</span>
                              {tagEquipId === e.id && <CheckCircle2 className="h-3.5 w-3.5 text-[#0099A8] ml-auto shrink-0" />}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {dialogEditTag && (
                  <div className="p-2 bg-slate-50 rounded text-xs">
                    <span className="text-slate-500">Equip: </span>
                    <span className="font-mono font-medium">{equipMap.get(dialogEditTag.equipId)?.equipCode}</span>
                    <span className="text-slate-500 ml-1">{equipMap.get(dialogEditTag.equipId)?.tableName || equipMap.get(dialogEditTag.equipId)?.equipName}</span>
                  </div>
                )}

                {/* Camps del TAG */}
                {/* Codi instal·lació del projecte (informatiu si ja està fixat) */}
                {projecteSeleccionat?.codiInstallacio ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs flex items-center gap-2">
                    <span className="text-slate-500">Instal·lació del projecte:</span>
                    <span className="font-mono font-semibold text-slate-700">{projecteSeleccionat.codiInstallacio}</span>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium">
                      Codi instal·lació * <span className="text-slate-400 font-normal">(5 car. alfanum.)</span>
                    </Label>
                    <Input
                      className="mt-1 font-mono uppercase"
                      maxLength={5}
                      placeholder="XXXXX"
                      value={tagCodiInstallacio}
                      readOnly={!!projecteSeleccionat?.codiInstallacio}
                      onChange={e => { if (!projecteSeleccionat?.codiInstallacio) setTagCodiInstallacio(e.target.value.toUpperCase()); }}
                      title={projecteSeleccionat?.codiInstallacio ? "Fixat a la configuració del projecte" : undefined}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">CCM * <span className="text-slate-400 font-normal">(1 dígit)</span></Label>
                    <Input className="mt-1 font-mono" maxLength={1} placeholder="0" value={tagCcm} onChange={e => setTagCcm(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Funció * <span className="text-slate-400 font-normal">(2 dígits)</span></Label>
                    <Input className="mt-1 font-mono" maxLength={2} placeholder="01" value={tagFuncio} onChange={e => setTagFuncio(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Duplicitat * <span className="text-slate-400 font-normal">(1 lletra)</span></Label>
                    <Input className="mt-1 font-mono uppercase" maxLength={1} placeholder="A" value={tagDuplicitat} onChange={e => setTagDuplicitat(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())} />
                  </div>
                </div>

                {/* Preview tag */}
                {previewTag && (
                  <div className="p-2.5 bg-[#0099A8]/8 border border-[#0099A8]/20 rounded-lg">
                    <p className="text-[10px] text-[#006E7A] font-medium uppercase tracking-wider mb-1">Preview TAG</p>
                    <p className="font-mono text-sm font-bold text-slate-700">{previewTag}</p>
                  </div>
                )}
                {suggerimentDuplicitatInfo && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
                    <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Duplicitat detectada
                    </p>
                    <p className="text-xs text-amber-700">
                      Ja existeix un TAG amb el mateix codi fins a funció. Lletres usades:{" "}
                      <span className="font-mono font-bold">{suggerimentDuplicitatInfo.usades.join(", ")}</span>
                    </p>
                    {suggerimentDuplicitatInfo.propera && (
                      <button
                        type="button"
                        onClick={() => setTagDuplicitat(suggerimentDuplicitatInfo.propera!)}
                        className="text-xs font-semibold text-[#006E7A] underline underline-offset-2 hover:text-[#0099A8]"
                      >
                        Usar propera disponible: <span className="font-mono">{suggerimentDuplicitatInfo.propera}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Comentari */}
                <div>
                  <Label className="text-xs font-medium">Comentari</Label>
                  <Input className="mt-1" placeholder="Comentari opcional" value={tagComentari} onChange={e => setTagComentari(e.target.value)} />
                </div>

                {tagError && (
                  <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{tagError}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogNouTag(false); setDialogEditTag(null); }}>Cancel·la</Button>
                <Button className="bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={dialogEditTag ? guardarEditTag : guardarNouTag}>
                  {dialogEditTag ? "Guardar canvis" : "Crear TAG"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* ── DIÀLEG: VALIDAR TAG ─────────────────────────────────────────── */}
        {dialogValidar && (
          <Dialog open onOpenChange={() => setDialogValidar(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Validar TAG</DialogTitle>
                <p className="font-mono text-sm bg-slate-100 px-2 py-1.5 rounded mt-2">{dialogValidar.tagComplet}</p>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <div>
                  <Label className="text-xs font-medium">Comentari de revisió</Label>
                  <Input className="mt-1" placeholder="Comentari..." value={tagComentari} onChange={e => setTagComentari(e.target.value)} />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDialogValidar(null)}>Cancel·la</Button>
                <Button className="bg-red-500 hover:bg-red-600 text-white" onClick={() => validarTag(dialogValidar, "rebutjat", tagComentari)}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />Rebutjar
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => validarTag(dialogValidar, "validat", tagComentari)}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Validar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* ── DIÀLEG: ARXIVAR ─────────────────────────────────────────────── */}
        <AlertDialog open={!!dialogArxivar} onOpenChange={() => setDialogArxivar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {projectes.find(p=>p.id===dialogArxivar)?.status === "arxivat" ? "Desarxivar projecte?" : "Arxivar projecte?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {projectes.find(p=>p.id===dialogArxivar)?.status === "arxivat"
                  ? "El projecte tornarà a estar actiu i es podran afegir nous tags."
                  : "El projecte es marcarà com a arxivat. No es podran afegir nous tags fins que es desarxivi."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel·la</AlertDialogCancel>
              <AlertDialogAction className="bg-[#0099A8] hover:bg-[#006E7A]" onClick={() => { arxivarProjecte(dialogArxivar!); setDialogArxivar(null); }}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── DIÀLEG: ELIMINAR PROJECTE ────────────────────────────────────── */}
        <AlertDialog open={!!dialogEliminarProjecte} onOpenChange={() => setDialogEliminarProjecte(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar projecte?</AlertDialogTitle>
              <AlertDialogDescription>
                S'eliminaran el projecte i tots els seus tags. Aquesta acció no es pot desfer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel·la</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { eliminarProjecte(dialogEliminarProjecte!); setDialogEliminarProjecte(null); }}>Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── DIÀLEG: DETALL EQUIP ────────────────────────────────────────── */}
        <ProjecteEquipDetailDialog
          open={!!detallEquip}
          onOpenChange={(b) => { if (!b) setDetallEquip(null); }}
          equipment={detallEquipObj}
          nodeMap={gubimNodeMap}
          fieldMap={fieldMap}
          fields={fields}
          onEdit={() => {
            if (detallTag) { obrirEditTag(detallTag); }
            setDetallEquip(null);
          }}
          canEditValues={detallTag?.status === "validat"}
          fieldValues={detallTag?.fieldValues ?? {}}
          onSaveValues={(vals) => detallTag && saveFieldValues(detallTag.id, vals)}
        />

        {/* ── DIÀLEG: EDITAR EQUIP (camps específics) ─────────────────────── */}
        <EquipmentFormDialog
          open={!!editEquip}
          onOpenChange={(b) => { if (!b) setEditEquip(null); }}
          editing={editEquipObj}
          nodes={gubimNodes}
          nodeMap={gubimNodeMap}
          fields={fields}
          fieldMap={fieldMap}
          onSubmit={async (data) => { await upsertEquip(data); setEditEquip(null); toast.success("Camps de l'equip guardats"); }}
          isCodeTaken={isEquipCodeTaken}
          allEquipments={equipments}
        />
      </div>
    </TooltipProvider>
  );
}
