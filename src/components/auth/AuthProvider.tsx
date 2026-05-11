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

  // ── Refresca la sessió de forma segura (evita crides paral·leles) ─────────
  const refreshSession = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        // Token irrecuperable → tanquem sessió neta
        setUser(null);
        setProfile(null);
      } else {
        const u = data.session.user;
        setUser(u);
        const p = await fetchProfile(u);
        setProfile(p);
      }
    } catch {
      // Sense xarxa: no fem res, ja es reintentarà quan torni la connexió
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

          // TOKEN_REFRESHED → actualitzem usuari silenciosament sense re-fetch de perfil
          if (event === "TOKEN_REFRESHED") {
            const u2 = session?.user ?? null;
            setUser(u2);
            return;
          }

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

    // ── Reconnexió quan l'usuari torna a la pestanya ──────────────────────
    // Quan el document torna a ser visible (canvi de pestanya, desminimitza),
    // comprovem si el token segueix sent vàlid. Si ha expirat mentre estava
    // en segon pla, el renovem sense que l'usuari hagi de recarregar.
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && initializedRef.current) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session && user) {
            // Sessió perduda → intentem refrescar
            refreshSession();
          } else if (session) {
            // Sessió OK → comprovem si el token caduca aviat (< 5 min)
            const expiresAt = session.expires_at ?? 0;
            const nowSecs   = Math.floor(Date.now() / 1000);
            const marginSecs = 5 * 60; // 5 minuts
            if (expiresAt - nowSecs < marginSecs) {
              refreshSession();
            }
          }
        });
      }
    };

    // ── Reconnexió quan torna la xarxa ────────────────────────────────────
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
  }, [refreshSession, user]);

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
