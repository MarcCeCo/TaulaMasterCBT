// src/lib/auth.ts
// Context i hook per gestionar autenticació i rols

import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type UserRole = "viewer" | "editor" | "admin";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  // Helpers de permisos
  canView: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Guards de permisos
export const canViewRole = (role: UserRole) => true; // tots els rols veuen
export const canEditRole = (role: UserRole) => role === "editor" || role === "admin";
export const isAdminRole = (role: UserRole) => role === "admin";

export const ROLE_LABELS: Record<UserRole, string> = {
  viewer: "Visualització",
  editor: "Edició + Visualització",
  admin: "Administrador",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  viewer: "bg-blue-100 text-blue-700",
  editor: "bg-emerald-100 text-emerald-700",
  admin: "bg-purple-100 text-purple-700",
};
