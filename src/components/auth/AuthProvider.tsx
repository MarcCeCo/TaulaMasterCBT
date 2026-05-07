// src/components/auth/AuthProvider.tsx
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

async function fetchProfile(u: User): Promise<UserProfile | null> {
  try {
    const { data } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role")
      .eq("id", u.id)
      .single();
    return data ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChange dispara INITIAL_SESSION immediatament amb la sessió
    // guardada a localStorage — és l'únic punt de veritat, no cal getSession
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          const p = await fetchProfile(u);
          setProfile(p);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

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
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
