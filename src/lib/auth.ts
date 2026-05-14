// src/lib/auth.ts
import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type UserRole = "viewer" | "editor" | "admin";

// Totes les seccions de l'aplicació que es poden controlar per permisos
export type AppView =
  | "equips"        // Taula Master
  | "gubimclass"    // GuBIMClass
  | "fields"        // Diccionari de camps
  | "revit"         // Exportació Revit
  | "projectes"     // Llistat de projectes
  | "rosmiman";     // Llistat d'equips Rosmiman

export const ALL_VIEWS: AppView[] = [
  "equips",
  "gubimclass",
  "fields",
  "revit",
  "projectes",
  "rosmiman",
];

export const VIEW_LABELS: Record<AppView, string> = {
  equips:     "Taula Master",
  gubimclass: "GuBIMClass",
  fields:     "Diccionari de camps",
  revit:      "Exportació Revit",
  projectes:  "Llistat de projectes",
  rosmiman:   "Llistat d'equips Rosmiman",
};

export const VIEW_GROUPS: { label: string; views: AppView[] }[] = [
  {
    label: "Equips i Taules",
    views: ["equips", "gubimclass", "fields", "revit"],
  },
  {
    label: "Projectes",
    views: ["projectes", "rosmiman"],
  },
];

// Permisos per secció: a més del rol global, cada vista pot tenir
// un rol mínim requerit. Si allowed_views és null → totes accessibles.
// El rol global (viewer/editor/admin) determina si pot editar o no.
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
  // Token en memòria — sempre síncron, mai bloqueja
  getToken: () => string;
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
  getToken: () => "",
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const canViewRole = (role: UserRole) =>
  ["viewer", "editor", "admin"].includes(role);

export const canEditRole = (role: UserRole) =>
  ["editor", "admin"].includes(role);

export const isAdminRole = (role: UserRole) => role === "admin";

export const canSeeViewFn =
  (profile: UserProfile | null, user: User | null = null) =>
  (view: AppView): boolean => {
    if (!profile && !user) return false;
    if (!profile && user) return true;
    if (!profile) return false;
    if (profile.role === "admin") return true;
    if (profile.allowed_views === null) return true;
    return profile.allowed_views.includes(view);
  };
