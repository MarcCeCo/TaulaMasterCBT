// src/components/auth/AuthProvider.tsx
import { useEffect, useState, useRef, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  AuthContext,
  canEditRole,
  canViewRole,
  isAdminRole,
  canSeeViewFn,
  type UserProfile,
} from "@/lib/auth";

async function fetchProfile(u: User): Promise<UserProfile | null> {
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
      return data2 ? { ...data2, allowed_views: null } as UserProfile : null;
    }

    return data ? { ...data, allowed_views: data.allowed_views ?? null } as UserProfile : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Ref per evitar fetchProfile concurrent si onAuthStateChange dispara dues vegades seguit
  const fetchingProfileRef    = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // ── Inicialització: llegim la sessió cached del localStorage ──────────────
    // getSession() NO fa cap petició de xarxa — llegeix del storage local.
    // El client Supabase (autoRefreshToken: true) ja s'encarrega de renovar el
    // token quan cal, sense cap lògica manual nostra.
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;

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

      // ── Listener d'events d'autenticació ─────────────────────────────────
      // Supabase dispara TOKEN_REFRESHED automàticament quan el token caduca.
      // SIGNED_IN: login o refresc inicial.
      // SIGNED_OUT: logout o sessió invàlida detectada pel servidor.
      // TOKEN_REFRESHED: el client ha renovat el token sol — no cal fer res més.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (cancelled) return;
          if (event === "INITIAL_SESSION") return;
          if (event === "TOKEN_REFRESHED") return; // el client ja ho gestiona

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
    // Fallback: si init() triga molt (xarxa lenta), desbloquegem la UI als 5s
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false); }, 5000);

    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.());
      clearTimeout(timeout);
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    setUser(null);
    setProfile(null);
    setLoading(false);
    await supabase.auth.signOut();
  }

  const role = profile?.role ?? "viewer";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        canView:    canViewRole(role),
        canEdit:    canEditRole(role),
        isAdmin:    isAdminRole(role),
        canSeeView: canSeeViewFn(profile, user),
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
