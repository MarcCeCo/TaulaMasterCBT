import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!url) throw new Error("Falta VITE_SUPABASE_URL");
if (!key) throw new Error("Falta VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(url, key, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    // IMPORTANT: true perquè el client de Supabase llegeixi automàticament
    // els tokens del fragment #hash (implicit flow) O del ?code= (PKCE flow)
    // que arriben als enllaços de recuperació/invitació.
    detectSessionInUrl: true,
    // flowType "pkce" és el nou estàndard de Supabase (més segur).
    // Els projectes nous el porten per defecte. Amb "pkce" els tokens
    // arriben com a ?code= (query param), NO com a #access_token= (hash).
    flowType: "pkce",
    storageKey:         "cbt-taula-master-auth",
  },
  global: {
    fetch: (input, init) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      return fetch(input, { ...init, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
    },
  },
  db: {
    schema: "public",
  },
});
