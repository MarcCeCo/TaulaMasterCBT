// src/hooks/useVisor3DSistemes.ts
//
// Hook per gestionar els sistemes i instal·lacions del Visualitzador 3D
// amb persistència a Supabase en lloc de localStorage.
//
// Taules necessàries a Supabase:
//   - visor3d_sistemes   (id, nom, descripcio, color, ordre, created_at, updated_at)
//   - visor3d_installacions (id, sistema_id, nom, descripcio, codi_installacio, embed_url, ordre, created_at, updated_at)

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Tipus ────────────────────────────────────────────────────────────────────

export interface Installacio {
  id: string;
  nom: string;
  descripcio?: string;
  codiInstallacio?: string;
  embedUrl: string;
}

export interface Sistema {
  id: string;
  nom: string;
  descripcio?: string;
  color: string;
  installacions: Installacio[];
}

// ─── Tipus de les files de Supabase ──────────────────────────────────────────

interface SistemaRow {
  id: string;
  nom: string;
  descripcio: string | null;
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
      color: s.color,
      installacions: installacioRows
        .filter((i) => i.sistema_id === s.id)
        .sort((a, b) => a.ordre - b.ordre)
        .map(rowToInstallacio),
    }));
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useVisor3DSistemes() {
  const [sistemes, setSistemes] = useState<Sistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Càrrega inicial ────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: sistemeRows, error: errS }, { data: installacioRows, error: errI }] =
        await Promise.all([
          supabase
            .from("visor3d_sistemes")
            .select("*")
            .order("ordre", { ascending: true }),
          supabase
            .from("visor3d_installacions")
            .select("*")
            .order("ordre", { ascending: true }),
        ]);

      if (errS) throw errS;
      if (errI) throw errI;

      setSistemes(
        buildSistemes(
          (sistemeRows ?? []) as SistemaRow[],
          (installacioRows ?? []) as InstallacioRow[]
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error carregant dades: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── CRUD Sistemes ──────────────────────────────────────────────────────────

  const createSistema = useCallback(
    async (data: { nom: string; descripcio: string; color: string }) => {
      const ordre = sistemes.length;
      const { data: row, error: err } = await supabase
        .from("visor3d_sistemes")
        .insert({
          nom: data.nom.trim(),
          descripcio: data.descripcio.trim() || null,
          color: data.color,
          ordre,
        })
        .select()
        .single();

      if (err) throw err;

      const nou: Sistema = {
        id: (row as SistemaRow).id,
        nom: (row as SistemaRow).nom,
        descripcio: (row as SistemaRow).descripcio ?? undefined,
        color: (row as SistemaRow).color,
        installacions: [],
      };
      setSistemes((prev) => [...prev, nou]);
      return nou;
    },
    [sistemes.length]
  );

  const updateSistema = useCallback(
    async (id: string, data: { nom: string; descripcio: string; color: string }) => {
      const { error: err } = await supabase
        .from("visor3d_sistemes")
        .update({
          nom: data.nom.trim(),
          descripcio: data.descripcio.trim() || null,
          color: data.color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (err) throw err;

      setSistemes((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, nom: data.nom.trim(), descripcio: data.descripcio.trim() || undefined, color: data.color }
            : s
        )
      );
    },
    []
  );

  const deleteSistema = useCallback(async (id: string) => {
    // Les instal·lacions s'eliminen en cascada a la BD (ON DELETE CASCADE)
    const { error: err } = await supabase
      .from("visor3d_sistemes")
      .delete()
      .eq("id", id);

    if (err) throw err;

    setSistemes((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ── CRUD Instal·lacions ────────────────────────────────────────────────────

  const createInstallacio = useCallback(
    async (
      sistemaId: string,
      data: { nom: string; descripcio: string; codiInstallacio: string; embedUrl: string }
    ) => {
      const sistema = sistemes.find((s) => s.id === sistemaId);
      const ordre = sistema ? sistema.installacions.length : 0;

      const { data: row, error: err } = await supabase
        .from("visor3d_installacions")
        .insert({
          sistema_id: sistemaId,
          nom: data.nom.trim(),
          descripcio: data.descripcio.trim() || null,
          codi_installacio: data.codiInstallacio.trim() || null,
          embed_url: data.embedUrl.trim(),
          ordre,
        })
        .select()
        .single();

      if (err) throw err;

      const nova = rowToInstallacio(row as InstallacioRow);
      setSistemes((prev) =>
        prev.map((s) =>
          s.id === sistemaId
            ? { ...s, installacions: [...s.installacions, nova] }
            : s
        )
      );
      return nova;
    },
    [sistemes]
  );

  const updateInstallacio = useCallback(
    async (
      sistemaId: string,
      installacioId: string,
      data: { nom: string; descripcio: string; codiInstallacio: string; embedUrl: string }
    ) => {
      const { error: err } = await supabase
        .from("visor3d_installacions")
        .update({
          nom: data.nom.trim(),
          descripcio: data.descripcio.trim() || null,
          codi_installacio: data.codiInstallacio.trim() || null,
          embed_url: data.embedUrl.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", installacioId);

      if (err) throw err;

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
                      }
                    : i
                ),
              }
            : s
        )
      );
    },
    []
  );

  const deleteInstallacio = useCallback(
    async (sistemaId: string, installacioId: string) => {
      const { error: err } = await supabase
        .from("visor3d_installacions")
        .delete()
        .eq("id", installacioId);

      if (err) throw err;

      setSistemes((prev) =>
        prev.map((s) =>
          s.id === sistemaId
            ? { ...s, installacions: s.installacions.filter((i) => i.id !== installacioId) }
            : s
        )
      );
    },
    []
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
