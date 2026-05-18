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
  ArrowLeft, AlertTriangle, Info, Eye, ClipboardCheck, Search, Users, Lock, LockOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/lib/dataStore";
import { useProjectes } from "@/lib/useProjectes";
import type { ProjectTag, Projecte, ProjectStatus, TagStatus, InstallacioItem } from "@/lib/useProjectes";
import { ProjecteEquipDetailDialog } from "./ProjecteEquipDetailDialog";
import { RosmimanEquipsPage } from "./RosmimanEquipsPage";
import { EquipmentFormDialog } from "./EquipmentFormDialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import type { UserProfile } from "@/lib/auth";

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

// Retorna la primera duplicitat disponible que no existeix ni al projecte ni a Rosmiman
function primeraDuplicitatLliure(
  codiInstallacio: string,
  codiEquip: string,
  ccm: string,
  funcio: string,
  projecteTags: ProjectTag[],
  rosmimanEquips: { tag: string }[],
  excludeTagId?: string,
): string | null {
  for (let i = 0; i < 26; i++) {
    const lletra = String.fromCharCode(65 + i);
    const candidat = buildTag(codiInstallacio, codiEquip, ccm, funcio, lletra);
    const alProjecte = projecteTags.some(t => t.id !== excludeTagId && t.tagComplet === candidat);
    const aRosmiman  = rosmimanEquips.some(r => r.tag === candidat);
    if (!alProjecte && !aRosmiman) return lletra;
  }
  return null;
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
  if (!codi.trim()) return "El codi de projecte és obligatori.";
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

interface ProjectesEquipsPageProps {
  initialTab?: "projectes" | "rosmiman";
  onTabChange?: (tab: "projectes" | "rosmiman") => void;
}

export function ProjectesEquipsPage({ initialTab = "projectes", onTabChange }: ProjectesEquipsPageProps) {
  const { canEditView, canSeeView, isAdmin, profile: myProfile, getToken } = useAuth();
  const canEdit = canEditView("projectes");
  const canSeeRosmiman = canSeeView("rosmiman");
  const [tabActiva, setTabActivaInternal] = useState<"projectes" | "rosmiman">(initialTab);
  const [rosmimanOpen, setRosmimanOpen] = useState(initialTab === "rosmiman");

  const setTabActiva = (tab: "projectes" | "rosmiman") => {
    setTabActivaInternal(tab);
    onTabChange?.(tab);
  };
  const { equipments, gubimNodes, gubimNodeMap, fieldMap, fields, upsertEquip, isEquipCodeTaken } = useDataStore();

  const { projectes, loading: projectesLoading, error: projectesError, retry: projectesRetry,
    createProjecte, updateProjecte, updateProjecteUsers, deleteProjecte, toggleArxivar,
    addTag, updateTag, deleteTag,
    rosmimanEquips, importRosmimanEquips,
  } = useProjectes();

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
  const [dialogEliminarTagValidat, setDialogEliminarTagValidat] = useState<string | null>(null); // tagId
  const [detallEquip, setDetallEquip] = useState<string | null>(null); // tagId
  const [editEquip, setEditEquip] = useState<string | null>(null);

  // Diàleg assignació usuaris (només admins)
  const [dialogUsuaris, setDialogUsuaris] = useState<string | null>(null); // id projecte
  const [allUsers, setAllUsers]           = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers]   = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Filtre
  const [filtreStatus, setFiltreStatus] = useState<"tots" | ProjectStatus>("tots");

  // Formularis
  const [nouNom, setNouNom] = useState("");
  const [nouDesc, setNouDesc] = useState("");
  const [nouCodiProjecte, setNouCodiProjecte] = useState("");
  const [nouCodisInstallacio, setNouCodisInstallacio] = useState<InstallacioItem[]>([{ codi: "", nom: "" }]);
  const [nouProjecteError, setNouProjecteError] = useState<string | null>(null);

  // Edició projecte existent
  const [dialogEditProjecte, setDialogEditProjecte] = useState<string | null>(null); // id del projecte
  const [editNom, setEditNom] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCodiProjecte, setEditCodiProjecte] = useState("");
  const [editCodisInstallacio, setEditCodisInstallacio] = useState<InstallacioItem[]>([{ codi: "", nom: "" }]);
  const [editProjecteError, setEditProjecteError] = useState<string | null>(null);
  // Advertència canvi codi instal·lació quan el projecte té tags
  const [dialogCanviInstallacio, setDialogCanviInstallacio] = useState<{
    nouCodi: string; codiAntic: string;
    pendingData: { nom: string; descripcio: string; codiProjecte: string; codisInstallacio: string[] };
  } | null>(null);
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
    projectes
      .filter(p => filtreStatus === "tots" || p.status === filtreStatus)
      .filter(p => {
        // Admins veuen tots els projectes
        if (isAdmin) return true;
        // Si no hi ha llista blanca, accés obert
        if (!p.allowedUsers) return true;
        // Si hi ha llista blanca, cal estar-hi
        return myProfile ? p.allowedUsers.includes(myProfile.id) : false;
      })
      .sort((a, b) => b.createdAt - a.createdAt),
    [projectes, filtreStatus, isAdmin, myProfile]
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
  async function crearProjecte() {
    if (!nouNom.trim()) return;
    const errCodi = validateCodiProjecte(nouCodiProjecte);
    if (errCodi) { setNouProjecteError(errCodi); return; }
    const codisNets: InstallacioItem[] = nouCodisInstallacio
      .map(i => ({ codi: i.codi.toUpperCase().trim(), nom: i.nom?.trim() ?? "" }))
      .filter(i => i.codi);
    if (codisNets.length === 0) {
      setNouProjecteError("Cal almenys un codi d'instal·lació.");
      return;
    }
    for (const i of codisNets) {
      if (!/^[A-Z0-9]{5}$/i.test(i.codi)) {
        setNouProjecteError(`El codi "${i.codi}" ha de tenir exactament 5 caràcters alfanumèrics.`);
        return;
      }
    }
    try {
      await createProjecte({
        nom: nouNom.trim(),
        descripcio: nouDesc.trim(),
        codiProjecte: nouCodiProjecte.trim(),
        codisInstallacio: codisNets,
        codiInstallacio: codisNets[0].codi,
        status: "actiu",
      });
      setDialogNouProjecte(false);
      setNouNom(""); setNouDesc(""); setNouCodiProjecte(""); setNouCodisInstallacio([{ codi: "", nom: "" }]); setNouProjecteError(null);
      toast.success("Projecte creat");
    } catch (e: any) {
      setNouProjecteError(e?.message ?? "Error en crear el projecte.");
    }
  }

  // ─── assignació usuaris (només admins) ─────────────────────────────────────
  const obrirDialogUsuaris = async (id: string) => {
    const p = projectes.find(px => px.id === id);
    if (!p) return;
    setSelectedUsers(p.allowedUsers ?? []);
    setDialogUsuaris(id);
    setLoadingUsers(true);
    try {
      // Usem /api/list-users (service role) per llegir tots els usuaris,
      // igual que UserManagerPage — el client supabase (anon key) queda
      // bloquejat per RLS i només retorna el perfil propi.
      const token = getToken();
      const res = await fetch("/api/list-users", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const json = await res.json();
        setAllUsers(json.users ?? []);
      } else {
        toast.error("Error carregant usuaris");
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const guardarUsuaris = async () => {
    if (!dialogUsuaris) return;
    // null = sense restriccions; array buit = ningú (excepte admins)
    const value = selectedUsers.length === 0 ? null : selectedUsers;
    await updateProjecteUsers(dialogUsuaris, value);
    toast.success("Permisos del projecte actualitzats");
    setDialogUsuaris(null);
  };

  function obrirEditProjecte(id: string) {
    const p = projectes.find(pr => pr.id === id);
    if (!p) return;
    setEditNom(p.nom);
    setEditDesc(p.descripcio);
    setEditCodiProjecte(p.codiProjecte);
    setEditCodisInstallacio(p.codisInstallacio.length > 0 ? p.codisInstallacio.map(i => ({ ...i })) : [{ codi: "", nom: "" }]);
    setEditProjecteError(null);
    setDialogEditProjecte(id);
  }

  async function guardarEditProjecteReal(
    data: { nom: string; descripcio: string; codiProjecte: string; codisInstallacio: string[] },
    actualitzarTags: boolean
  ) {
    try {
      await updateProjecte(dialogEditProjecte!, data);
      if (actualitzarTags) {
        const projecteActual = projectes.find(p => p.id === dialogEditProjecte);
        if (projecteActual) {
          for (const tag of projecteActual.tags) {
            const nouTagComplet = buildTag(data.codisInstallacio[0] ?? "", tag.tagComplet.split("_")[1] ?? "", tag.ccm, tag.funcio, tag.duplicitat);
            await updateTag(dialogEditProjecte!, tag.id, {
              codiInstallacio: data.codisInstallacio[0] ?? "",
              tagComplet: nouTagComplet,
              status: "pendent",
            });
          }
        }
      }
      setDialogEditProjecte(null);
      setDialogCanviInstallacio(null);
      toast.success(actualitzarTags ? "Projecte i tags actualitzats — els tags han tornat a estat pendent" : "Projecte actualitzat");
    } catch (e: any) {
      setEditProjecteError(e?.message ?? "Error en actualitzar el projecte.");
    }
  }

  async function guardarEditProjecte() {
    if (!editNom.trim()) { setEditProjecteError("El nom és obligatori."); return; }
    const errCodi = validateCodiProjecte(editCodiProjecte);
    if (errCodi) { setEditProjecteError(errCodi); return; }
    const codisNets: InstallacioItem[] = editCodisInstallacio
      .map(i => ({ codi: i.codi.toUpperCase().trim(), nom: i.nom?.trim() ?? "" }))
      .filter(i => i.codi);
    if (codisNets.length === 0) { setEditProjecteError("Cal almenys un codi d'instal·lació."); return; }
    for (const i of codisNets) {
      if (!/^[A-Z0-9]{5}$/i.test(i.codi)) { setEditProjecteError(`El codi "${i.codi}" ha de tenir exactament 5 caràcters alfanumèrics.`); return; }
    }

    const projecteActual = projectes.find(pr => pr.id === dialogEditProjecte);
    const codiAntic = projecteActual?.codisInstallacio[0]?.codi ?? "";
    const nouCodi = codisNets[0].codi;
    const data = {
      nom: editNom.trim(),
      descripcio: editDesc.trim(),
      codiProjecte: editCodiProjecte.trim(),
      codisInstallacio: codisNets,
    };

    // Si el codi principal ha canviat i el projecte té tags, mostrem l'advertència
    if (codiAntic !== nouCodi && (projecteActual?.tags.length ?? 0) > 0) {
      setDialogCanviInstallacio({ nouCodi, codiAntic, pendingData: data });
      return;
    }

    await guardarEditProjecteReal(data, false);
  }

  async function arxivarProjecte(id: string) {
    try {
      await toggleArxivar(id);
      toast.success("Estat del projecte actualitzat");
    } catch (e: any) {
      toast.error(e?.message ?? "Error en canviar l'estat.");
    }
  }

  async function eliminarProjecte(id: string) {
    try {
      await deleteProjecte(id);
      if (projecteActiu === id) { setProjecteActiu(null); setVista("llistat"); }
      toast.success("Projecte eliminat");
    } catch (e: any) {
      toast.error(e?.message ?? "Error en eliminar el projecte.");
    }
  }

  // ─── accions tags ───────────────────────────────────────────────────────────
  function obrirNouTag() {
    const projecteActual = projectes.find(p => p.id === projecteActiu);
    setTagCodiInstallacio(projecteActual?.codisInstallacio?.[0] ?? projecteActual?.codiInstallacio ?? "");
    setTagEquipId(""); setTagCcm("");
    setTagFuncio(""); setTagDuplicitat("A"); setTagComentari(""); setTagError(null);
    setDialogNouTag(true);
  }

  async function guardarNouTag() {
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

    // Comprova si el TAG ja existeix al llistat Rosmiman
    const existeixARosmiman = rosmimanEquips.some(r => r.tag === tagCandidat);
    if (existeixARosmiman) {
      const projecteActualTags = projecteActual?.tags ?? [];
      const lliure = primeraDuplicitatLliure(tagCodiInstallacio, equip.equipCode, tagCcm, tagFuncio, projecteActualTags, rosmimanEquips);
      const suggeriment = lliure
        ? ` Primera duplicitat disponible: ${buildTag(tagCodiInstallacio, equip.equipCode, tagCcm, tagFuncio, lliure)} (lletra ${lliure}).`
        : " No hi ha duplicitats disponibles.";
      setTagError(`El TAG "${tagCandidat}" ja existeix al llistat Rosmiman.${suggeriment}`);
      return;
    }

    try {
      await addTag(projecteActiu!, {
        equipId: tagEquipId,
        codiInstallacio: tagCodiInstallacio.toUpperCase(),
        ccm: tagCcm,
        funcio: tagFuncio.padStart(2, "0"),
        duplicitat: tagDuplicitat.toUpperCase(),
        tagComplet: tagCandidat,
        status: "pendent",
        comentari: tagComentari,
        fieldValues: {},
      });
      setDialogNouTag(false);
      setEquipSearch("");
      toast.success("Tag creat");
    } catch (e: any) {
      setTagError(e?.message ?? "Error en crear el tag.");
    }
  }

  async function guardarEditTag() {
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
    // Comprova si el TAG modificat ja existeix al llistat Rosmiman
    const existeixARosmimanEdit = rosmimanEquips.some(r => r.tag === tagCandidatEdit);
    if (existeixARosmimanEdit) {
      const projecteActual2Tags = projecteActual2?.tags ?? [];
      const lliureEdit = primeraDuplicitatLliure(tagCodiInstallacio, equip.equipCode, tagCcm, tagFuncio, projecteActual2Tags, rosmimanEquips, dialogEditTag.id);
      const suggerimentEdit = lliureEdit
        ? ` Primera duplicitat disponible: ${buildTag(tagCodiInstallacio, equip.equipCode, tagCcm, tagFuncio, lliureEdit)} (lletra ${lliureEdit}).`
        : " No hi ha duplicitats disponibles.";
      setTagError(`El TAG "${tagCandidatEdit}" ja existeix al llistat Rosmiman.${suggerimentEdit}`);
      return;
    }

    try {
      await updateTag(projecteActiu!, dialogEditTag.id, {
        codiInstallacio: tagCodiInstallacio.toUpperCase(),
        ccm: tagCcm,
        funcio: tagFuncio.padStart(2, "0"),
        duplicitat: tagDuplicitat.toUpperCase(),
        tagComplet: tagCandidatEdit,
        comentari: tagComentari,
      });
      setDialogEditTag(null);
      toast.success("Tag actualitzat");
    } catch (e: any) {
      setTagError(e?.message ?? "Error en actualitzar el tag.");
    }
  }

  async function eliminarTag(tagId: string) {
    try {
      await deleteTag(projecteActiu!, tagId);
      toast.success("Tag eliminat");
    } catch (e: any) {
      toast.error(e?.message ?? "Error en eliminar el tag.");
    }
  }

  async function validarTag(tag: ProjectTag, nouStatus: TagStatus, comentari: string) {
    try {
      // Abans de validar, comprova que el TAG no existeixi ja a Rosmiman
      if (nouStatus === "validat") {
        const duplicatRosmiman = rosmimanEquips.some(r => r.tag === tag.tagComplet);
        if (duplicatRosmiman) {
          toast.error(`No es pot validar: el TAG "${tag.tagComplet}" ja existeix al llistat Rosmiman.`);
          setDialogValidar(null);
          return;
        }
      }

      await updateTag(projecteActiu!, tag.id, { status: nouStatus, comentari });
      setDialogValidar(null);

      // Comprova si tots els tags del projecte han quedat validats
      // (inclou el tag actual que acabem de validar)
      if (nouStatus === "validat") {
        const projecteActual = projectes.find(p => p.id === projecteActiu);
        if (projecteActual) {
          const totsValidats = projecteActual.tags.every(t =>
            t.id === tag.id ? true : t.status === "validat"
          );
          if (totsValidats && projecteActual.tags.length > 0) {
            // Afegim tots els tags validats al llistat Rosmiman
            const equipsAImportar = projecteActual.tags.map(t => ({
              tag:             t.id === tag.id ? tag.tagComplet : t.tagComplet,
              descripcio:      equipMap.get(t.equipId)?.equipName ?? "",
              codiInstallacio: t.codiInstallacio,
            }));
            const { inserted, skipped } = await importRosmimanEquips(equipsAImportar);
            if (inserted > 0) {
              toast.success(`Tots els tags validats ✓ — ${inserted} tag${inserted !== 1 ? "s" : ""} afegit${inserted !== 1 ? "s" : ""} al llistat Rosmiman.`);
            } else {
              toast.success("Tots els tags validats ✓ (ja existien al llistat Rosmiman).");
            }
            return;
          }
        }
      }

      toast.success(nouStatus === "validat" ? "Tag validat ✓" : "Tag rebutjat");
    } catch (e: any) {
      toast.error(e?.message ?? "Error en validar el tag.");
    }
  }

  async function saveFieldValues(tagId: string, values: Record<string, string>) {
    try {
      await updateTag(projecteActiu!, tagId, { fieldValues: values });
    } catch (e: any) {
      toast.error(e?.message ?? "Error en guardar els valors.");
    }
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
  // Pestanya Rosmiman — ara s'obre com a pop-up (igual que GuBIMClass i Diccionari de camps)
  // (eliminat el retorn anticipat; rosmimanOpen controla el Dialog)

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
                {vista === "llistat" ? "Llistat de projectes" : projecteSeleccionat?.nom ?? "Projecte"}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {vista === "llistat"
                  ? "Gestió de projectes i TAGs d'equips"
                  : `Tags i equips del projecte · ${projecteSeleccionat?.descripcio || "sense descripció"}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {vista === "llistat" && canSeeRosmiman && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40"
                onClick={() => setRosmimanOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1" ry="1"/></svg>
                TAGs Rosmiman
              </Button>
            )}
            {vista === "llistat" && canEdit && (
              <Button size="sm" className="gap-1.5 bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => { setNouNom(""); setNouDesc(""); setDialogNouProjecte(true); }}>
                <Plus className="h-3.5 w-3.5" /> Nou projecte
              </Button>
            )}
            {vista === "detail" && canEdit && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5 border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40" onClick={() => obrirEditProjecte(projecteActiu!)}>
                  <Pencil className="h-3.5 w-3.5" /> Edita projecte
                </Button>
                {projecteSeleccionat?.status === "actiu" && (
                  <Button size="sm" className="gap-1.5 bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={obrirNouTag}>
                    <Tags className="h-3.5 w-3.5" /> Nou TAG
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Pop-up TAGs Rosmiman */}
        <Dialog open={rosmimanOpen} onOpenChange={setRosmimanOpen}>
          <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>TAGs Rosmiman</DialogTitle>
            </DialogHeader>
            <div className="pt-6">
              <RosmimanEquipsPage />
            </div>
          </DialogContent>
        </Dialog>

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
                          {(p.codisInstallacio?.length > 0 || p.codiInstallacio) && (
                            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                              Instal·lació: {(p.codisInstallacio?.length > 0 ? p.codisInstallacio.map(i => i.nom ? `${i.codi} ${i.nom}` : i.codi) : [p.codiInstallacio]).join(" · ")}
                            </p>
                          )}
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
                          <Button variant="outline" size="sm" className="h-7 text-[11px] border-slate-200 text-slate-600"
                            onClick={() => obrirEditProjecte(p.id)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {isAdmin && (
                            <Button variant="outline" size="sm"
                              className="h-7 text-[11px] border-slate-200 text-slate-600"
                              onClick={() => obrirDialogUsuaris(p.id)}
                              title={p.allowedUsers ? "Accés restringit · Gestionar usuaris" : "Accés obert · Gestionar usuaris"}>
                              {p.allowedUsers ? <Lock className="h-3 w-3 text-amber-500" /> : <LockOpen className="h-3 w-3" />}
                            </Button>
                          )}
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
                      {(() => {
                        // Agrupa els tags per codi d'instal·lació mantenint l'ordre original
                        const grups: { codi: string; nom?: string; tags: typeof projecteSeleccionat.tags }[] = [];
                        const codisVistos: string[] = [];
                        for (const tag of projecteSeleccionat.tags) {
                          if (!codisVistos.includes(tag.codiInstallacio)) {
                            codisVistos.push(tag.codiInstallacio);
                            const installacioInfo = projecteSeleccionat.codisInstallacio?.find(i => i.codi === tag.codiInstallacio);
                            grups.push({ codi: tag.codiInstallacio, nom: installacioInfo?.nom, tags: [] });
                          }
                          grups[codisVistos.indexOf(tag.codiInstallacio)].tags.push(tag);
                        }
                        const mostrarGrups = grups.length > 1;
                        return grups.map(grup => (
                          <>
                            {mostrarGrups && (
                              <tr key={`grup-${grup.codi}`} className="bg-slate-50/80 border-t border-slate-200">
                                <td colSpan={5} className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-[#006E7A] bg-[#0099A8]/10 px-2 py-0.5 rounded">{grup.codi}</span>
                                    {grup.nom && <span className="text-xs text-slate-500">{grup.nom}</span>}
                                    <span className="text-[10px] text-slate-400 ml-1">{grup.tags.length} tag{grup.tags.length !== 1 ? "s" : ""}</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {grup.tags.map(tag => {
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
                                {canEdit && projecteSeleccionat.status === "actiu" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500"
                                        onClick={() => setDialogEliminarTagValidat(tag.id)}>
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
                          </>
                        ));
                      })()}
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
                  <Label className="text-xs font-medium">Codi de projecte * <span className="text-slate-400 font-normal">(NNNN-N)</span></Label>
                  <Input
                    className="mt-1 font-mono"
                    placeholder="2024-1"
                    value={nouCodiProjecte}
                    onChange={e => { setNouCodiProjecte(e.target.value.replace(/[^0-9-]/g, "")); setNouProjecteError(null); }}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium">Codis d'instal·lació * <span className="text-slate-400 font-normal">(5 car. cada un)</span></Label>
                  <div className="mt-1 space-y-1.5">
                    {nouCodisInstallacio.map((item, idx) => (
                      <div key={idx} className="flex gap-1.5 items-center">
                        <Input
                          className="font-mono uppercase w-24 shrink-0"
                          placeholder="XXXXX"
                          maxLength={5}
                          value={item.codi}
                          onChange={e => {
                            const next = nouCodisInstallacio.map((x, i) => i === idx ? { ...x, codi: e.target.value.toUpperCase() } : x);
                            setNouCodisInstallacio(next);
                            setNouProjecteError(null);
                          }}
                        />
                        <Input
                          className="flex-1 text-xs"
                          placeholder="Nom de la instal·lació (opcional)"
                          value={item.nom ?? ""}
                          onChange={e => {
                            const next = nouCodisInstallacio.map((x, i) => i === idx ? { ...x, nom: e.target.value } : x);
                            setNouCodisInstallacio(next);
                          }}
                        />
                        {nouCodisInstallacio.length > 1 && (
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-500 shrink-0"
                            onClick={() => setNouCodisInstallacio(nouCodisInstallacio.filter((_, i) => i !== idx))}
                          >
                            <span className="text-base leading-none">×</span>
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button" variant="outline" size="sm"
                      className="gap-1 text-xs h-7 text-[#0099A8] border-[#0099A8]/30 hover:bg-[#0099A8]/5"
                      onClick={() => setNouCodisInstallacio([...nouCodisInstallacio, { codi: "", nom: "" }])}
                    >
                      <Plus className="h-3 w-3" /> Afegir instal·lació
                    </Button>
                  </div>
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
              <Button className="bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={crearProjecte} disabled={!nouNom.trim() || !nouCodiProjecte.trim() || nouCodisInstallacio.every(c => !c.codi.trim())}>Crear projecte</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── DIÀLEG: EDITAR PROJECTE ────────────────────────────────────── */}
        <Dialog open={!!dialogEditProjecte} onOpenChange={(b) => { if (!b) { setDialogEditProjecte(null); setEditProjecteError(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Editar projecte</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs font-medium">Nom del projecte *</Label>
                <Input className="mt-1" placeholder="Nom del projecte" value={editNom} onChange={e => { setEditNom(e.target.value); setEditProjecteError(null); }} />
              </div>
              <div>
                <Label className="text-xs font-medium">Descripció</Label>
                <Input className="mt-1" placeholder="Descripció opcional" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Codi de projecte * <span className="text-slate-400 font-normal">(NNNN-N)</span></Label>
                  <Input
                    className="mt-1 font-mono"
                    placeholder="2024-1"
                    value={editCodiProjecte}
                    onChange={e => { setEditCodiProjecte(e.target.value.replace(/[^0-9-]/g, "")); setEditProjecteError(null); }}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium">Codis d'instal·lació * <span className="text-slate-400 font-normal">(5 car. cada un)</span></Label>
                  <div className="mt-1 space-y-1.5">
                    {editCodisInstallacio.map((item, idx) => (
                      <div key={idx} className="flex gap-1.5 items-center">
                        <Input
                          className="font-mono uppercase w-24 shrink-0"
                          placeholder="XXXXX"
                          maxLength={5}
                          value={item.codi}
                          onChange={e => {
                            const next = editCodisInstallacio.map((x, i) => i === idx ? { ...x, codi: e.target.value.toUpperCase() } : x);
                            setEditCodisInstallacio(next);
                            setEditProjecteError(null);
                          }}
                        />
                        <Input
                          className="flex-1 text-xs"
                          placeholder="Nom de la instal·lació (opcional)"
                          value={item.nom ?? ""}
                          onChange={e => {
                            const next = editCodisInstallacio.map((x, i) => i === idx ? { ...x, nom: e.target.value } : x);
                            setEditCodisInstallacio(next);
                          }}
                        />
                        {editCodisInstallacio.length > 1 && (
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-500 shrink-0"
                            onClick={() => setEditCodisInstallacio(editCodisInstallacio.filter((_, i) => i !== idx))}
                          >
                            <span className="text-base leading-none">×</span>
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button" variant="outline" size="sm"
                      className="gap-1 text-xs h-7 text-[#0099A8] border-[#0099A8]/30 hover:bg-[#0099A8]/5"
                      onClick={() => setEditCodisInstallacio([...editCodisInstallacio, { codi: "", nom: "" }])}
                    >
                      <Plus className="h-3 w-3" /> Afegir instal·lació
                    </Button>
                  </div>
                </div>
              </div>
              {editProjecteError && (
                <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{editProjecteError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogEditProjecte(null)}>Cancel·la</Button>
              <Button className="bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={guardarEditProjecte}
                disabled={!editNom.trim() || !editCodiProjecte.trim() || editCodisInstallacio.every(c => !c.codi.trim())}>
                Guardar canvis
              </Button>
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
                {projecteSeleccionat && (projecteSeleccionat.codisInstallacio?.length > 1) ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Instal·lació *</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {projecteSeleccionat.codisInstallacio.map((item) => (
                        <button
                          key={item.codi} type="button"
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                            tagCodiInstallacio === item.codi
                              ? "bg-[#0099A8] text-white border-[#0099A8]"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:border-[#0099A8]/50"
                          )}
                          onClick={() => setTagCodiInstallacio(item.codi)}
                        >
                          <span className="font-mono">{item.codi}</span>
                          {item.nom && <span className="ml-1 font-normal opacity-80">— {item.nom}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (projecteSeleccionat?.codisInstallacio?.[0]?.codi ?? projecteSeleccionat?.codiInstallacio) ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs flex items-center gap-2">
                    <span className="text-slate-500">Instal·lació del projecte:</span>
                    <span className="font-mono font-semibold text-slate-700">{projecteSeleccionat.codisInstallacio?.[0]?.codi ?? projecteSeleccionat.codiInstallacio}</span>
                    {projecteSeleccionat.codisInstallacio?.[0]?.nom && (
                      <span className="text-slate-500">— {projecteSeleccionat.codisInstallacio[0].nom}</span>
                    )}
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
                      readOnly={!!(projecteSeleccionat?.codisInstallacio?.[0] ?? projecteSeleccionat?.codiInstallacio)}
                      onChange={e => { if (!(projecteSeleccionat?.codisInstallacio?.[0] ?? projecteSeleccionat?.codiInstallacio)) setTagCodiInstallacio(e.target.value.toUpperCase()); }}
                      title={(projecteSeleccionat?.codisInstallacio?.[0] ?? projecteSeleccionat?.codiInstallacio) ? (projecteSeleccionat?.codisInstallacio?.length > 1 ? "Selecciona a dalt" : "Fixat a la configuració del projecte") : undefined}
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

        {/* ── DIÀLEG: ADVERTÈNCIA CANVI CODI INSTAL·LACIÓ ──────────────── */}
        <AlertDialog open={!!dialogCanviInstallacio} onOpenChange={(o) => { if (!o) setDialogCanviInstallacio(null); }}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Canvi de codi d'instal·lació
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-slate-600">
                  <p>
                    Estàs canviant el codi d'instal·lació de{" "}
                    <span className="font-mono font-semibold text-slate-800">{dialogCanviInstallacio?.codiAntic}</span>{" "}
                    a{" "}
                    <span className="font-mono font-semibold text-slate-800">{dialogCanviInstallacio?.nouCodi}</span>.
                  </p>
                  <p>
                    Aquest projecte té{" "}
                    <span className="font-semibold text-slate-800">
                      {projectes.find(p => p.id === dialogEditProjecte)?.tags.length ?? 0} tags
                    </span>{" "}
                    creats. Vols actualitzar també el codi d'instal·lació dels tags existents?
                  </p>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                    Si <strong>no</strong> actualitzes els tags, continuaran amb el codi antic{" "}
                    <span className="font-mono">{dialogCanviInstallacio?.codiAntic}</span> al seu TAG.
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={() => setDialogCanviInstallacio(null)}>
                Cancel·la
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-slate-600 hover:bg-slate-700 text-white"
                onClick={() => dialogCanviInstallacio && guardarEditProjecteReal(dialogCanviInstallacio.pendingData, false)}
              >
                Canviar només el projecte
              </AlertDialogAction>
              <AlertDialogAction
                className="bg-[#0099A8] hover:bg-[#006E7A] text-white"
                onClick={() => dialogCanviInstallacio && guardarEditProjecteReal(dialogCanviInstallacio.pendingData, true)}
              >
                Canviar projecte i tags
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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

        {/* ── DIÀLEG: ELIMINAR TAG ─────────────────────────────────────── */}
        {(() => {
          const tagAEliminar = dialogEliminarTagValidat
            ? projecteSeleccionat?.tags.find(t => t.id === dialogEliminarTagValidat) ?? null
            : null;
          const esValidat = tagAEliminar?.status === "validat";
          return (
            <AlertDialog open={!!dialogEliminarTagValidat} onOpenChange={() => setDialogEliminarTagValidat(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className={`h-5 w-5 ${esValidat ? "text-amber-500" : "text-red-500"}`} />
                    Eliminar tag?
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm text-slate-600">
                      {tagAEliminar && (
                        <p className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
                          {tagAEliminar.tagComplet}
                        </p>
                      )}
                      {esValidat ? (
                        <>
                          <p>Aquest tag ja ha estat <span className="font-semibold text-emerald-700">validat</span> i pot estar al llistat Rosmiman.</p>
                          <p>Eliminar-lo del projecte <span className="font-semibold">no</span> l'eliminarà automàticament del llistat Rosmiman. Si cal, elimina'l manualment des de la pàgina de Rosmiman.</p>
                        </>
                      ) : (
                        <p>Aquesta acció no es pot desfer.</p>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => { eliminarTag(dialogEliminarTagValidat!); setDialogEliminarTagValidat(null); }}
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        })()}

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
        {/* ── DIÀLEG: GESTIÓ D'ACCÉS PER USUARI (només admins) ──────────── */}
        <Dialog open={!!dialogUsuaris} onOpenChange={(b) => { if (!b) setDialogUsuaris(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#0099A8]" />
                Accés al projecte
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-xs text-slate-500">
                Selecciona els usuaris que poden veure aquest projecte. Si no en selecciones cap, el projecte serà visible per a tots els usuaris amb accés a Projectes. Els administradors sempre hi tenen accés.
              </p>
              {loadingUsers ? (
                <p className="text-sm text-slate-400 text-center py-4">Carregant usuaris…</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {allUsers.filter(u => u.role !== "admin").map(u => {
                    const checked = selectedUsers.includes(u.id);
                    return (
                      <label key={u.id} className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors",
                        checked ? "bg-[#0099A8]/8 border-[#0099A8]/30" : "bg-slate-50 border-slate-100 hover:border-slate-200"
                      )}>
                        <input
                          type="checkbox"
                          className="accent-[#0099A8]"
                          checked={checked}
                          onChange={() => {
                            setSelectedUsers(prev =>
                              checked ? prev.filter(id => id !== u.id) : [...prev, u.id]
                            );
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{u.full_name || u.email}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{u.email}</p>
                        </div>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          u.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"
                        )}>{u.role}</span>
                      </label>
                    );
                  })}
                  {allUsers.filter(u => u.role !== "admin").length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">Cap usuari no-admin trobat</p>
                  )}
                </div>
              )}
              {selectedUsers.length > 0 && (
                <p className="text-xs text-[#006E7A] font-medium">
                  {selectedUsers.length} usuari{selectedUsers.length !== 1 ? "s" : ""} seleccionat{selectedUsers.length !== 1 ? "s" : ""}
                </p>
              )}
              {selectedUsers.length === 0 && !loadingUsers && (
                <p className="text-xs text-slate-400 italic">Sense selecció = accés obert per a tots</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDialogUsuaris(null)}>Cancel·la</Button>
              <Button size="sm" className="bg-[#0099A8] hover:bg-[#006E7A]" onClick={guardarUsuaris}>
                Desa permisos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}
