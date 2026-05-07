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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(u: User) {
    try {
      const { data } = await supabase
        .from("user_profiles")
        .select("id, email, full_name, role")
        .eq("id", u.id)
        .single();
      setProfile(data ?? null);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    // Timeout de seguretat: si getSession tarda més de 5s, desbloqueja
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      clearTimeout(timeout);
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        await loadProfile(u);
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (cancelled) return;
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

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
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
