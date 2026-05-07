// src/components/auth/AuthProvider.tsx
// Proveïdor global d'autenticació

import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  AuthContext,
  canEditRole,
  canViewRole,
  isAdminRole,
  type UserProfile,
} from "@/lib/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(u: User) {
    const { data } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role")
      .eq("id", u.id)
      .single();
    setProfile(data ?? null);
  }

  useEffect(() => {
    // Sessió inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Escoltar canvis de sessió
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          await loadProfile(u);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
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
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
