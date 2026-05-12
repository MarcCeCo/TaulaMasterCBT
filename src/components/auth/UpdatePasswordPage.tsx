// src/components/auth/UpdatePasswordPage.tsx
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import logo from "@/assets/Simbol_Web2.png";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  type: "recovery" | "invite";
}

export function UpdatePasswordPage({ type }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const title = type === "invite" ? "Crea la teva contrasenya" : "Nova contrasenya";
  const subtitle = type === "invite"
    ? "Benvingut/da! Estableix una contrasenya per accedir a la plataforma."
    : "Introdueix la nova contrasenya per al teu compte.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) { setError("La contrasenya ha de tenir almenys 8 caràcters."); return; }
    if (password !== confirm) { setError("Les contrasenyes no coincideixen."); return; }

    setLoading(true);

    try {
      // Usem fetch directe a la REST API de Supabase Auth en lloc de
      // supabase.auth.updateUser(). Motiu: updateUser() emet USER_UPDATED
      // via el canal intern de Supabase, cosa que dispara onAuthStateChange
      // a l'AuthProvider → re-renders → desmuntatge del component → el flux
      // async queda orfè i el redirect mai s'executa.
      //
      // Amb fetch directe: cap event intern, cap re-render, cap desmuntatge.
      // És el mateix patró que usa DataStore i UserManagerDialog per evitar
      // desconnexions quan es canvia de pestanya.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      if (!token) {
        setError("Sessió no disponible. Torna a obrir l'enllaç del correu.");
        setLoading(false);
        return;
      }

      const url = (import.meta.env.VITE_SUPABASE_URL as string).trim();
      const res = await fetch(`${url}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": (import.meta.env.VITE_SUPABASE_ANON_KEY as string).trim(),
        },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? `Error ${res.status} actualitzant la contrasenya`);
        setLoading(false);
        return;
      }

      // Contrasenya canviada correctament. Ara tanquem sessió i redirigim.
      // Fem signOut també via fetch directe per no disparar més events.
      setDone(true);

      try {
        await fetch(`${url}/auth/v1/logout?scope=global`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "apikey": (import.meta.env.VITE_SUPABASE_ANON_KEY as string).trim(),
          },
        });
      } catch {
        // Ignorem: la contrasenya ja ha canviat, la sessió és invàlida.
      }

      localStorage.removeItem("cbt-taula-master-auth");

      // Reload dur: força AuthProvider a arrencar des de zero sense sessió.
      window.location.replace("/");

    } catch (err: any) {
      setError(err?.message ?? "Error de xarxa. Torna-ho a intentar.");
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #f0f9fa 0%, #e0f4f6 40%, #f5f7f8 100%)" }}
    >
      <div aria-hidden style={{ position: "fixed", top: "-120px", right: "-120px", width: "420px", height: "420px", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,153,168,0.13) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", bottom: "-80px", left: "-80px", width: "300px", height: "300px", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,110,122,0.09) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: "400px", margin: "0 16px", background: "rgba(255,255,255,0.88)", backdropFilter: "blur(16px)", borderRadius: "20px", boxShadow: "0 4px 6px rgba(0,110,122,0.06), 0 20px 40px rgba(0,110,122,0.10), 0 0 0 1px rgba(0,153,168,0.08)", padding: "44px 40px 40px", position: "relative" }}>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
          <div style={{ width: "72px", height: "72px", borderRadius: "18px", background: "linear-gradient(135deg, rgba(0,153,168,0.12), rgba(0,110,122,0.08))", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(0,153,168,0.18)", boxShadow: "0 2px 12px rgba(0,153,168,0.12)" }}>
            <img src={logo} alt="CBT" style={{ width: "52px", height: "52px", objectFit: "contain" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "#0099A8", opacity: 0.7, marginBottom: "4px" }}>Consorci Besòs · Tordera</p>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#004F58", letterSpacing: "-0.01em" }}>{title}</h1>
            <p style={{ fontSize: "13px", color: "#64748b", marginTop: "6px", lineHeight: "1.5" }}>{subtitle}</p>
          </div>
        </div>

        {done ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "20px 0" }}>
            <CheckCircle2 size={48} style={{ color: "#0099A8" }} />
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#004F58", textAlign: "center" }}>Contrasenya establerta correctament!</p>
            <p style={{ fontSize: "13px", color: "#475569", textAlign: "center" }}>Redirigint a l'inici de sessió…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Nova contrasenya</label>
              <div style={{ position: "relative" }}>
                <Input type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínim 8 caràcters" required autoFocus style={{ height: "44px", borderRadius: "10px", border: "1.5px solid rgba(0,153,168,0.2)", fontSize: "14px", background: "rgba(240,249,250,0.6)", paddingRight: "44px" }} />
                <button type="button" onClick={() => setShowPwd(!showPwd)} tabIndex={-1} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "2px", display: "flex", alignItems: "center" }}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Confirma la contrasenya</label>
              <Input type={showPwd ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeteix la contrasenya" required style={{ height: "44px", borderRadius: "10px", border: "1.5px solid rgba(0,153,168,0.2)", fontSize: "14px", background: "rgba(240,249,250,0.6)" }} />
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", fontSize: "12.5px", color: "#dc2626" }}>{error}</div>
            )}

            <button type="submit" disabled={loading} style={{ height: "46px", borderRadius: "11px", background: loading ? "rgba(0,153,168,0.5)" : "linear-gradient(135deg, #0099A8 0%, #006E7A 100%)", color: "#fff", fontWeight: 700, fontSize: "14.5px", letterSpacing: "0.01em", border: "none", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: loading ? "none" : "0 4px 14px rgba(0,153,168,0.28)" }}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Guardant…" : "Establir contrasenya"}
            </button>
          </form>
        )}

        <p style={{ marginTop: "28px", textAlign: "center", fontSize: "11px", color: "#94a3b8", letterSpacing: "0.02em" }}>Accés restringit al personal autoritzat</p>
      </div>
    </div>
  );
}
