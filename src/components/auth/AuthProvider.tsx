// src/components/auth/AuthProvider.tsx
import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  AuthContext,
  isAdminRole,
  canSeeViewFn,
  canEditViewFn,
  getSectionRoleFn,
  parseSectionPermissions,
  parseUserPermissionLevel,
  type UserProfile,
} from "@/lib/auth";

// ─── prefetchApsToken ────────────────────────────────────────────────────────
// Crida silenciosa a l'agent APS en segon pla quan un usuari inicia sessió.
// Si el token Autodesk caduca aviat, l'agent el refresca i el guarda a Supabase
// de forma transparent, sense bloquejar el login ni mostrar cap error a l'usuari.
// Utilitza keepalive: true per garantir que la petició acaba tot i si el component
// es desmunta durant la crida.

async function prefetchApsToken(): Promise<void> {
  const agentUrl = (import.meta.env.VITE_AGENT_URL as string | undefined)?.trim();
  if (!agentUrl) return; // agent no configurat → no fem res
  try {
    await fetch(`${agentUrl}/api/aps-token`, {
      method: "GET",
      keepalive: true,
      signal: AbortSignal.timeout(10_000), // màx 10s, no bloqueja
    });
  } catch {
    // Error silenciós — el token es refrescarà quan s'obri el visor
  }
}

// ─── fetchProfile ─────────────────────────────────────────────────────────────
async function fetchProfile(u: User): Promise<UserProfile | null> {
  const authEmail = u.email ?? "";
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role, allowed_views")
      .eq("id", u.id)
      .single();

    if (error) {
      const { data: data2 } = await supabase
        .from("user_profiles")
        .select("id, email, full_name, role")
        .eq("id", u.id)
        .single();
      return data2
        ? {
            ...data2,
            email:               data2.email || authEmail,
            role:                parseUserPermissionLevel(data2.role),
            section_permissions: null,
          } as UserProfile
        : null;
    }

    return data
      ? {
          id:                  data.id,
          email:               data.email || authEmail,
          full_name:           data.full_name ?? null,
          role:                parseUserPermissionLevel(data.role),
          section_permissions: parseSectionPermissions(data.allowed_views),
        } as UserProfile
      : null;
  } catch {
    return null;
  }
}

