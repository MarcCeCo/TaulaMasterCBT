// src/main.tsx
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { AuthProvider } from "./components/auth/AuthProvider";
import { DataStoreProvider } from "./lib/dataStore";
import { ProjectesProvider } from "./lib/useProjectes";

// Visor 3D públic (/public/visor/<token>): s'obre SENSE sessió ni cap proveïdor
// de dades internes (ni AuthProvider, ni login). Només hi arriba aquesta ruta.
const VisorPublicPage = lazy(() =>
  import("./components/cbt/VisorPublicPage").then((m) => ({
    default: m.VisorPublicPage,
  })),
);

const esVisorPublic = window.location.pathname.startsWith("/public/visor/");
const root = createRoot(document.getElementById("root")!);

if (esVisorPublic) {
  root.render(
    <StrictMode>
      <Suspense fallback={null}>
        <VisorPublicPage />
      </Suspense>
    </StrictMode>,
  );
} else {
  const router = getRouter();
  root.render(
    <StrictMode>
      <AuthProvider>
        <DataStoreProvider>
          <ProjectesProvider>
            <RouterProvider router={router} />
          </ProjectesProvider>
        </DataStoreProvider>
      </AuthProvider>
    </StrictMode>,
  );
}
