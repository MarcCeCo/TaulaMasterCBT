// src/lib/supabase.ts  (versió actualitzada - eliminar headers manuals)
import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!url) throw new Error("Falta VITE_SUPABASE_URL");
if (!key) throw new Error("Falta VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,       // Mantenir sessió entre recàrregues
    autoRefreshToken: true,     // Renovar token automàticament
    detectSessionInUrl: true,   // Per magic links si s'usa en el futur
  },
});
