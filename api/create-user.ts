// api/create-user.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGIN = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:5173";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

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

  // Verificar sessió del admin que fa la crida
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

  const { email, full_name, role, allowed_views } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: "El correu i el rol són obligatoris" });
  }
  if (!["viewer", "editor", "admin"].includes(role)) {
    return res.status(400).json({ error: "Rol no vàlid" });
  }

  // Convidar l'usuari per correu: Supabase enviarà un email amb l'enllaç
  // per establir la contrasenya. No cal que l'admin la creï.
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      data: { full_name, role },
      redirectTo: process.env.APP_URL ?? "https://taula-master-cbt.vercel.app",
    }
  );

  if (inviteError) return res.status(400).json({ error: inviteError.message });

  const newUserId = inviteData.user?.id;
  if (!newUserId) {
    return res.status(500).json({ error: "No s'ha pogut obtenir l'ID del nou usuari" });
  }

  // Actualitzar el perfil amb rol, nom, vistes i qui ha fet la invitació
  const { error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .update({
      role,
      full_name: full_name ?? null,
      created_by: user.id,
      // null = accés a totes les vistes
      allowed_views: allowed_views ?? null,
    })
    .eq("id", newUserId);

  if (profileError) {
    // L'usuari s'ha creat però el perfil no s'ha actualitzat.
    // Retornem advertència però no error crític.
    console.error("Error actualitzant perfil:", profileError);
    return res.status(200).json({
      success: true,
      user_id: newUserId,
      warning: "Usuari creat però el perfil no s'ha pogut actualitzar completament",
    });
  }

  return res.status(200).json({ success: true, user_id: newUserId });
}
