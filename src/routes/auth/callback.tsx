// src/routes/auth/callback.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { UpdatePasswordPage } from "@/components/auth/UpdatePasswordPage";
import { Loader2 } from "lucide-react";

type FlowType = "recovery" | "invite";

// Guardem el resultat fora del component perquè persisteixi entre remuntatges.
// Quan AuthProvider rep USER_UPDATED i re-renderitza __root, el component
// es desmunta i remunta — sense això tornaria a cridar verifyOtp (→ 429).
let cachedResult: { flowType: FlowType } | { error: string } | null = null;

// Flag global per evitar que múltiples instàncies del component (per remuntatge)
// llancin el redirect simultàniament.
let redirectScheduled = false;

async function doSignOutAndRedirect() {
  if (redirectScheduled) return;
  redirectScheduled = true;
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // Ignorem: updateUser ja ha invalidat la sessió al servidor.
  }
  localStorage.removeItem("cbt-taula-master-auth");
  window.location.replace("/");
}

function AuthCallbackComponent() {
  const [flowType, setFlowType] = useState<FlowType | null>(
    cachedResult && "flowType" in cachedResult ? cachedResult.flowType : null
  );
  const [error, setError] = useState<string | null>(
    cachedResult && "error" in cachedResult ? cachedResult.error : null
  );
  const verifying = useRef(false);

  // Escolta USER_UPDATED a nivell de callback, no dins UpdatePasswordPage.
  // Motiu: USER_UPDATED és l'event que Supabase emet quan updateUser() té èxit.
  // Fer el redirect aquí garanteix que funciona independentment de quants
  // remuntatges del component passin per culpa dels re-renders de l'AuthProvider.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "USER_UPDATED") {
        // Petit delay perquè UpdatePasswordPage pugui mostrar el tick de confirmació
        setTimeout(doSignOutAndRedirect, 800);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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
