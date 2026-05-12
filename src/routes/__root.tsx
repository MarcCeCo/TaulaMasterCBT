// src/routes/__root.tsx
import { Outlet, createRootRoute } from "@tanstack/react-router";
import "../styles.css";
import { useAuth } from "@/lib/auth";
import { isAuthCallbackUrl } from "@/components/auth/AuthProvider";
import { LoginPage } from "@/components/auth/LoginPage";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

// Supabase de vegades redirigeix a /?token_hash=...&type=invite en lloc de
// a /auth/callback. Detectem aquest cas NOMÉS quan estem a l'arrel (/)
// i redirigim a /auth/callback preservant els params.
function useAuthTokenRedirect() {
  useEffect(() => {
    // Només actuem si estem exactament a l'arrel, NO a /auth/callback
    if (window.location.pathname !== "/") return;

    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");

    if (tokenHash && (type === "invite" || type === "recovery")) {
      window.location.replace(
        `/auth/callback?token_hash=${tokenHash}&type=${type}`
      );
    }
  }, []);
}

function RootComponent() {
  const { user, loading } = useAuth();
  const onCallbackPage = isAuthCallbackUrl();

  useAuthTokenRedirect();

  // Si estem a /auth/callback, sempre mostrem l'Outlet independentment de
  // l'estat de sessió i del loading. Això evita que els events de Supabase
  // (USER_UPDATED, PASSWORD_RECOVERY) que dispara updateUser() provoquin
  // un re-render del root que desmuntaria UpdatePasswordPage just abans
  // que s'executi window.location.replace().
  if (onCallbackPage) {
    return <Outlet />;
  }

  // Mostrem el spinner NOMÉS si hi ha una sessió emmagatzemada i estem esperant
  // que l'AuthProvider la validi. Si no hi ha sessió al localStorage (cas post-signOut),
  // anem directament a LoginPage sense spinner — evita bloquejar la navegació
  // quan el router de TanStack rep el canvi de ruta després del signOut.
  const hasStoredSession = !!localStorage.getItem("cbt-taula-master-auth");

  if (loading && hasStoredSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7F8]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0099A8]" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <Outlet />;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Pàgina no trobada</h2>
        <p className="mt-2 text-sm text-muted-foreground">La pàgina que busques no existeix.</p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Torna a l'inici
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});
