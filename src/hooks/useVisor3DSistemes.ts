// src/hooks/useVisor3DSistemes.ts
//
// Hook per gestionar els sistemes i instal·lacions del Visualitzador 3D
// amb persistència a Supabase.
//
// Segueix EXACTAMENT el mateix patró que dataStore.tsx i useProjectes.tsx:
//  - fetch directe a la REST API de Supabase amb Bearer token (no client supabase)
//  - onAuthStateChange escolta TOKEN_REFRESHED: si la pàgina és en segon pla,
//    marca needsReloadRef = true; quan l'usuari torna, visibilitychange dispara load()
//  - loadingRef evita càrregues paral·leles
//
// Aquest patró soluciona el problema de la finestra Visualitzador 3D que deixa
// de funcionar en tornar a l'aplicació després de minimitzar o canviar de finestra:
// el token de Supabase es refresca en segon pla, el client queda en estat inconsistent,
// i la pàgina no respon. Amb aquest patró, en tornar es recarreguen les dades
// amb un token fresc garantit.

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { supaFetch as supa } from "@/lib/supaFetch";

// ─── Tipus ────────────────────────────────────────────────────────────────────

export interface Installacio {
  id: string;
  nom: string;
  descripcio?: string;
  codiInstallacio?: string;
  embedUrl: string;
  urn?: string;
}

export interface Sistema {
  id: string;
  nom: string;
  descripcio?: string;
  codi?: string;
  color: string;
  installacions: Installacio[];
}

// ─── Tipus de les files de Supabase ──────────────────────────────────────────

interface SistemaRow {
  id: string;
  nom: string;
  descripcio: string | null;
  codi: string | null;
  color: string;
  ordre: number;
  created_at: string;
  updated_at: string;
}

interface InstallacioRow {
  id: string;
  sistema_id: string;
  nom: string;
  descripcio: string | null;
  codi_installacio: string | null;
  embed_url: string;
  urn: string | null;
  ordre: number;
  created_at: string;
  updated_at: string;
}

// ─── Conversió de files Supabase → tipus locals ───────────────────────────────

function rowToInstallacio(row: InstallacioRow): Installacio {
  return {
    id: row.id,
    nom: row.nom,
    descripcio: row.descripcio ?? undefined,
    codiInstallacio: row.codi_installacio ?? undefined,
    embedUrl: row.embed_url,
    urn: row.urn ?? undefined,
  };
}

