// src/components/auth/LoginPage.tsx
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logo from "@/assets/Simbol_Web2.png";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";

type Mode = "login" | "reset";

export function LoginPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err.message ?? "Credencials incorrectes");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setResetDone(true);
    } catch (err: any) {
      setResetError(err.message ?? "Error enviant el correu");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #f0f9fa 0%, #e0f4f6 40%, #f5f7f8 100%)",
      }}
    >
      {/* Decorative blobs */}
      <div
        aria-hidden
        style={{
          position: "fixed", top: "-120px", right: "-120px",
          width: "420px", height: "420px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,153,168,0.13) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed", bottom: "-80px", left: "-80px",
          width: "300px", height: "300px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,110,122,0.09) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "100%", maxWidth: "400px", margin: "0 16px",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(16px)",
          borderRadius: "20px",
          boxShadow: "0 4px 6px rgba(0,110,122,0.06), 0 20px 40px rgba(0,110,122,0.10), 0 0 0 1px rgba(0,153,168,0.08)",
          padding: "44px 40px 40px",
          position: "relative",
        }}
      >
        {/* Logo + header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", marginBottom: "36px" }}>
          <div
            style={{
              width: "72px", height: "72px", borderRadius: "18px",
              background: "linear-gradient(135deg, rgba(0,153,168,0.12), rgba(0,110,122,0.08))",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1.5px solid rgba(0,153,168,0.18)",
              boxShadow: "0 2px 12px rgba(0,153,168,0.12)",
            }}
          >
            <img src={logo} alt="CBT" style={{ width: "52px", height: "52px", objectFit: "contain" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{
              fontSize: "10px", fontWeight: 600, letterSpacing: "0.14em",
              textTransform: "uppercase" as const, color: "#0099A8", opacity: 0.7, marginBottom: "4px",
            }}>
              Consorci Besòs · Tordera
            </p>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#004F58", letterSpacing: "-0.01em" }}>
              CBT · TaulaMaster
            </h1>
          </div>
        </div>

        {/* ── LOGIN ── */}
        {mode === "login" && (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Correu electrònic</label>
              <Input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuari@example.com" required autoFocus
                style={{ height: "44px", borderRadius: "10px", border: "1.5px solid rgba(0,153,168,0.2)", fontSize: "14px", background: "rgba(240,249,250,0.6)" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Contrasenya</label>
                <button
                  type="button"
                  onClick={() => { setMode("reset"); setResetEmail(email); }}
                  style={{ fontSize: "11px", color: "#0099A8", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  Has oblidat la contrasenya?
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <Input
                  type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                  style={{ height: "44px", borderRadius: "10px", border: "1.5px solid rgba(0,153,168,0.2)", fontSize: "14px", background: "rgba(240,249,250,0.6)", paddingRight: "44px" }}
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "2px", display: "flex", alignItems: "center" }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", fontSize: "12.5px", color: "#dc2626" }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                height: "46px", borderRadius: "11px",
                background: loading ? "rgba(0,153,168,0.5)" : "linear-gradient(135deg, #0099A8 0%, #006E7A 100%)",
                color: "#fff", fontWeight: 700, fontSize: "14.5px", letterSpacing: "0.01em",
                border: "none", cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                boxShadow: loading ? "none" : "0 4px 14px rgba(0,153,168,0.28)",
                transition: "transform 0.1s",
              }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Accedint…" : "Accedeix"}
            </button>
          </form>
        )}

        {/* ── RESET ── */}
        {mode === "reset" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <button
              type="button"
              onClick={() => { setMode("login"); setResetDone(false); setResetError(""); }}
              style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500, alignSelf: "flex-start" }}
            >
              <ArrowLeft size={13} /> Tornar a l'inici de sessió
            </button>

            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#004F58", marginBottom: "6px" }}>
                Restablir contrasenya
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.5" }}>
                T'enviarem un correu amb un enllaç per establir una nova contrasenya.
              </p>
            </div>

            {resetDone ? (
              <div style={{ padding: "16px 18px", borderRadius: "12px", background: "rgba(0,153,168,0.07)", border: "1.5px solid rgba(0,153,168,0.2)", textAlign: "center" }}>
                <p style={{ fontSize: "13.5px", color: "#006E7A", fontWeight: 600, marginBottom: "4px" }}>✓ Correu enviat!</p>
                <p style={{ fontSize: "12.5px", color: "#475569" }}>
                  Comprova la safata d'entrada de <strong>{resetEmail}</strong> i segueix l'enllaç per restablir la contrasenya.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Correu electrònic</label>
                  <Input
                    type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="usuari@example.com" required autoFocus
                    style={{ height: "44px", borderRadius: "10px", border: "1.5px solid rgba(0,153,168,0.2)", fontSize: "14px", background: "rgba(240,249,250,0.6)" }}
                  />
                </div>
                {resetError && (
                  <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", fontSize: "12.5px", color: "#dc2626" }}>
                    {resetError}
                  </div>
                )}
                <button
                  type="submit" disabled={resetLoading}
                  style={{
                    height: "46px", borderRadius: "11px",
                    background: resetLoading ? "rgba(0,153,168,0.5)" : "linear-gradient(135deg, #0099A8 0%, #006E7A 100%)",
                    color: "#fff", fontWeight: 700, fontSize: "14.5px", border: "none",
                    cursor: resetLoading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    boxShadow: resetLoading ? "none" : "0 4px 14px rgba(0,153,168,0.28)",
                  }}
                >
                  {resetLoading && <Loader2 size={16} className="animate-spin" />}
                  {resetLoading ? "Enviant…" : "Envia l'enllaç"}
                </button>
              </form>
            )}
          </div>
        )}

        <p style={{ marginTop: "28px", textAlign: "center", fontSize: "11px", color: "#94a3b8", letterSpacing: "0.02em" }}>
          Accés restringit al personal autoritzat
        </p>
      </div>
    </div>
  );
}
