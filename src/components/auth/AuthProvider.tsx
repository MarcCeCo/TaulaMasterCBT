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
      // Fallback si la columna allowed_views no existeix encara
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Evitem que onAuthStateChange sobreescrigui el resultat de getSession
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Llegim la sessió actual de forma síncrona/directa
      //    getSession() llegeix de localStorage i retorna immediatament
      //    si la sessió és vàlida, sense fer cap petició de xarxa.
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;

      if (!cancelled) {
        setUser(u);
        if (u) {
          const p = await fetchProfile(u);
          if (!cancelled) setProfile(p);
        }
        if (!cancelled) {
          setLoading(false);
          initializedRef.current = true;
        }
      }

      // 2. Escoltem canvis posteriors (login, logout, renovació de token)
      //    però ignorem INITIAL_SESSION perquè ja l'hem gestionat a dalt.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          // Ignorem INITIAL_SESSION — ja gestionat per getSession()
          if (event === "INITIAL_SESSION") return;

          const u2 = session?.user ?? null;
          setUser(u2);
          if (u2) {
            const p = await fetchProfile(u2);
            setProfile(p);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }
      );

      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    }

    const cleanup = init();
    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.());
      clearTimeout(timeout);
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange amb event SIGNED_IN actualitzarà user + profile
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
        canView: canViewRole(role),
        canEdit: canEditRole(role),
        isAdmin: isAdminRole(role),
        canSeeView: canSeeViewFn(profile, user),
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
