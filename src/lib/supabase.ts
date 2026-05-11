import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!url) throw new Error("Falta VITE_SUPABASE_URL");
if (!key) throw new Error("Falta VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(url, key, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false,
    storageKey:        "cbt-taula-master-auth",
  },
  global: {
    fetch: (input, init) => {
      const controller = new AbortController();
      // keepalive:true és incompatible amb AbortController i té límit de 64KB —
      // el combinar-los pot fer que la Promise quedi penjada indefinidament.
      const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout
      return fetch(input, { ...init, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
    },
  },
  db: {
    schema: "public",
  },
});
