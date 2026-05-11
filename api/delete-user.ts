// api/delete-user.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGIN = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:5173";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "DELETE") return res.status(405).end();

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

  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "Falta user_id" });

  // Evitar que l'admin s'elimini a si mateix
  if (user_id === user.id) {
    return res.status(400).json({ error: "No et pots eliminar a tu mateix" });
  }

  // Eliminar l'usuari de auth.users (cascada elimina també user_profiles per FK)
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
  if (deleteError) return res.status(400).json({ error: deleteError.message });

  return res.status(200).json({ success: true });
}
