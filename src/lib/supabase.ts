import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!url) throw new Error("Falta VITE_SUPABASE_URL");
if (!key) throw new Error("Falta VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(url, key, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false, // no uses OAuth, evita bloqueig en F5
    storageKey:        "cbt-taula-master-auth",
  },
  global: {
    // keepalive manté la connexió HTTP viva entre peticions
    // → estalvia el handshake TCP+TLS en cada crida
    fetch: (input, init) =>
      fetch(input, { ...init, keepalive: true }),
  },
  db: {
    // Evita la petició extra que fa supabase-js per introspeccionar
    // el schema de la BD en environments de producció
    schema: "public",
  },
});
