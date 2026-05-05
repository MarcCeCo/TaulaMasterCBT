import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useEffect } from "react";

// Importem el CSS directament — imprescindible per Tailwind v4 en mode SPA
import "../styles.css";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Pàgina no trobada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La pàgina que busques no existeix.
        </p>
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
  component: () => <Outlet />,
  notFoundComponent: NotFoundComponent,
});
