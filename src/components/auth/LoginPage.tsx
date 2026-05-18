// src/components/auth/LoginPage.tsx
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, Waves } from "lucide-react";

type Mode = "login" | "reset";

export function LoginPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  // Login
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  // Reset
  const [resetEmail, setResetEmail]     = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone, setResetDone]       = useState(false);
  const [resetError, setResetError]     = useState("");

  const passwordJustUpdated =
    new URLSearchParams(window.location.search).get("passwordUpdated") === "1";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      setError((err as Error).message ?? "Credencials incorrectes");
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
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
      setResetDone(true);
    } catch (err: unknown) {
      setResetError((err as Error).message ?? "Error enviant el correu");
    } finally {
      setResetLoading(false);
    }
  };

  /* ── Estils compartits ── */
  const inputStyle: React.CSSProperties = {
    height: "42px",
    borderRadius: "8px",
    border: "1px solid #D8DDD8",
    background: "#F3F4F2",
    fontSize: "13.5px",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: "#1A1F1E",
    transition: "border-color .15s, background .15s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 500,
    color: "#4A5450",
    marginBottom: "5px",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F3F4F2",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Blobs decoratius suaus */}
      <div aria-hidden style={{
        position: "fixed", top: "-80px", right: "-80px",
        width: "360px", height: "360px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,153,168,.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div aria-hidden style={{
        position: "fixed", bottom: "-60px", left: "-60px",
        width: "260px", height: "260px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,61,68,.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Targeta principal */}
      <div style={{
        width: "100%",
        maxWidth: "380px",
        margin: "0 16px",
        background: "#FFFFFF",
        borderRadius: "18px",
        border: "1px solid #D8DDD8",
        boxShadow: "0 1px 3px rgba(0,61,68,.06), 0 8px 24px rgba(0,61,68,.10)",
        padding: "40px 36px 36px",
        position: "relative",
      }}>

        {/* Logomarca */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", marginBottom: "32px" }}>
          <div style={{
            width: "60px", height: "60px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #003D44 0%, #007380 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid rgba(0,61,68,.1)",
            boxShadow: "0 2px 10px rgba(0,61,68,.15)",
          }}>
            <Waves style={{ width: "28px", height: "28px", color: "#4DC9D8" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{
              fontSize: "9.5px", fontWeight: 600, letterSpacing: ".14em",
              textTransform: "uppercase", color: "#0099A8", opacity: .7, marginBottom: "3px",
            }}>
              Consorci Besòs · Tordera
            </p>
            <h1 style={{
              fontSize: "20px", fontWeight: 600, color: "#1A1F1E",
              letterSpacing: "-.02em", margin: 0,
            }}>
              CBT · TaulaMaster
            </h1>
          </div>
        </div>

        {/* Banner contrasenya actualitzada */}
        {passwordJustUpdated && mode === "login" && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "10px",
            padding: "12px 14px", borderRadius: "10px", marginBottom: "20px",
            background: "#EAF8FA", border: "1px solid #C8EFF4",
          }}>
            <CheckCircle2 size={16} style={{ color: "#0099A8", flexShrink: 0, marginTop: "2px" }} />
            <div>
              <p style={{ fontSize: "12.5px", fontWeight: 600, color: "#005A63", marginBottom: "2px" }}>
                Contrasenya actualitzada
              </p>
              <p style={{ fontSize: "12px", color: "#4A5450", lineHeight: "1.4" }}>
                La teva contrasenya s'ha establert correctament.
              </p>
            </div>
          </div>
        )}

        {/* ── MODE LOGIN ── */}
        {mode === "login" && (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Correu electrònic</label>
              <Input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuari@besos-tordera.cat" required autoFocus
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Contrasenya</label>
                <button
                  type="button"
                  onClick={() => { setMode("reset"); setResetEmail(email); }}
                  style={{ fontSize: "11.5px", color: "#0099A8", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}
                >
                  Has oblidat la contrasenya?
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <Input
                  type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  style={{ ...inputStyle, paddingRight: "44px" }}
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "2px", display: "flex", alignItems: "center" }}
                  aria-label={showPassword ? "Amaga la contrasenya" : "Mostra la contrasenya"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: "10px 12px", borderRadius: "8px", background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.2)", fontSize: "12.5px", color: "#dc2626" }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                marginTop: "2px",
                height: "42px", borderRadius: "10px",
                background: loading
                  ? "rgba(0,153,168,.45)"
                  : "linear-gradient(135deg, #003D44 0%, #007380 100%)",
                color: "#fff", fontWeight: 600, fontSize: "14px",
                fontFamily: "'DM Sans', sans-serif",
                letterSpacing: "-.01em",
                border: "none", cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                boxShadow: loading ? "none" : "0 2px 8px rgba(0,61,68,.2)",
                transition: "opacity .15s",
              }}
            >
              {loading && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
              {loading ? "Accedint…" : "Accedeix"}
            </button>
          </form>
        )}

        {/* ── MODE RESET ── */}
        {mode === "reset" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <button
              type="button"
              onClick={() => { setMode("login"); setResetDone(false); setResetError(""); }}
              style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#4A5450", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500, alignSelf: "flex-start", fontFamily: "'DM Sans', sans-serif" }}
            >
              <ArrowLeft size={12} /> Tornar a l'inici de sessió
            </button>

            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#1A1F1E", marginBottom: "5px", letterSpacing: "-.02em" }}>
                Restablir contrasenya
              </h2>
              <p style={{ fontSize: "12.5px", color: "#4A5450", lineHeight: "1.5" }}>
                T'enviarem un correu per establir una nova contrasenya.
              </p>
            </div>

            {resetDone ? (
              <div style={{ padding: "16px", borderRadius: "10px", background: "#EAF8FA", border: "1px solid #C8EFF4", textAlign: "center" }}>
                <p style={{ fontSize: "13px", color: "#005A63", fontWeight: 600, marginBottom: "4px" }}>✓ Correu enviat!</p>
                <p style={{ fontSize: "12px", color: "#4A5450" }}>
                  Comprova la safata d'entrada de <strong>{resetEmail}</strong>.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Correu electrònic</label>
                  <Input
                    type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="usuari@besos-tordera.cat" required autoFocus
                    style={inputStyle}
                  />
                </div>
                {resetError && (
                  <div style={{ padding: "10px 12px", borderRadius: "8px", background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.2)", fontSize: "12.5px", color: "#dc2626" }}>
                    {resetError}
                  </div>
                )}
                <button
                  type="submit" disabled={resetLoading}
                  style={{
                    height: "42px", borderRadius: "10px",
                    background: resetLoading
                      ? "rgba(0,153,168,.45)"
                      : "linear-gradient(135deg, #003D44 0%, #007380 100%)",
                    color: "#fff", fontWeight: 600, fontSize: "14px",
                    fontFamily: "'DM Sans', sans-serif",
                    border: "none", cursor: resetLoading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    boxShadow: resetLoading ? "none" : "0 2px 8px rgba(0,61,68,.2)",
                  }}
                >
                  {resetLoading && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
                  {resetLoading ? "Enviant…" : "Envia l'enllaç"}
                </button>
              </form>
            )}
          </div>
        )}

        <p style={{ marginTop: "24px", textAlign: "center", fontSize: "11px", color: "#94a3b8", letterSpacing: ".02em" }}>
          Accés restringit al personal autoritzat
        </p>
      </div>
    </div>
  );
}
