// src/lib/auth.ts
import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type UserRole = "viewer" | "editor" | "admin";

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

/**
 * Retorna true si l'usuari pot veure la vista donada.
 *
 * Lògica de fallback segura:
 * - Si no hi ha perfil PERÒ hi ha user (perfil encara carregant o error de BD):
 *   retorna TRUE per defecte — mai bloquejem per error tècnic.
 * - Si no hi ha ni user ni perfil: retorna false (no autenticat).
 * - Admin: sempre true.
 * - allowed_views === null: true (accés total, comportament per defecte).
 * - allowed_views array: comprova si la vista hi és.
 */
export const canSeeViewFn =
  (profile: UserProfile | null, user: User | null = null) =>
  (view: AppView): boolean => {
    // No autenticat
    if (!profile && !user) return false;
    // Autenticat però perfil no carregat (error de BD, columna inexistent, etc.)
    // → permetem accés per no bloquejar per raons tècniques
    if (!profile && user) return true;
    if (!profile) return false;
    // Admin veu tot sempre
    if (profile.role === "admin") return true;
    // null = totes les vistes
    if (profile.allowed_views === null) return true;
    return profile.allowed_views.includes(view);
  };
