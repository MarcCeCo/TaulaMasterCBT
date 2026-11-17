// api/_lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client de Supabase amb la service role (només al servidor). Retorna null si
 * falta la configuració. Accepta SUPABASE_URL o, si no hi és, VITE_SUPABASE_URL
 * (que ja existeix a Vercel per al frontend).
 */
export function creaSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
