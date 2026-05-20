/**
 * useAuthLoad — hook compartit per al patró de càrrega amb auth
 *
 * Elimina la triplicació idèntica present a:
 *   - src/lib/dataStore.tsx
 *   - src/lib/useProjectes.tsx
 *   - src/hooks/useVisor3DSistemes.ts
 *
 * Gestiona:
 *   1. Espera que AuthProvider hagi acabat (authLoading = false i user != null)
 *   2. Obté token fresc de Supabase amb reintentos si cal
 *   3. loadingRef per evitar càrregues paral·leles
 *   4. needsReloadRef + visibilitychange per refrescar en tornar a la pestanya
 *   5. onAuthStateChange per SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED
 *
 * Ús:
 *   const { getFreshToken, setupAuthListeners } = useAuthLoad();
 *
 *   const load = useCallback(async () => {
 *     const token = await getFreshToken();
 *     if (!token) { ... return; }
 *     // ... fetch ...
 *   }, [getFreshToken]);
 *
 *   useEffect(() => setupAuthListeners({
 *     onLoad: load,
 *     onSignOut: () => setState([]),
 *   }), [load, setupAuthListeners]);
 */

import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export function useAuthLoad() {
  const { getToken, loading: authLoading, user } = useAuth();
  const loadingRef     = useRef(false);
  const needsReloadRef = useRef(false);

  /**
   * Retorna un token vàlid o "" si no és possible obtenir-ne un.
   * Inclou el mateix mecanisme de retry (fins a 3 s) que els stores antics.
   */
  const getFreshToken = useCallback(async (): Promise<string> => {
    let token = getToken();
    if (token) return token;

    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? "";
    if (token) return token;

    for (let i = 0; i < 6; i++) {
      await new Promise<void>((r) => setTimeout(r, 500));
      const { data: { session: s } } = await supabase.auth.getSession();
      token = s?.access_token ?? "";
      if (token) return token;
    }
    return "";
  }, [getToken]);

  /**
   * Indica si la càrrega s'ha d'iniciar (per al useEffect inicial).
   * auth ha acabat I hi ha usuari → true.
   */
  const shouldLoad = !authLoading && !!user;

  /**
   * Configura tots els listeners d'auth i visibilitat.
   * Retorna la funció de cleanup per al return del useEffect.
   *
   * @param onLoad     - funció que executa la càrrega de dades
   * @param onSignOut  - callback quan l'usuari tanca sessió (netejar estat)
   * @param guardRef   - ref booleà extern per a loadingRef (si el store el gestiona)
   */
  const setupAuthListeners = useCallback(
    ({
      onLoad,
      onSignOut,
    }: {
      onLoad: () => void;
      onSignOut: () => void;
    }) => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") {
          setTimeout(() => onLoad(), 50);
        }
        if (event === "SIGNED_OUT") {
          onSignOut();
          loadingRef.current = false;
        }
        if (event === "TOKEN_REFRESHED") {
          if (document.hidden) {
            needsReloadRef.current = true;
          } else {
            onLoad();
          }
        }
      });

      const handleVisibility = () => {
        if (!document.hidden && needsReloadRef.current) {
          needsReloadRef.current = false;
          onLoad();
        }
      };

      document.addEventListener("visibilitychange", handleVisibility);
      return () => {
        subscription.unsubscribe();
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    },
    [],
  );

  return {
    getFreshToken,
    shouldLoad,
    loadingRef,
    needsReloadRef,
    setupAuthListeners,
  };
}
