// src/routes/auth/callback.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { UpdatePasswordPage } from "@/components/auth/UpdatePasswordPage";
import { Loader2 } from "lucide-react";

type FlowType = "recovery" | "invite";

// ─── Estat de mòdul: persisteix entre remuntatges ─────────────────────────────

let cachedResult: { flowType: FlowType } | { error: string } | null = null;
let redirectScheduled = false;

// Listener de USER_UPDATED registrat A NIVELL DE MÒDUL, fora de React.
//
// Per què aquí i no dins un useEffect?
//   - useEffect retorna un cleanup que fa unsubscribe quan el component es desmunta.
//   - Quan updateUser() s'executa, Supabase emet USER_UPDATED → AuthProvider fa
//     setLoading → __root re-renderitza → el component es pot desmuntar MENTRE
//     l'event USER_UPDATED encara no ha arribat als listeners del useEffect.
//   - Un listener de mòdul viu durant tota la sessió del navegador; cap
//     desmuntatge de component el pot matar.
//
// Registrem el listener immediatament quan el mòdul es carrega (import time).
supabase.auth.onAuthStateChange(async (event) => {
  if (event !== "USER_UPDATED") return;
  if (redirectScheduled) return;
  redirectScheduled = true;

  // signOut + reload dur. No depèn de cap estat React ni cicle de vida.
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // Ignorem: la contrasenya ja ha canviat, la sessió anterior és invàlida.
  }
  localStorage.removeItem("cbt-taula-master-auth");
  // Reload dur: garanteix que AuthProvider arrenca des de zero sense sessió.
  window.location.replace("/");
});

// ─── Component ────────────────────────────────────────────────────────────────

function AuthCallbackComponent() {
  const [flowType, setFlowType] = useState<FlowType | null>(
    cachedResult && "flowType" in cachedResult ? cachedResult.flowType : null
  );
  const [error, setError] = useState<string | null>(
    cachedResult && "error" in cachedResult ? cachedResult.error : null
  );
  const verifying = useRef(false);

  useEffect(() => {
    // Si ja tenim resultat en cache (remuntatge), no cal tornar a verificar
    if (cachedResult) return;
    // Evitem doble execució en StrictMode
    if (verifying.current) return;
    verifying.current = true;

    async function processToken() {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type") as FlowType | null;

      if (!tokenHash || (type !== "invite" && type !== "recovery")) {
        const err = "Enllaç no vàlid. Sol·licita un nou correu.";
        cachedResult = { error: err };
        setError(err);
        return;
      }

      // Netejem els query params de la URL per evitar re-execucions
      // si el component es remunta, sense canviar la ruta visible.
      window.history.replaceState({}, "", "/auth/callback");

      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type === "invite" ? "invite" : "recovery",
      });

      if (otpError) {
        const err = "L'enllaç ha caducat o ja ha estat utilitzat. Sol·licita un nou correu.";
        cachedResult = { error: err };
        setError(err);
        return;
      }

      cachedResult = { flowType: type };
      setFlowType(type);
    }

    processToken();
  }, []);

  if (!flowType && !error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F5F7F8]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0099A8]" />
        <p className="text-sm text-slate-500">Verificant l'enllaç…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7F8] px-4">
        <div className="max-w-sm w-full rounded-2xl bg-white shadow-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Enllaç no vàlid</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #0099A8 0%, #006E7A 100%)" }}
          >
            Torna a l'inici de sessió
          </a>
        </div>
      </div>
    );
  }

  return <UpdatePasswordPage type={flowType!} />;
}

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackComponent,
});
