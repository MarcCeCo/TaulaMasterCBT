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
// Rep un AbortSignal opcional per cancel·lar la petició si l'usuari tanca
// sessió mentre el fetch és en vol. Evita que el resultat d'un perfil antic
// sobreescrigui l'estat net després d'un signOut.
async function fetchProfile(u: User, signal?: AbortSignal): Promise<UserProfile | null> {
  const authEmail = u.email ?? "";

  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role, allowed_views")
      .eq("id", u.id)
      .abortSignal(signal ?? null)
      .single();

    if (signal?.aborted) return null;

    if (error) {
      const { data: data2 } = await supabase
        .from("user_profiles")
        .select("id, email, full_name, role")
        .eq("id", u.id)
        .abortSignal(signal ?? null)
        .single();

      if (signal?.aborted) return null;

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

  // AbortController de la petició fetchProfile en vol.
  // Quan fem signOut o arriba un SIGNED_OUT, el cancel·lem per evitar
  // que el resultat d'un perfil antic sobreescrigui l'estat net.
  const profileFetchAbortRef = useRef<AbortController | null>(null);

  // Marca per recarregar el perfil quan l'usuari torna a la pàgina
  // (el token s'ha refrescat mentre estava en segon pla).
  const needsProfileRefreshRef = useRef(false);

  const getToken = useCallback(() => tokenRef.current, []);

  // ── Helper intern: carrega el perfil d'un usuari cancel·lant el fetch anterior ──
  const loadProfile = useCallback(async (u: User): Promise<UserProfile | null> => {
    // Cancel·la qualsevol fetch de perfil anterior en vol
    profileFetchAbortRef.current?.abort();
    const controller = new AbortController();
    profileFetchAbortRef.current = controller;

    const p = await fetchProfile(u, controller.signal);

    // Si hem signat fora mentre el fetch era en vol, no actualitzem res
    if (controller.signal.aborted) return null;

    profileFetchAbortRef.current = null;
    return p;
  }, []);

  // ── Efecte principal: sessió inicial + tots els events d'auth ────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      // ── 1. Sessió inicial (fora de /auth/callback) ───────────────────────
      if (!isAuthCallbackUrl()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        const u = session?.user ?? null;
        tokenRef.current = session?.access_token ?? "";
        setUser(u);

        if (u) {
          const p = await loadProfile(u);
          if (mounted && p !== null) setProfile(p);
        }
        if (mounted) setLoading(false);
      }

      // ── 2. Subscripció a canvis d'auth ───────────────────────────────────
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mounted) return;

          // Sempre actualitzem el token immediatament
          tokenRef.current = session?.access_token ?? "";

          // ── INITIAL_SESSION (només rellevant a /auth/callback) ───────────
          if (event === "INITIAL_SESSION") {
            if (isAuthCallbackUrl()) {
              const u2 = session?.user ?? null;
              setUser(u2);
              if (u2) {
                const p = await loadProfile(u2);
                if (mounted && p !== null) setProfile(p);
              }
              if (mounted) setLoading(false);
            }
            return;
          }

          // ── SIGNED_OUT ───────────────────────────────────────────────────
          // Cancel·la qualsevol fetch de perfil en vol i neteja tot l'estat.
          if (event === "SIGNED_OUT") {
            profileFetchAbortRef.current?.abort();
            profileFetchAbortRef.current = null;
            needsProfileRefreshRef.current = false;
            tokenRef.current = "";
            setUser(null);
            setProfile(null);
            if (mounted) setLoading(false);
            return;
          }

          // ── SIGNED_IN ────────────────────────────────────────────────────
          // Sempre carreguem el perfil del NOU usuari, cancel·lant l'anterior.
          if (event === "SIGNED_IN") {
            const u2 = session?.user ?? null;
            setUser(u2);
            if (u2) {
              const p = await loadProfile(u2);
              if (mounted && p !== null) setProfile(p);
            } else {
              setProfile(null);
            }
            if (mounted) setLoading(false);
            return;
          }

          // ── TOKEN_REFRESHED ───────────────────────────────────────────────
          // Supabase refresca el token automàticament (~50 min), fins i tot
          // en segon pla. Si la pàgina és oculta, ho diferim a visibilitychange.
          if (event === "TOKEN_REFRESHED") {
            if (document.hidden) {
              needsProfileRefreshRef.current = true;
            } else {
              const u2 = session?.user ?? null;
              if (u2) {
                const p = await loadProfile(u2);
                if (mounted && p !== null) setProfile(p);
              }
            }
            return;
          }

          // ── Qualsevol altre event (USER_UPDATED, PASSWORD_RECOVERY…) ─────
          const u2 = session?.user ?? null;
          setUser(u2);
          if (u2) {
            const p = await loadProfile(u2);
            if (mounted && p !== null) setProfile(p);
          } else {
            setProfile(null);
          }
          if (mounted) setLoading(false);
        }
      );

      // ── 3. visibilitychange: recarrega si el token es va refrescar en segon pla ──
      const handleVisibility = async () => {
        if (!mounted || document.hidden) return;
        if (!needsProfileRefreshRef.current) return;

        needsProfileRefreshRef.current = false;
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted || !session) return;

        tokenRef.current = session.access_token;
        const p = await loadProfile(session.user);
        if (mounted && p !== null) setProfile(p);
      };

      document.addEventListener("visibilitychange", handleVisibility);

      return () => {
        subscription.unsubscribe();
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    }

    const cleanup = init();
    // Fallback: si la inicialització triga més de 5s, desbloquegem la UI
    const timeout = setTimeout(() => { if (mounted) setLoading(false); }, 5000);

    return () => {
      mounted = false;
      profileFetchAbortRef.current?.abort();
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
  // Neteja l'estat i cancel·la el fetch de perfil en vol ABANS de cridar
  // Supabase. Evita que components fills facin crides amb token buit mentre
  // esperen l'event SIGNED_OUT asíncron.
  async function signOut() {
    profileFetchAbortRef.current?.abort();
    profileFetchAbortRef.current = null;
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
