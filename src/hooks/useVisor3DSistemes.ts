// src/hooks/useVisor3DSistemes.ts
//
// Hook per gestionar els sistemes i instal·lacions del Visualitzador 3D
// amb persistència a Supabase.
//
// REFACTOR: usa useAuthLoad() per eliminar la triplicació del patró
// auth/load/visibility que existia idèntic a dataStore.tsx i useProjectes.tsx.

import { useState, useEffect, useCallback, startTransition } from "react";
import { useAuthLoad } from "@/hooks/useAuthLoad";
import { supaFetch as supa } from "@/lib/supaFetch";

// ─── Tipus ────────────────────────────────────────────────────────────────────

export interface Installacio {
  id: string;
  nom: string;
  descripcio?: string;
  codiInstallacio?: string;
  embedUrl: string;
  urn?: string;
  urnMep?: string;
  urnEnt?: string;
  urnEst?: string;
}

export interface Sistema {
  id: string;
  nom: string;
  codi?: string;
  color: string;
  installacions: Installacio[];
}

// ─── Tipus de les files de Supabase ──────────────────────────────────────────

interface SistemaRow {
  id: string;
  nom: string;
  codi: string | null;
  color: string;
  ordre: number;
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
  urn_mep: string | null;
  urn_ent: string | null;
  urn_est: string | null;
  ordre: number;
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
    urnMep: row.urn_mep ?? undefined,
    urnEnt: row.urn_ent ?? undefined,
    urnEst: row.urn_est ?? undefined,
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
  const { getFreshToken, shouldLoad, loadingRef, setupAuthListeners } = useAuthLoad();
  const [sistemes, setSistemes] = useState<Sistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Obtenim getToken del hook d'auth directament per a les mutacions
  // (no cal token fresc — les mutacions s'executen immediatament)
  const { getFreshToken: getToken } = useAuthLoad();

  // ── Càrrega ───────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const token = await getFreshToken();
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

      startTransition(() => {
        setSistemes(
          buildSistemes(
            sistemeRows as SistemaRow[],
            installacioRows as InstallacioRow[]
          )
        );
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error carregant dades: ${msg}`);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [getFreshToken, loadingRef]);

  // Càrrega inicial
  useEffect(() => {
    if (shouldLoad) fetchAll();
  }, [shouldLoad, fetchAll]);

  // Auth listeners (TOKEN_REFRESHED, visibilitychange, SIGNED_IN/OUT)
  useEffect(() => setupAuthListeners({
    onLoad: fetchAll,
    onSignOut: () => {
      startTransition(() => setSistemes([]));
      setLoading(false);
      setError(null);
    },
  }), [fetchAll, setupAuthListeners]);

  // ── CRUD Sistemes ──────────────────────────────────────────────────────────

  const createSistema = useCallback(
    async (data: { nom: string; codi: string; color: string }) => {
      const token = await getToken();
      const ordre = sistemes.length;
      const rows = await supa(token, "POST", "visor3d_sistemes", {
        nom: data.nom.trim(),
        codi: data.codi.trim() || null,
        color: data.color,
        ordre,
      });
      const row = rows[0] as SistemaRow;
      const nou: Sistema = {
        id: row.id,
        nom: row.nom,
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
    async (id: string, data: { nom: string; codi: string; color: string }) => {
      const token = await getToken();
      await supa(token, "PATCH", `visor3d_sistemes?id=eq.${id}`, {
        nom: data.nom.trim(),
        codi: data.codi.trim() || null,
        color: data.color,
        updated_at: new Date().toISOString(),
      });
      setSistemes((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, nom: data.nom.trim(), codi: data.codi.trim() || undefined, color: data.color }
            : s
        )
      );
    },
    [getToken]
  );

  const deleteSistema = useCallback(async (id: string) => {
    const token = await getToken();
    await supa(token, "DELETE", `visor3d_sistemes?id=eq.${id}`);
    setSistemes((prev) => prev.filter((s) => s.id !== id));
  }, [getToken]);

  // ── CRUD Instal·lacions ────────────────────────────────────────────────────

  const createInstallacio = useCallback(
    async (
      sistemaId: string,
      data: { nom: string; codiInstallacio: string; embedUrl: string; urn?: string }
    ) => {
      const token = await getToken();
      const sistema = sistemes.find((s) => s.id === sistemaId);
      const ordre = sistema ? sistema.installacions.length : 0;
      const rows = await supa(token, "POST", "visor3d_installacions", {
        sistema_id: sistemaId,
        nom: data.nom.trim(),
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
      data: { nom: string; codiInstallacio: string; embedUrl: string; urn?: string }
    ) => {
      const token = await getToken();
      await supa(token, "PATCH", `visor3d_installacions?id=eq.${installacioId}`, {
        nom: data.nom.trim(),
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
      const token = await getToken();
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