function buildSistemes(
  sistemeRows: SistemaRow[],
  installacioRows: InstallacioRow[]
): Sistema[] {
  return sistemeRows
    .sort((a, b) => a.ordre - b.ordre)
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      descripcio: s.descripcio ?? undefined,
      codi: s.codi ?? undefined,
      color: s.color,
      installacions: installacioRows
        .filter((i) => i.sistema_id === s.id)
        .sort((a, b) => a.ordre - b.ordre)
        .map(rowToInstallacio),
    }));
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useVisor3DSistemes() {
  const { getToken, loading: authLoading, user } = useAuth();
  const [sistemes, setSistemes] = useState<Sistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef     = useRef(false);
  const needsReloadRef = useRef(false);

  // ── Càrrega (mateix patró que dataStore i useProjectes) ───────────────────

  const fetchAll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    // Obtenim token fresc — igual que dataStore i useProjectes
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
      const [sistemeRows, installacioRows] = await Promise.all([
        supa(token, "GET", "visor3d_sistemes?select=*&order=ordre.asc"),
        supa(token, "GET", "visor3d_installacions?select=*&order=ordre.asc"),
      ]);

      setSistemes(
        buildSistemes(
          sistemeRows as SistemaRow[],
          installacioRows as InstallacioRow[]
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error carregant dades: ${msg}`);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [getToken]);

  // Càrrega inicial quan auth ha acabat i hi ha usuari
  useEffect(() => {
    if (!authLoading && user) fetchAll();
  }, [authLoading, user, fetchAll]);

  // TOKEN_REFRESHED + visibilitychange — EXACTAMENT el mateix patró que
  // dataStore.tsx i useProjectes.tsx
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        setTimeout(() => fetchAll(), 50);
      }
      if (event === "SIGNED_OUT") {
        setSistemes([]);
        setLoading(false);
        setError(null);
        loadingRef.current = false;
      }
      if (event === "TOKEN_REFRESHED") {
        if (document.hidden) {
          needsReloadRef.current = true;
        } else {
          fetchAll();
        }
      }
    });

    const handleVisibility = () => {
      if (!document.hidden && needsReloadRef.current) {
        needsReloadRef.current = false;
        fetchAll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchAll]);

  // ── CRUD Sistemes ──────────────────────────────────────────────────────────

  const createSistema = useCallback(
    async (data: { nom: string; descripcio: string; codi: string; color: string }) => {
      const token = getToken();
      const ordre = sistemes.length;
      const rows = await supa(token, "POST", "visor3d_sistemes", {
        nom: data.nom.trim(),
        descripcio: data.descripcio.trim() || null,
        codi: data.codi.trim() || null,
        color: data.color,
        ordre,
      });
      const row = rows[0] as SistemaRow;
      const nou: Sistema = {
        id: row.id,
        nom: row.nom,
        descripcio: row.descripcio ?? undefined,
        codi: row.codi ?? undefined,
        color: row.color,
        installacions: [],
      };
      setSistemes((prev) => [...prev, nou]);
      return nou;
    },
    [getToken, sistemes.length]
  );

  const updateSistema = useCallback(
    async (id: string, data: { nom: string; descripcio: string; codi: string; color: string }) => {
      const token = getToken();
      await supa(token, "PATCH", `visor3d_sistemes?id=eq.${id}`, {
        nom: data.nom.trim(),
        descripcio: data.descripcio.trim() || null,
        codi: data.codi.trim() || null,
        color: data.color,
        updated_at: new Date().toISOString(),
      });
      setSistemes((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, nom: data.nom.trim(), descripcio: data.descripcio.trim() || undefined, codi: data.codi.trim() || undefined, color: data.color }
            : s
        )
      );
    },
    [getToken]
  );

  const deleteSistema = useCallback(async (id: string) => {
    const token = getToken();
    await supa(token, "DELETE", `visor3d_sistemes?id=eq.${id}`);
    setSistemes((prev) => prev.filter((s) => s.id !== id));
  }, [getToken]);

  // ── CRUD Instal·lacions ────────────────────────────────────────────────────

  const createInstallacio = useCallback(
    async (
      sistemaId: string,
      data: { nom: string; descripcio: string; codiInstallacio: string; embedUrl: string; urn?: string }
    ) => {
      const token = getToken();
      const sistema = sistemes.find((s) => s.id === sistemaId);
      const ordre = sistema ? sistema.installacions.length : 0;
      const rows = await supa(token, "POST", "visor3d_installacions", {
        sistema_id: sistemaId,
        nom: data.nom.trim(),
        descripcio: data.descripcio.trim() || null,
        codi_installacio: data.codiInstallacio.trim() || null,
        embed_url: data.embedUrl.trim() || null,
        urn: data.urn?.trim() || null,
        ordre,
      });
      const nova = rowToInstallacio(rows[0] as InstallacioRow);
      setSistemes((prev) =>
        prev.map((s) =>
          s.id === sistemaId
            ? { ...s, installacions: [...s.installacions, nova] }
            : s
        )
      );
      return nova;
    },
    [getToken, sistemes]
  );

  const updateInstallacio = useCallback(
    async (
      sistemaId: string,
      installacioId: string,
      data: { nom: string; descripcio: string; codiInstallacio: string; embedUrl: string; urn?: string }
    ) => {
      const token = getToken();
      await supa(token, "PATCH", `visor3d_installacions?id=eq.${installacioId}`, {
        nom: data.nom.trim(),
        descripcio: data.descripcio.trim() || null,
        codi_installacio: data.codiInstallacio.trim() || null,
        embed_url: data.embedUrl.trim() || null,
        urn: data.urn?.trim() || null,
        updated_at: new Date().toISOString(),
      });
      setSistemes((prev) =>
        prev.map((s) =>
          s.id === sistemaId
            ? {
                ...s,
                installacions: s.installacions.map((i) =>
                  i.id === installacioId
                    ? {
                        ...i,
                        nom: data.nom.trim(),
                        descripcio: data.descripcio.trim() || undefined,
                        codiInstallacio: data.codiInstallacio.trim() || undefined,
                        embedUrl: data.embedUrl.trim(),
                        urn: data.urn?.trim() || undefined,
                      }
                    : i
                ),
              }
            : s
        )
      );
    },
    [getToken]
  );

  const deleteInstallacio = useCallback(
    async (sistemaId: string, installacioId: string) => {
      const token = getToken();
      await supa(token, "DELETE", `visor3d_installacions?id=eq.${installacioId}`);
      setSistemes((prev) =>
        prev.map((s) =>
          s.id === sistemaId
            ? { ...s, installacions: s.installacions.filter((i) => i.id !== installacioId) }
            : s
        )
      );
    },
    [getToken]
  );

  return {
    sistemes,
    loading,
    error,
    refetch: fetchAll,
    createSistema,
    updateSistema,
    deleteSistema,
    createInstallacio,
    updateInstallacio,
    deleteInstallacio,
  };
}
