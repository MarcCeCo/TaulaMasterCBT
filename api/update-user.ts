// api/update-user.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGIN = process.env.APP_URL ?? "http://localhost:5173";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "PATCH, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PATCH") return res.status(405).end();

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

  // Verificar sessió del qui fa la crida
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return res.status(401).json({ error: "Sessió invàlida" });

  // Verificar que és admin
  const { data: callerProfile } = await supabaseAdmin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") {
    return res.status(403).json({ error: "Necessites permisos d'administrador" });
  }

  const { user_id, role, allowed_views } = req.body;

  if (!user_id) return res.status(400).json({ error: "user_id és obligatori" });
  // Ara el rol només pot ser "user" o "admin"
  if (!role || !["user", "admin"].includes(role)) {
    return res.status(400).json({ error: "Rol no vàlid. Valors acceptats: user, admin" });
  }

  // No es pot canviar el propi rol
  if (user_id === user.id) {
    return res.status(400).json({ error: "No pots modificar el teu propi rol" });
  }

  const { error } = await supabaseAdmin
    .from("user_profiles")
    .update({
      role,
      // null = accés complet (admin); objecte = permisos per secció (user)
      allowed_views: role === "admin" ? null : (allowed_views ?? null),
    })
    .eq("id", user_id);

  if (error) {
    console.error("Error actualitzant usuari:", error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
}
