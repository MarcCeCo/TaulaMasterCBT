// src/components/auth/AuthProvider.tsx
import { useEffect, useState, type ReactNode } from "react";
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
    const { data } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role, allowed_views")
      .eq("id", u.id)
      .single();
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Llegeix la sessió de Supabase síncronament de localStorage per evitar el
 * flash de login en fer F5. Retorna true si hi ha una sessió guardada vàlida
 * (no expirada), false si no n'hi ha o ha expirat.
 */
function hasStoredSession(): boolean {
  try {
    // Supabase guarda la sessió sota la clau `sb-<projectRef>-auth-token`
    // Busquem qualsevol clau que comenci per "sb-" i acabi per "-auth-token"
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const expiresAt: number | undefined = parsed?.expires_at;
        if (expiresAt && expiresAt * 1000 > Date.now()) {
          return true;
        }
      }
    }
  } catch {
    // Si localStorage no és accessible (Safari private, etc.), ignorem
  }
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Si hi ha sessió guardada, comencem amb loading=true per no mostrar el login
  // fins que onAuthStateChange confirmi (o descarti) la sessió.
  const [loading, setLoading] = useState(() => hasStoredSession());

  useEffect(() => {
    // onAuthStateChange dispara INITIAL_SESSION immediatament amb la sessió
    // guardada a localStorage — és l'únic punt de veritat, no cal getSession
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const p = await fetchProfile(u);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // Timeout de seguretat per si onAuthStateChange no dispara mai
    const timeout = setTimeout(() => setLoading(false), 4000);

    return () => {
      subscription.unsubscribe();
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
        canSeeView: canSeeViewFn(profile),
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
