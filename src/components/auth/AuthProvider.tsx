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
  const initializedRef        = useRef(false);
  const refreshingRef         = useRef(false);
  // Ref per accedir a user dins dels listeners sense afegir-lo a les deps
  const userRef               = useRef<User | null>(null);

  const refreshSession = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        setUser(null);
        setProfile(null);
        userRef.current = null;
      } else {
        const u = data.session.user;
        setUser(u);
        userRef.current = u;
        const p = await fetchProfile(u);
        setProfile(p);
      }
    } catch {
      // Sense xarxa: es reintentarà quan torni la connexió
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;

      if (!cancelled) {
        setUser(u);
        userRef.current = u;
        if (u) {
          const p = await fetchProfile(u);
          if (!cancelled) setProfile(p);
        }
        if (!cancelled) {
          setLoading(false);
          initializedRef.current = true;
        }
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "INITIAL_SESSION") return;

          if (event === "TOKEN_REFRESHED") {
            const u2 = session?.user ?? null;
            setUser(u2);
            userRef.current = u2;
            return;
          }

          const u2 = session?.user ?? null;
          setUser(u2);
          userRef.current = u2;
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

    // Reconnexió quan l'usuari torna a la pestanya
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && initializedRef.current) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session && userRef.current) {
            refreshSession();
          } else if (session) {
            const expiresAt  = session.expires_at ?? 0;
            const nowSecs    = Math.floor(Date.now() / 1000);
            if (expiresAt - nowSecs < 5 * 60) {
              refreshSession();
            }
          }
        });
      }
    };

    // Reconnexió quan torna la xarxa
    const handleOnline = () => {
      if (initializedRef.current) refreshSession();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.());
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSession]); // "user" fora de les deps — usem userRef per evitar bucle infinit

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    setUser(null);
    setProfile(null);
    userRef.current = null;
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
