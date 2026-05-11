// src/routes/__root.tsx  (versió actualitzada amb auth gate)
import { Outlet, createRootRoute } from "@tanstack/react-router";
import "../styles.css";
import { useAuth } from "@/lib/auth";
import { LoginPage } from "@/components/auth/LoginPage";
import { Loader2 } from "lucide-react";

function RootComponent() {
  const { user, loading } = useAuth();

  if (loading) {
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
