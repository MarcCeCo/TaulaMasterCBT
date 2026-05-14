/**
 * useProjectes — magatzem centralitzat de projectes i els seus tags
 *
 * Segueix el mateix patró que dataStore.tsx:
 *  - fetch directe a la REST API de Supabase amb Bearer token
 *  - Context compartit per evitar duplicar peticions
 *  - Optimistic updates: estat local s'actualitza immediatament,
 *    la crida a Supabase confirma la persistència
 */

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { uid } from "@/lib/storage";

const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string).trim();
const SUPA_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string).trim();

// ─── Helper fetch (mateix patró que dataStore) ────────────────────────────────
async function supa(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<any[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    signal: controller.signal,
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": SUPA_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[${method} ${path}] ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ─── Tipus ────────────────────────────────────────────────────────────────────

export type ProjectStatus = "actiu" | "arxivat";
export type TagStatus = "pendent" | "validat" | "rebutjat";

export interface RosmimanEquip {
  id: string;
  tag: string;           // TAG complet (col A de l'Excel)
  descripcio: string;    // Descripció (col B de l'Excel)
  codiInstallacio: string; // primers 5 caràcters del TAG
  createdAt: number;
}

export interface ProjectTag {
  id: string;
  projecteId: string;
  equipId: string;
  codiInstallacio: string;
  ccm: string;
  funcio: string;
  duplicitat: string;
  tagComplet: string;
  status: TagStatus;
  comentari: string;
  fieldValues: Record<string, string>;
  createdAt: number;
}

export interface Projecte {
  id: string;
  nom: string;
  descripcio: string;
  codiProjecte: string;
  codiInstallacio: string;
  status: ProjectStatus;
  tags: ProjectTag[];
  createdAt: number;
}

// ─── Conversors row ↔ objecte ─────────────────────────────────────────────────

const toTag = (row: any): ProjectTag => ({
  id:              row.id,
  projecteId:      row.projecte_id,
  equipId:         row.equip_id,
  codiInstallacio: row.codi_installacio ?? "",
  ccm:             row.ccm             ?? "",
  funcio:          row.funcio           ?? "",
  duplicitat:      row.duplicitat       ?? "A",
  tagComplet:      row.tag_complet      ?? "",
  status:          row.status           ?? "pendent",
  comentari:       row.comentari        ?? "",
  fieldValues:     row.field_values     ?? {},
  createdAt:       row.created_at       ?? Date.now(),
});

const tagToRow = (t: ProjectTag) => ({
  id:               t.id,
  projecte_id:      t.projecteId,
  equip_id:         t.equipId,
  codi_installacio: t.codiInstallacio,
  ccm:              t.ccm,
  funcio:           t.funcio,
  duplicitat:       t.duplicitat,
  tag_complet:      t.tagComplet,
  status:           t.status,
  comentari:        t.comentari,
  field_values:     t.fieldValues,
  created_at:       t.createdAt,
});

const toProjecte = (row: any, tags: ProjectTag[]): Projecte => ({
  id:               row.id,
  nom:              row.nom,
  descripcio:       row.descripcio       ?? "",
  codiProjecte:     row.codi_projecte    ?? "",
  codiInstallacio:  row.codi_installacio ?? "",
  status:           row.status           ?? "actiu",
  tags:             tags.filter(t => t.projecteId === row.id),
  createdAt:        row.created_at       ?? Date.now(),
});

const projecteToRow = (p: Projecte) => ({
  id:               p.id,
  nom:              p.nom,
  descripcio:       p.descripcio,
  codi_projecte:    p.codiProjecte,
  codi_installacio: p.codiInstallacio,
  status:           p.status,
  created_at:       p.createdAt,
});

const toRosmimanEquip = (row: any): RosmimanEquip => ({
  id:              row.id,
  tag:             row.tag             ?? "",
  descripcio:      row.descripcio      ?? "",
  codiInstallacio: row.codi_installacio ?? "",
  createdAt:       row.created_at      ?? Date.now(),
});

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ProjectesValue {
  loading:  boolean;
  error:    string | null;
  retry:    () => void;

  projectes: Projecte[];

  // Projectes CRUD
  createProjecte: (data: Omit<Projecte, "id" | "tags" | "createdAt">) => Promise<void>;
  updateProjecte: (id: string, patch: Partial<Omit<Projecte, "id" | "tags">>) => Promise<void>;
  deleteProjecte: (id: string) => Promise<void>;
  toggleArxivar:  (id: string) => Promise<void>;

  // Equips Rosmiman
  rosmimanEquips:       RosmimanEquip[];
  loadingRosmiman:      boolean;
  importRosmimanEquips: (equips: Omit<RosmimanEquip, "id" | "createdAt">[]) => Promise<{ inserted: number; skipped: number }>;
  deleteRosmimanEquip:  (id: string) => Promise<void>;
  clearRosmimanEquips:  () => Promise<void>;

  // Tags CRUD
  addTag:    (projecteId: string, tag: Omit<ProjectTag, "id" | "projecteId" | "createdAt">) => Promise<void>;
  updateTag: (projecteId: string, tagId: string, patch: Partial<ProjectTag>) => Promise<void>;
  deleteTag: (projecteId: string, tagId: string) => Promise<void>;
}

const ProjectesContext = createContext<ProjectesValue | null>(null);

export const useProjectes = (): ProjectesValue => {
  const ctx = useContext(ProjectesContext);
  if (!ctx) throw new Error("useProjectes: cal ProjectesProvider");
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProjectesProvider({ children }: { children: ReactNode }) {
  const { getToken, loading: authLoading, user } = useAuth();
  const [projectes, setProjectes]           = useState<Projecte[]>([]);
  const [rosmimanEquips, setRosmimanEquips] = useState<RosmimanEquip[]>([]);
  const [loadingRosmiman, setLoadingRosmiman] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [error,   setError]       = useState<string | null>(null);
  const loadingRef     = useRef(false);
  const needsReloadRef = useRef(false);

  // ── Càrrega ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    let token = getToken();
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token ?? "";
    }
    if (!token) {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token ?? "";
        if (token) break;
      }
    }

    if (!token) {
      setError("Sessió no disponible. Torneu a iniciar sessió.");
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    try {
      const [projectesData, tagsData, rosmimanData] = await Promise.all([
        supa(token, "GET", "projectes?select=*&order=created_at.desc"),
        supa(token, "GET", "projecte_tags?select=*&order=created_at.asc"),
        supa(token, "GET", "rosmiman_equips?select=*&order=codi_installacio.asc,tag.asc"),
      ]);

      const tags = tagsData.map(toTag);

      startTransition(() => {
        setProjectes(projectesData.map(row => toProjecte(row, tags)));
        setRosmimanEquips(rosmimanData.map(toRosmimanEquip));
      });
    } catch (e: any) {
      setError(e?.message ?? "Error de xarxa");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading && user) load();
  }, [authLoading, user, load]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN")      setTimeout(() => load(), 50);
      if (event === "SIGNED_OUT")     { startTransition(() => { setProjectes([]); setRosmimanEquips([]); }); setLoading(false); setError(null); loadingRef.current = false; }
      if (event === "TOKEN_REFRESHED") {
        if (document.hidden) needsReloadRef.current = true;
        else load();
      }
    });

    const handleVisibility = () => {
      if (!document.hidden && needsReloadRef.current) {
        needsReloadRef.current = false;
        load();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => { subscription.unsubscribe(); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [load]);

  // ── Mutacions projectes ───────────────────────────────────────────────────

  const createProjecte = useCallback(async (data: Omit<Projecte, "id" | "tags" | "createdAt">) => {
    const token = getToken();
    const nou: Projecte = { ...data, id: uid(), tags: [], createdAt: Date.now() };
    await supa(token, "POST", "projectes", projecteToRow(nou), { "Prefer": "return=minimal" });
    setProjectes(prev => [nou, ...prev]);
  }, [getToken]);

  const updateProjecte = useCallback(async (id: string, patch: Partial<Omit<Projecte, "id" | "tags">>) => {
    const token = getToken();
    // Convertim el patch a noms de columna SQL
    const rowPatch: Record<string, any> = {};
    if (patch.nom             !== undefined) rowPatch.nom              = patch.nom;
    if (patch.descripcio      !== undefined) rowPatch.descripcio       = patch.descripcio;
    if (patch.codiProjecte    !== undefined) rowPatch.codi_projecte    = patch.codiProjecte;
    if (patch.codiInstallacio !== undefined) rowPatch.codi_installacio = patch.codiInstallacio;
    if (patch.status          !== undefined) rowPatch.status           = patch.status;

    await supa(token, "PATCH", `projectes?id=eq.${id}`, rowPatch, { "Prefer": "return=minimal" });
    setProjectes(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, [getToken]);

  const deleteProjecte = useCallback(async (id: string) => {
    const token = getToken();
    // ON DELETE CASCADE s'encarrega d'esborrar els tags associats
    await supa(token, "DELETE", `projectes?id=eq.${id}`);
    setProjectes(prev => prev.filter(p => p.id !== id));
  }, [getToken]);

  const toggleArxivar = useCallback(async (id: string) => {
    const p = projectes.find(p => p.id === id);
    if (!p) return;
    const nouStatus: ProjectStatus = p.status === "arxivat" ? "actiu" : "arxivat";
    await updateProjecte(id, { status: nouStatus });
  }, [projectes, updateProjecte]);

  // ── Mutacions tags ────────────────────────────────────────────────────────

  const addTag = useCallback(async (
    projecteId: string,
    tagData: Omit<ProjectTag, "id" | "projecteId" | "createdAt">
  ) => {
    const token = getToken();
    const tag: ProjectTag = { ...tagData, id: uid(), projecteId, createdAt: Date.now() };
    await supa(token, "POST", "projecte_tags", tagToRow(tag), { "Prefer": "return=minimal" });
    setProjectes(prev => prev.map(p =>
      p.id === projecteId ? { ...p, tags: [...p.tags, tag] } : p
    ));
  }, [getToken]);

  const updateTag = useCallback(async (
    projecteId: string,
    tagId: string,
    patch: Partial<ProjectTag>
  ) => {
    const token = getToken();
    const rowPatch: Record<string, any> = {};
    if (patch.status      !== undefined) rowPatch.status       = patch.status;
    if (patch.comentari   !== undefined) rowPatch.comentari    = patch.comentari;
    if (patch.fieldValues !== undefined) rowPatch.field_values = patch.fieldValues;
    if (patch.ccm         !== undefined) rowPatch.ccm          = patch.ccm;
    if (patch.funcio      !== undefined) rowPatch.funcio        = patch.funcio;
    if (patch.duplicitat  !== undefined) rowPatch.duplicitat   = patch.duplicitat;
    if (patch.tagComplet  !== undefined) rowPatch.tag_complet  = patch.tagComplet;
    if (patch.codiInstallacio !== undefined) rowPatch.codi_installacio = patch.codiInstallacio;

    await supa(token, "PATCH", `projecte_tags?id=eq.${tagId}`, rowPatch, { "Prefer": "return=minimal" });
    setProjectes(prev => prev.map(p =>
      p.id === projecteId
        ? { ...p, tags: p.tags.map(t => t.id === tagId ? { ...t, ...patch } : t) }
        : p
    ));
  }, [getToken]);

  const deleteTag = useCallback(async (projecteId: string, tagId: string) => {
    const token = getToken();
    await supa(token, "DELETE", `projecte_tags?id=eq.${tagId}`);
    setProjectes(prev => prev.map(p =>
      p.id === projecteId
        ? { ...p, tags: p.tags.filter(t => t.id !== tagId) }
        : p
    ));
  }, [getToken]);

  // ── Mutacions Rosmiman ───────────────────────────────────────────────────

  const importRosmimanEquips = useCallback(async (
    equips: Omit<RosmimanEquip, "id" | "createdAt">[]
  ): Promise<{ inserted: number; skipped: number }> => {
    const token = getToken();
    setLoadingRosmiman(true);
    try {
      const existingTags = new Set(rosmimanEquips.map(e => e.tag));
      const toInsert = equips.filter(e => !existingTags.has(e.tag));
      const skipped = equips.length - toInsert.length;

      if (toInsert.length > 0) {
        const rows = toInsert.map(e => ({
          id:               uid(),
          tag:              e.tag,
          descripcio:       e.descripcio,
          codi_installacio: e.codiInstallacio,
          created_at:       Date.now(),
        }));
        const BATCH = 100;
        for (let i = 0; i < rows.length; i += BATCH) {
          await supa(token, "POST", "rosmiman_equips", rows.slice(i, i + BATCH), {
            // "resolution=ignore-duplicates" evita el 409 si el tag ja existeix a la BD
            "Prefer": "return=minimal,resolution=ignore-duplicates",
          });
        }
        setRosmimanEquips(prev => [...prev, ...rows.map(toRosmimanEquip)]
          .sort((a, b) => a.codiInstallacio.localeCompare(b.codiInstallacio) || a.tag.localeCompare(b.tag))
        );
      }
      return { inserted: toInsert.length, skipped };
    } finally {
      setLoadingRosmiman(false);
    }
  }, [getToken, rosmimanEquips]);

  const deleteRosmimanEquip = useCallback(async (id: string) => {
    const token = getToken();
    await supa(token, "DELETE", `rosmiman_equips?id=eq.${id}`);
    setRosmimanEquips(prev => prev.filter(e => e.id !== id));
  }, [getToken]);

  const clearRosmimanEquips = useCallback(async () => {
    const token = getToken();
    // Filtre "tag=neq.__NEVER__" és sempre cert (cap tag tindrà aquest valor)
    // i permet esborrar totes les files sense el bloqueig de Supabase contra DELETE sense filtre
    await supa(token, "DELETE", "rosmiman_equips?tag=neq.__NEVER__");
    setRosmimanEquips([]);
  }, [getToken]);

  const value: ProjectesValue = {
    loading, error, retry: load,
    projectes,
    rosmimanEquips, loadingRosmiman,
    importRosmimanEquips, deleteRosmimanEquip, clearRosmimanEquips,
    createProjecte, updateProjecte, deleteProjecte, toggleArxivar,
    addTag, updateTag, deleteTag,
  };

  return (
    <ProjectesContext.Provider value={value}>
      {children}
    </ProjectesContext.Provider>
  );
}
