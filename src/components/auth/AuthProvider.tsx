// src/components/auth/AuthProvider.tsx
import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
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
  const fetchingProfileRef    = useRef(false);
  // Token guardat en memòria — s'actualitza via onAuthStateChange
  // Llegir-lo és SÍNCRON i mai bloqueja, a diferència de getSession()
  const tokenRef              = useRef<string>("");

  const getToken = useCallback(() => tokenRef.current, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Inicialització: llegim la sessió del localStorage (operació local, no xarxa)
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

      // onAuthStateChange és l'únic lloc on actualitzem el token.
      // Supabase dispara TOKEN_REFRESHED automàticament quan el token caduca
      // (inclús quan tornem a una pestanya inactiva) — aquí el capturem
      // i actualitzem tokenRef sense cap lògica manual addicional.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (cancelled) return;

          // Sempre actualitzem el token en memòria, sigui quin sigui l'event
          tokenRef.current = session?.access_token ?? "";

          if (event === "INITIAL_SESSION") return;

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

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    tokenRef.current = "";
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
        getToken,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
