// src/lib/auth.ts
import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

// Únic nivell d'accés "global": usuari normal o administrador.
// No hi ha cap "rol global" que determini si es pot veure o editar —
// això s'configura finestra per finestra mitjançant SectionPermissions.
export type UserPermissionLevel = "user" | "admin";

// Rol per secció individual
export type SectionRole = "none" | "viewer" | "editor";

// Totes les seccions de l'aplicació
export type AppView =
  | "equips"      // Taula Master
  | "gubimclass"  // GuBIMClass
  | "fields"      // Diccionari de camps
  | "revit"       // Exportació Revit
  | "projectes"   // Llistat de projectes
  | "rosmiman";   // Llistat d'equips Rosmiman

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

export const VIEW_ICONS: Record<AppView, string> = {
  equips:     "📦",
  gubimclass: "🌿",
  fields:     "⚙️",
  revit:      "🏗️",
  projectes:  "📁",
  rosmiman:   "📋",
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

// Permisos per secció: cada secció té el seu propi rol independent
export type SectionPermissions = Record<AppView, SectionRole>;

export const DEFAULT_SECTION_PERMISSIONS: SectionPermissions = {
  equips:     "none",
  gubimclass: "none",
  fields:     "none",
  revit:      "none",
  projectes:  "none",
  rosmiman:   "none",
};

export const FULL_SECTION_PERMISSIONS: SectionPermissions = {
  equips:     "editor",
  gubimclass: "editor",
  fields:     "editor",
  revit:      "editor",
  projectes:  "editor",
  rosmiman:   "editor",
};

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  // "admin" té accés complet; "user" té els permisos definits a section_permissions
  role: UserPermissionLevel;
  // Guardat com a JSON al camp allowed_views de Supabase.
  // null = accés complet (per compatibilitat amb admins migrats)
  section_permissions: SectionPermissions | null;
}

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  getSectionRole: (view: AppView) => SectionRole | "admin";
  canSeeView: (view: AppView) => boolean;
  canEditView: (view: AppView) => boolean;
  getToken: () => string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  getSectionRole: () => "none",
  canSeeView: () => false,
  canEditView: () => false,
  getToken: () => "",
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const isAdminRole = (role: UserPermissionLevel) => role === "admin";

// Normalitza el camp `role` de Supabase al nou UserPermissionLevel.
// Els valors legacy "viewer" i "editor" es mapegen a "user".
export function parseUserPermissionLevel(raw: any): UserPermissionLevel {
  if (raw === "admin") return "admin";
  return "user";
}

// Converteix el camp allowed_views de Supabase al format SectionPermissions.
// Suporta el format antic (array AppView[]) i el nou (objecte { view: role }).
export function parseSectionPermissions(raw: any): SectionPermissions | null {
  if (raw === null || raw === undefined) return null;

  // Nou format: objecte { equips: "editor", ... }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const perms = { ...DEFAULT_SECTION_PERMISSIONS };
    for (const view of ALL_VIEWS) {
      if (["none", "viewer", "editor"].includes(raw[view])) {
        perms[view as AppView] = raw[view];
      }
    }
    return perms;
  }

  // Format antic: array AppView[] → convertim a "viewer" per compatibilitat
  if (Array.isArray(raw)) {
    const perms: SectionPermissions = {
      equips: "none", gubimclass: "none", fields: "none",
      revit: "none", projectes: "none", rosmiman: "none",
    };
    for (const view of raw) {
      if (ALL_VIEWS.includes(view)) perms[view as AppView] = "viewer";
    }
    return perms;
  }

  return { ...DEFAULT_SECTION_PERMISSIONS };
}

export const getSectionRoleFn =
  (profile: UserProfile | null) =>
  (view: AppView): SectionRole | "admin" => {
    if (!profile) return "none";
    if (profile.role === "admin") return "admin";
    if (profile.section_permissions === null) return "admin";
    return profile.section_permissions[view] ?? "none";
  };

export const canSeeViewFn =
  (profile: UserProfile | null, user: User | null = null) =>
  (view: AppView): boolean => {
    if (!profile && !user) return false;
    if (!profile && user) return true;
    if (!profile) return false;
    if (profile.role === "admin") return true;
    if (profile.section_permissions === null) return true;
    return profile.section_permissions[view] !== "none";
  };

export const canEditViewFn =
  (profile: UserProfile | null) =>
  (view: AppView): boolean => {
    if (!profile) return false;
    if (profile.role === "admin") return true;
    if (profile.section_permissions === null) return true;
    return profile.section_permissions[view] === "editor";
  };
