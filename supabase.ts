import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!url) throw new Error("Falta VITE_SUPABASE_URL");
if (!key) throw new Error("Falta VITE_SUPABASE_ANON_KEY");

// Client base sense fetch personalitzat — s'usa per a refreshSession
const _baseClient = createClient(url, key, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false,
    storageKey:        "cbt-taula-master-auth",
  },
});

export const supabase = createClient(url, key, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: false,
    storageKey:        "cbt-taula-master-auth",
  },
  global: {
    fetch: async (input, init) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(input, { ...init, keepalive: true, signal: controller.signal });

        // Si rebem 401, el token ha caducat — forcem renovació i reintent
        if (res.status === 401) {
          const { data } = await _baseClient.auth.refreshSession();
          if (data?.session) {
            const newController = new AbortController();
            const newTimeout = setTimeout(() => newController.abort(), 15000);
            try {
              return await fetch(input, { ...init, keepalive: true, signal: newController.signal });
            } finally {
              clearTimeout(newTimeout);
            }
          }
        }
        return res;
      } finally {
        clearTimeout(timeout);
      }
    },
  },
  db: {
    schema: "public",
  },
});
