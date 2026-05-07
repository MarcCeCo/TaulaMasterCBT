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
    // Intentem primer amb allowed_views
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role, allowed_views")
      .eq("id", u.id)
      .single();

    if (error) {
      // Si falla (p.ex. la columna allowed_views no existeix encara a la BD),
      // fem fallback sense aquesta columna
      const { data: data2 } = await supabase
        .from("user_profiles")
        .select("id, email, full_name, role")
        .eq("id", u.id)
        .single();
      if (data2) return { ...data2, allowed_views: null } as UserProfile;
      return null;
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

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);

      if (u) {
        // Esperem el perfil ABANS de treure el loading
        const p = await fetchProfile(u);
        setProfile(p);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    const timeout = setTimeout(() => setLoading(false), 5000);

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
        canSeeView: canSeeViewFn(profile, user),
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
