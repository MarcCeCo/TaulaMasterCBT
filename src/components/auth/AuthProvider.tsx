// src/components/auth/AuthProvider.tsx
import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  AuthContext,
  isAdminRole,
  canSeeViewFn,
  canEditViewFn,
  getSectionRoleFn,
  parseSectionPermissions,
  parseUserPermissionLevel,
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
      return data2
        ? {
            ...data2,
            role: parseUserPermissionLevel(data2.role),
            section_permissions: null,
          } as UserProfile
        : null;
    }

    return data
      ? {
          id:                  data.id,
          email:               data.email,
          full_name:           data.full_name ?? null,
          role:                parseUserPermissionLevel(data.role),
          section_permissions: parseSectionPermissions(data.allowed_views),
        } as UserProfile
      : null;
  } catch {
    return null;
  }
}

export function isAuthCallbackUrl(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/auth/callback");
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

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (cancelled) return;

          tokenRef.current = session?.access_token ?? "";

          if (event === "INITIAL_SESSION") {
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

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin:        isAdminRole(profile?.role ?? "user"),
        getSectionRole: getSectionRoleFn(profile),
        canSeeView:     canSeeViewFn(profile, user),
        canEditView:    canEditViewFn(profile),
        getToken,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
