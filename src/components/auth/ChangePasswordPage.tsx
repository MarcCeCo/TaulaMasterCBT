// src/components/auth/ChangePasswordPage.tsx
// Pàgina de canvi de contrasenya integrada al layout principal (no pop-up).
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Eye, EyeOff, Loader2, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

export function ChangePasswordPage() {
  const { getToken } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) { setError("La contrasenya ha de tenir almenys 8 caràcters."); return; }
    if (password !== confirm) { setError("Les contrasenyes no coincideixen."); return; }

    setLoading(true);

    try {
      const token = getToken();

      if (!token) {
        setError("Sessió no disponible. Torna a iniciar sessió.");
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

      setDone(true);
      setPassword("");
      setConfirm("");

    } catch (err: any) {
      setError(err?.message ?? "Error de xarxa. Torna-ho a intentar.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Capçalera */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-[#0099A8]" />
          Canvia contrasenya
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Estableix una nova contrasenya per al teu compte
        </p>
      </div>

      <div className="max-w-md">
        <Card className="p-6 border-0 shadow-sm bg-white">
          {done ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-800">Contrasenya actualitzada!</p>
                <p className="text-sm text-slate-500 mt-1">
                  La teva contrasenya s'ha canviat correctament.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDone(false)}
                className="text-xs text-[#0099A8] hover:underline mt-1"
              >
                Torna a canviar-la
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                <div className="h-9 w-9 rounded-lg bg-[#0099A8]/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4.5 w-4.5 text-[#0099A8]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Seguretat del compte</p>
                  <p className="text-xs text-slate-400">Utilitza una contrasenya d'almenys 8 caràcters</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Nova contrasenya
                  </label>
                  <div className="relative">
                    <Input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínim 8 caràcters"
                      required
                      autoFocus
                      className="h-10 pr-10 border-slate-200 focus:border-[#0099A8] focus:ring-[#0099A8]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Confirma la contrasenya
                  </label>
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeteix la contrasenya"
                    required
                    className="h-10 border-slate-200 focus:border-[#0099A8] focus:ring-[#0099A8]/20"
                  />
                </div>

                {error && (
                  <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 rounded-lg font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all mt-2"
                  style={{
                    background: loading
                      ? "rgba(0,153,168,0.5)"
                      : "linear-gradient(135deg, #0099A8 0%, #006E7A 100%)",
                    boxShadow: loading ? "none" : "0 4px 14px rgba(0,153,168,0.25)",
                    cursor: loading ? "not-allowed" : "pointer",
                    border: "none",
                  }}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? "Guardant…" : "Actualitza la contrasenya"}
                </button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
