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

async function fetchProfile(u: User): Promise<UserProfile | null> {
  // L'email de referència sempre és el de auth.users (mai pot ser null)
  const authEmail = u.email ?? "";

  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role, allowed_views")
      .eq("id", u.id)
      .single();

    if (error) {
      // Pot ser que la columna allowed_views no existeixi en algunes versions
      // del projecte. Reintenta sense ella.
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
  const fetchingProfileRef    = useRef(false);
  const tokenRef              = useRef<string>("");

  // FIX visibilitychange: quan el token es refresca mentre la pàgina és en
  // segon pla (minimitzada, altra pestanya, etc.), el client de Supabase pot
  // quedar en estat inconsistent. Marquem needsProfileRefresh = true i, quan
  // l'usuari torna a la pàgina, refresquem el perfil amb el token nou.
  // Mateix patró que dataStore.tsx, useProjectes.tsx i useVisor3DSistemes.ts.
  const needsProfileRefreshRef = useRef(false);

  const getToken = useCallback(() => tokenRef.current, []);

  // ── Càrrega inicial de sessió ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!isAuthCallbackUrl()) {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        tokenRef.current = session?.access_token ?? "";

        if (!cancelled) {
          setUser(u);
          if (u && !fetchingProfileRef.current) {
            fetchingProfileRef.current = true;
            const p = await fetchProfile(u);
            fetchingProfileRef.current = false;
            if (!cancelled) setProfile(p);
          }
          if (!cancelled) setLoading(false);
        }
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (cancelled) return;

          // Sempre actualitzem el tokenRef immediatament, sigui quin sigui
          // l'event, perquè qualsevol crida posterior necessita el token fresc.
          tokenRef.current = session?.access_token ?? "";

          if (event === "INITIAL_SESSION") {
            if (isAuthCallbackUrl()) {
              const u2 = session?.user ?? null;
              setUser(u2);
              if (u2 && !fetchingProfileRef.current) {
                fetchingProfileRef.current = true;
                const p = await fetchProfile(u2);
                fetchingProfileRef.current = false;
                if (!cancelled) setProfile(p);
              }
              if (!cancelled) setLoading(false);
            }
            return;
          }

          // FIX TOKEN_REFRESHED: Supabase refresca el token automàticament
          // cada ~50 min, fins i tot quan la pàgina és en segon pla.
          // Quan això passa i la pàgina és visible, refresquem el perfil
          // (el token ja ha canviat al tokenRef de dalt).
          // Si la pàgina és oculta, ho marquem per fer-ho quan torni.
          if (event === "TOKEN_REFRESHED") {
            if (document.hidden) {
              needsProfileRefreshRef.current = true;
            } else {
              // Refresquem el perfil amb el token nou per mantenir la sessió activa
              const u2 = session?.user ?? null;
              if (u2 && !fetchingProfileRef.current) {
                fetchingProfileRef.current = true;
                const p = await fetchProfile(u2);
                fetchingProfileRef.current = false;
                if (!cancelled) setProfile(p);
              }
            }
            return;
          }

          if (event === "SIGNED_IN") {
            const u2 = session?.user ?? null;
            setUser(u2);
            if (u2 && !fetchingProfileRef.current) {
              fetchingProfileRef.current = true;
              const p = await fetchProfile(u2);
              fetchingProfileRef.current = false;
              if (!cancelled) setProfile(p);
            }
            if (!cancelled) setLoading(false);
            return;
          }

          if (event === "SIGNED_OUT") {
            setUser(null);
            setProfile(null);
            tokenRef.current = "";
            needsProfileRefreshRef.current = false;
            if (!cancelled) setLoading(false);
            return;
          }

          // Qualsevol altre event (USER_UPDATED, PASSWORD_RECOVERY, etc.)
          const u2 = session?.user ?? null;
          setUser(u2);
          if (u2) {
            if (!fetchingProfileRef.current) {
              fetchingProfileRef.current = true;
              const p = await fetchProfile(u2);
              fetchingProfileRef.current = false;
              if (!cancelled) setProfile(p);
            }
          } else {
            setProfile(null);
          }
          if (!cancelled) setLoading(false);
        }
      );

      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    }

    const cleanup = init();
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false); }, 5000);

    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.());
      clearTimeout(timeout);
    };
  }, []);

  // FIX visibilitychange: quan l'usuari torna a la pàgina després que el token
  // s'hagués refrescat en segon pla, refresquem el perfil amb el token nou.
  // Sense això, la pàgina queda congelada o en estat "pensant" fins a timeout.
  useEffect(() => {
    const handleVisibility = async () => {
      if (!document.hidden && needsProfileRefreshRef.current) {
        needsProfileRefreshRef.current = false;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          tokenRef.current = session.access_token;
          if (session.user && !fetchingProfileRef.current) {
            fetchingProfileRef.current = true;
            const p = await fetchProfile(session.user);
            fetchingProfileRef.current = false;
            setProfile(p);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  // FIX signOut: neteja l'estat immediatament abans de cridar Supabase,
  // evita que components fills facin crides a l'API amb token buit
  // mentre esperen l'event onAuthStateChange.
  async function signOut() {
    setUser(null);
    setProfile(null);
    tokenRef.current = "";
    needsProfileRefreshRef.current = false;
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
