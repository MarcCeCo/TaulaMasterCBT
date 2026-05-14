// src/main.tsx  (versió actualitzada)
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { AuthProvider } from "./components/auth/AuthProvider";
import { DataStoreProvider } from "./lib/dataStore";
import { ProjectesProvider } from "./lib/useProjectes";

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <DataStoreProvider>
        <ProjectesProvider>
          <RouterProvider router={router} />
        </ProjectesProvider>
      </DataStoreProvider>
    </AuthProvider>
  </StrictMode>
);
