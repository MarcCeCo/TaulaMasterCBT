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

  // "Generació" de sessió activa. S'incrementa cada vegada que fem signOut.
  // Qualsevol fetchProfile asíncron que hagi començat en una generació anterior
  // descarta el resultat quan arriba, perquè compara la seva generació amb
  // la generació actual. Això és més robust que AbortController perquè
  // el client de Supabase no sempre respecta l'abort.
  const sessionGenRef = useRef<number>(0);

  // Marca per recarregar el perfil quan l'usuari torna a la pàgina
  // (token refrescat mentre estava en segon pla).
  const needsProfileRefreshRef = useRef(false);

  const getToken = useCallback(() => tokenRef.current, []);

  // ── Helper: carrega el perfil lligat a una generació de sessió ───────────────
  // Si la generació ha canviat quan el fetch acaba (p. ex. signOut entremig),
  // descarta el resultat silenciosament.
  const loadProfile = useCallback(
    async (u: User, gen: number, setProfileFn: (p: UserProfile | null) => void) => {
      const p = await fetchProfile(u);
      // Descarta si ja no correspon a la sessió activa
      if (sessionGenRef.current !== gen) return;
      setProfileFn(p);
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

          // INITIAL_SESSION — només a /auth/callback
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

          // SIGNED_OUT — incrementa la generació per invalidar qualsevol
          // fetchProfile en vol, i neteja tot l'estat.
          if (event === "SIGNED_OUT") {
            sessionGenRef.current += 1;
            needsProfileRefreshRef.current = false;
            tokenRef.current = "";
            if (mounted) {
              setUser(null);
              setProfile(null);
              setLoading(false);
            }
            return;
          }

          // SIGNED_IN — nou usuari. Usem la generació ACTUAL (ja incrementada
          // pel SIGNED_OUT anterior si n'hi va haver un).
          if (event === "SIGNED_IN") {
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
            return;
          }

          // TOKEN_REFRESHED — el token es refresca automàticament (~50 min).
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
  // Incrementa la generació IMMEDIATAMENT per invalidar qualsevol fetchProfile
  // en vol, i neteja l'estat de la UI sense esperar l'event SIGNED_OUT asíncron.
  // El SIGNED_OUT que arribarà després tornarà a incrementar la generació (és
  // idempotent perquè ja no hi haurà cap fetch en vol amb la nova generació).
  async function signOut() {
    sessionGenRef.current += 1;
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
