// src/lib/auth.ts
import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type UserRole = "viewer" | "editor" | "admin";

// Vistes disponibles a l'app
export type AppView = "equips" | "gubimclass" | "fields";

export const ALL_VIEWS: AppView[] = ["equips", "gubimclass", "fields"];

export const VIEW_LABELS: Record<AppView, string> = {
  equips: "Equips",
  gubimclass: "GuBIMClass",
  fields: "Diccionari de camps",
};

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  allowed_views: AppView[] | null; // null = accés a totes les vistes
}

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  canView: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  canSeeView: (view: AppView) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  canView: false,
  canEdit: false,
  isAdmin: false,
  canSeeView: () => true,
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const canViewRole = (role: UserRole) =>
  ["viewer", "editor", "admin"].includes(role);

export const canEditRole = (role: UserRole) =>
  ["editor", "admin"].includes(role);

export const isAdminRole = (role: UserRole) => role === "admin";

// null = totes les vistes; array buit = cap vista
export const canSeeViewFn =
  (profile: UserProfile | null) =>
  (view: AppView): boolean => {
    if (!profile) return false;
    // Admin sempre veu tot
    if (profile.role === "admin") return true;
    // null significa accés a totes les vistes
    if (profile.allowed_views === null) return true;
    return profile.allowed_views.includes(view);
  };
