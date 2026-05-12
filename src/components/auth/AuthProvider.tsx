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

// Detecta si la URL actual correspon a un callback d'autenticació de Supabase.
// Supabase pot enviar tokens de dues maneres:
//   - Implicit flow (antic): #access_token=...&type=recovery
//   - PKCE flow (nou, per defecte): ?code=...  (sense type explícit a la URL)
// En ambdós casos, la pàgina de destinació és /auth/callback.
export function isAuthCallbackUrl(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  return path.startsWith("/auth/callback");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingProfileRef    = useRef(false);
  const tokenRef              = useRef<string>("");

  const getToken = useCallback(() => tokenRef.current, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Si estem a /auth/callback, NO cridem getSession() aquí.
      // Supabase bescanviarà el codi/token automàticament i dispararà
      // onAuthStateChange. Cridar getSession() primer podria interferir
      // amb el flux PKCE i netejar el ?code= abans que s'hagi bescanviat.
      if (!isAuthCallbackUrl()) {
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
      }
      // Si som a /auth/callback, deixem loading=true fins que
      // onAuthStateChange ens indiqui que el token s'ha processat.

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (cancelled) return;

          tokenRef.current = session?.access_token ?? "";

          if (event === "INITIAL_SESSION") {
            // Quan som a /auth/callback, INITIAL_SESSION pot arribar
            // amb la sessió del recovery/invite ja activa. L'aprofitem.
            if (isAuthCallbackUrl()) {
              const u2 = session?.user ?? null;
              setUser(u2);
              if (u2 && !fetchingProfileRef.current) {
                fetchingProfileRef.current = true;
                const p = await fetchProfile(u2);
                fetchingProfileRef.current = false;
                if (!cancelled) setProfile(p);
              }
              if (!cancelled) setLoading(false);
            }
            return;
          }

          // USER_UPDATED: Supabase l'emet quan updateUser() canvia la contrasenya.
          // Si estem a /auth/callback, IGNOREM aquest event: el component
          // UpdatePasswordPage ja gestiona el signOut i el redirect via useEffect.
          // Processar USER_UPDATED aquí causaria un re-render que podria desmuntar
          // UpdatePasswordPage i matar el seu flux de redirecció.
          if (event === "USER_UPDATED" && isAuthCallbackUrl()) {
            tokenRef.current = session?.access_token ?? "";
            return;
          }

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
            setUser(null);
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
