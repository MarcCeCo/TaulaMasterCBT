// api/list-users.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGIN = process.env.APP_URL ?? "http://localhost:5173";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).end();

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const supabaseUser = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.authorization ?? "" } } }
  );

  // Verificar sessió
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return res.status(401).json({ error: "Sessió invàlida" });

  // Verificar que és admin
  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return res.status(403).json({ error: "Necessites permisos d'administrador" });
  }

  // Obtenir tots els perfils
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("user_profiles")
    .select("id, email, full_name, role, allowed_views, organisation")
    .order("organisation", { nullsFirst: true })
    .order("email");

  if (profilesError) return res.status(500).json({ error: profilesError.message });

  // Si algun perfil no té email (la columna pot ser null si no hi ha trigger),
  // completem amb les dades de auth.users via l'Admin API.
  const missingEmailIds = (profiles ?? [])
    .filter((p: any) => !p.email)
    .map((p: any) => p.id);

  const authEmailMap: Record<string, string> = {};

  if (missingEmailIds.length > 0) {
    // listUsers amb paginació (màx 1000 per pàgina)
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (authError || !authData) break;
      for (const u of authData.users) {
        if (u.email) authEmailMap[u.id] = u.email;
      }
      hasMore = authData.users.length === 1000;
      page++;
    }
  }

  const users = (profiles ?? []).map((p: any) => ({
    id:            p.id,
    email:         p.email || authEmailMap[p.id] || "",
    full_name:     p.full_name ?? null,
    role:          p.role,
    allowed_views: p.allowed_views ?? null,
    organisation:  p.organisation ?? null,
  }));

  return res.status(200).json({ users });
}
