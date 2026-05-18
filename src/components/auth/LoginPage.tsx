// src/components/auth/LoginPage.tsx — CBT redesign v2
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, Droplets } from "lucide-react";

type Mode = "login" | "reset";

export function LoginPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");

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
    try { await signIn(email, password); }
    catch (err: unknown) { setError((err as Error).message ?? "Credencials incorrectes"); }
    finally { setLoading(false); }
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
    } catch (err: unknown) { setResetError((err as Error).message ?? "Error enviant el correu"); }
    finally { setResetLoading(false); }
  };

  const F = 'Plus Jakarta Sans, system-ui, sans-serif';

  const inputStyle: React.CSSProperties = {
    height: "44px",
    borderRadius: "10px",
    border: "1.5px solid #E2E8E8",
    background: "#F8F9F8",
    fontSize: "13.5px",
    fontFamily: F,
    color: "#1A2E35",
    outline: "none",
    transition: "border-color .15s, box-shadow .15s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "11.5px", fontWeight: 600,
    color: "#4A6572", marginBottom: "6px", fontFamily: F,
    letterSpacing: "0.01em",
  };

  return (
    <div className="cbt-login-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F }}>

      {/* Panell central */}
      <div style={{
        width: "100%", maxWidth: "400px", margin: "0 16px",
        background: "#fff",
        borderRadius: "24px",
        border: "1px solid rgba(0,90,99,0.1)",
        boxShadow: "0 4px 6px rgba(0,61,68,0.04), 0 20px 40px rgba(0,61,68,0.10)",
        overflow: "hidden",
        position: "relative",
      }}>

        {/* Franja de color superior */}
        <div style={{
          height: "6px",
          background: "linear-gradient(90deg, #001F23 0%, #007380 50%, #4DC9D8 100%)",
        }} />

        <div style={{ padding: "36px 36px 32px" }}>

          {/* Logomarca */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", marginBottom: "30px" }}>
            <div style={{
              width: "64px", height: "64px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #001F23 0%, #005A63 60%, #0099A8 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,61,68,0.2), 0 0 0 4px rgba(0,153,168,0.08)",
            }}>
              <Droplets style={{ width: "30px", height: "30px", color: "#4DC9D8" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{
                fontSize: "9px", fontWeight: 800, letterSpacing: ".18em",
                textTransform: "uppercase", color: "#0099A8", marginBottom: "4px",
              }}>
                Consorci Besòs · Tordera
              </p>
              <h1 style={{
                fontSize: "21px", fontWeight: 800, color: "#0D1F25",
                letterSpacing: "-.025em", margin: 0, lineHeight: 1.1,
              }}>
                CBT · TaulaMaster
              </h1>
              <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px", fontWeight: 400 }}>
                Gestió d'actius i paràmetres tècnics
              </p>
            </div>
          </div>

          {/* Banner contrasenya actualitzada */}
          {passwordJustUpdated && mode === "login" && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "10px",
              padding: "12px 14px", borderRadius: "12px", marginBottom: "20px",
              background: "rgba(0,153,168,0.06)", border: "1px solid rgba(0,153,168,0.18)",
            }}>
              <CheckCircle2 size={15} style={{ color: "#0099A8", flexShrink: 0, marginTop: "1px" }} />
              <div>
                <p style={{ fontSize: "12px", fontWeight: 700, color: "#005A63", marginBottom: "2px" }}>
                  Contrasenya actualitzada
                </p>
                <p style={{ fontSize: "11.5px", color: "#4A6572", lineHeight: "1.4" }}>
                  La teva contrasenya s'ha establert correctament.
                </p>
              </div>
            </div>
          )}

          {/* ── MODE LOGIN ── */}
          {mode === "login" && (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Correu electrònic</label>
                <Input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuari@besos-tordera.cat" required autoFocus
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = "#0099A8"; e.target.style.boxShadow = "0 0 0 3px rgba(0,153,168,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#E2E8E8"; e.target.style.boxShadow = "none"; }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Contrasenya</label>
                  <button
                    type="button"
                    onClick={() => { setMode("reset"); setResetEmail(email); }}
                    style={{ fontSize: "11px", color: "#0099A8", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600, fontFamily: F }}
                  >
                    Has oblidat la contrasenya?
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    style={{ ...inputStyle, paddingRight: "44px" }}
                    onFocus={(e) => { e.target.style.borderColor = "#0099A8"; e.target.style.boxShadow = "0 0 0 3px rgba(0,153,168,0.1)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#E2E8E8"; e.target.style.boxShadow = "none"; }}
                  />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                    style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "2px", display: "flex", alignItems: "center" }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ padding: "10px 13px", borderRadius: "10px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", fontSize: "12px", color: "#dc2626", fontWeight: 500 }}>
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                style={{
                  marginTop: "4px", height: "46px", borderRadius: "12px",
                  background: loading ? "rgba(0,153,168,0.5)" : "linear-gradient(135deg, #001F23 0%, #005A63 60%, #007380 100%)",
                  color: "#fff", fontWeight: 700, fontSize: "14px",
                  fontFamily: F, letterSpacing: "-.01em",
                  border: "none", cursor: loading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  boxShadow: loading ? "none" : "0 4px 14px rgba(0,61,68,0.25)",
                  transition: "opacity .15s, transform .1s",
                }}
                onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = "0.92"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              >
                {loading && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
                {loading ? "Accedint…" : "Accedeix"}
              </button>
            </form>
          )}

          {/* ── MODE RESET ── */}
          {mode === "reset" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <button
                type="button"
                onClick={() => { setMode("login"); setResetDone(false); setResetError(""); }}
                style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#4A6572", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600, alignSelf: "flex-start", fontFamily: F }}
              >
                <ArrowLeft size={13} /> Tornar a l'inici de sessió
              </button>

              <div style={{ textAlign: "center", paddingBottom: "4px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#0D1F25", marginBottom: "5px", letterSpacing: "-.02em" }}>
                  Restablir contrasenya
                </h2>
                <p style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.5" }}>
                  T'enviarem un correu per establir una nova contrasenya.
                </p>
              </div>

              {resetDone ? (
                <div style={{ padding: "18px", borderRadius: "14px", background: "rgba(0,153,168,0.06)", border: "1px solid rgba(0,153,168,0.18)", textAlign: "center" }}>
                  <p style={{ fontSize: "13px", color: "#005A63", fontWeight: 700, marginBottom: "4px" }}>✓ Correu enviat!</p>
                  <p style={{ fontSize: "12px", color: "#4A6572" }}>
                    Comprova la safata d'entrada de <strong>{resetEmail}</strong>.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Correu electrònic</label>
                    <Input
                      type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="usuari@besos-tordera.cat" required autoFocus
                      style={inputStyle}
                      onFocus={(e) => { e.target.style.borderColor = "#0099A8"; e.target.style.boxShadow = "0 0 0 3px rgba(0,153,168,0.1)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "#E2E8E8"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>
                  {resetError && (
                    <div style={{ padding: "10px 13px", borderRadius: "10px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", fontSize: "12px", color: "#dc2626", fontWeight: 500 }}>
                      {resetError}
                    </div>
                  )}
                  <button
                    type="submit" disabled={resetLoading}
                    style={{
                      height: "46px", borderRadius: "12px",
                      background: resetLoading ? "rgba(0,153,168,0.5)" : "linear-gradient(135deg, #001F23 0%, #005A63 60%, #007380 100%)",
                      color: "#fff", fontWeight: 700, fontSize: "14px", fontFamily: F,
                      border: "none", cursor: resetLoading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                      boxShadow: resetLoading ? "none" : "0 4px 14px rgba(0,61,68,0.25)",
                    }}
                  >
                    {resetLoading && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
                    {resetLoading ? "Enviant…" : "Envia l'enllaç"}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Footer */}
          <p style={{ marginTop: "24px", textAlign: "center", fontSize: "10.5px", color: "#cbd5e1", letterSpacing: ".02em" }}>
            Accés restringit al personal autoritzat
          </p>
        </div>
      </div>
    </div>
  );
}
