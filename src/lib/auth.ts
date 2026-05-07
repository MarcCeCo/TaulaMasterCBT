// src/lib/auth.ts
import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type UserRole = "viewer" | "editor" | "admin";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  canView: boolean;
  canEdit: boolean;
  isAdmin: boolean;
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
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const canViewRole = (role: UserRole) =>
  ["viewer", "editor", "admin"].includes(role);

export const canEditRole = (role: UserRole) =>
  ["editor", "admin"].includes(role);

export const isAdminRole = (role: UserRole) => role === "admin";