export function isAuthCallbackUrl(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/auth/callback");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const tokenRef = useRef<string>("");

  // Comptador de generació de sessió. Cada fetchProfile captura la generació
  // en que comença i, quan acaba, compara amb l'actual. Si no coincideix,
  // descarta el resultat (hi ha hagut un signOut entremig).
  const sessionGenRef = useRef<number>(0);

  // Quan signOut() ja ha incrementat la generació i netejat l'estat,
  // el SIGNED_OUT que Supabase dispara a continuació NO ha de tornar
  // a incrementar-la — si ho fes, el SIGNED_IN posterior capturaria
  // una generació diferent de la que hi ha quan el fetch acaba, i
  // descartaria el perfil del nou usuari.
  const signOutHandledRef = useRef<boolean>(false);

  // Marca per recarregar el perfil quan l'usuari torna a la pàgina
  // (token refrescat mentre estava en segon pla).
  const needsProfileRefreshRef = useRef(false);

  const getToken = useCallback(() => tokenRef.current, []);

  // ── Helper: carrega el perfil lligat a una generació de sessió ───────────────
  const loadProfile = useCallback(
    async (u: User, gen: number, onDone: (p: UserProfile | null) => void) => {
      const p = await fetchProfile(u);
      if (sessionGenRef.current !== gen) return; // sessió obsoleta, descarta
      onDone(p);
    },
    []
  );

  // ── Efecte principal ─────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      // ── 1. Sessió inicial ────────────────────────────────────────────────
      if (!isAuthCallbackUrl()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        const u = session?.user ?? null;
        tokenRef.current = session?.access_token ?? "";
        setUser(u);

        if (u) {
          const gen = sessionGenRef.current;
          await loadProfile(u, gen, (p) => {
            if (mounted) setProfile(p);
          });
        }
        if (mounted) setLoading(false);
      }

      // ── 2. Subscripció a canvis d'auth ───────────────────────────────────
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mounted) return;

          tokenRef.current = session?.access_token ?? "";

          // INITIAL_SESSION — només rellevant a /auth/callback
          if (event === "INITIAL_SESSION") {
            if (isAuthCallbackUrl()) {
              const u2 = session?.user ?? null;
              setUser(u2);
              if (u2) {
                const gen = sessionGenRef.current;
                await loadProfile(u2, gen, (p) => {
                  if (mounted) setProfile(p);
                });
              }
              if (mounted) setLoading(false);
            }
            return;
          }

          // SIGNED_OUT — només incrementem la generació si signOut() no ho
          // ha fet ja. Si ho hem fet nosaltres (signOutHandledRef = true),
          // simplement resetegem el flag i netegem l'estat sense incrementar.
          if (event === "SIGNED_OUT") {
            if (signOutHandledRef.current) {
              // signOut() ja ha incrementat la generació i netejat l'estat.
              // Només resetegem el flag perquè el proper signOut funcioni bé.
              signOutHandledRef.current = false;
            } else {
              // Sessió tancada externament (des d'una altra pestanya, expiració, etc.)
              sessionGenRef.current += 1;
            }
            needsProfileRefreshRef.current = false;
            tokenRef.current = "";
            if (mounted) {
              setUser(null);
              setProfile(null);
              setLoading(false);
            }
            return;
          }

          // SIGNED_IN — nou usuari. La generació ja és la correcta
          // (incrementada per signOut() o per SIGNED_OUT extern).
          if (event === "SIGNED_IN") {
            const u2 = session?.user ?? null;
            if (mounted) setUser(u2);
            if (u2) {
              const gen = sessionGenRef.current;
              await loadProfile(u2, gen, (p) => {
                if (mounted) setProfile(p);
              });
              // Refresca el token APS en segon pla — silenciós, no bloqueja el login
              prefetchApsToken();
            } else {
              if (mounted) setProfile(null);
            }
            if (mounted) setLoading(false);
            return;
          }

          // TOKEN_REFRESHED — Supabase refresca el token automàticament (~50 min).
          // Si la pàgina és oculta, ho diferim a visibilitychange.
          if (event === "TOKEN_REFRESHED") {
            if (document.hidden) {
              needsProfileRefreshRef.current = true;
            } else {
              const u2 = session?.user ?? null;
              if (u2) {
                const gen = sessionGenRef.current;
                await loadProfile(u2, gen, (p) => {
                  if (mounted) setProfile(p);
                });
              }
            }
            return;
          }

          // Qualsevol altre event (USER_UPDATED, PASSWORD_RECOVERY…)
          const u2 = session?.user ?? null;
          if (mounted) setUser(u2);
          if (u2) {
            const gen = sessionGenRef.current;
            await loadProfile(u2, gen, (p) => {
              if (mounted) setProfile(p);
            });
          } else {
            if (mounted) setProfile(null);
          }
          if (mounted) setLoading(false);
        }
      );

      // ── 3. visibilitychange ──────────────────────────────────────────────
      // Si el token s'ha refrescat mentre la pàgina era en segon pla,
      // recarreguem el perfil amb el token nou quan l'usuari torna.
      const handleVisibility = async () => {
        if (!mounted || document.hidden) return;
        if (!needsProfileRefreshRef.current) return;
        needsProfileRefreshRef.current = false;

        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted || !session) return;

        tokenRef.current = session.access_token;
        const gen = sessionGenRef.current;
        await loadProfile(session.user, gen, (p) => {
          if (mounted) setProfile(p);
        });
      };

      document.addEventListener("visibilitychange", handleVisibility);

      return () => {
        subscription.unsubscribe();
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    }

    const cleanup = init();
    const timeout = setTimeout(() => { if (mounted) setLoading(false); }, 5000);

    return () => {
      mounted = false;
      cleanup.then((fn) => fn?.());
      clearTimeout(timeout);
    };
  }, [loadProfile]);

  // ── signIn ───────────────────────────────────────────────────────────────────
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  // ── signOut ──────────────────────────────────────────────────────────────────
  // 1. Incrementa la generació immediatament → invalida qualsevol fetchProfile en vol
  // 2. Marca signOutHandledRef = true → el SIGNED_OUT que Supabase dispararà
  //    a continuació NO tornarà a incrementar la generació (evita el doble increment
  //    que feia que el perfil del nou usuari fos descartat)
  // 3. Neteja l'estat de la UI sense esperar l'event asíncron
  async function signOut() {
    sessionGenRef.current += 1;
    signOutHandledRef.current = true;
    needsProfileRefreshRef.current = false;
    tokenRef.current = "";
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin:        isAdminRole(profile?.role ?? "user"),
        getSectionRole: getSectionRoleFn(profile),
        canSeeView:     canSeeViewFn(profile, user),
        canEditView:    canEditViewFn(profile),
        getToken,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
