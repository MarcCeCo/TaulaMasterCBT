// src/main.tsx  (versió actualitzada)
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { AuthProvider } from "./components/auth/AuthProvider";
import { DataStoreProvider } from "./lib/dataStore";

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <DataStoreProvider>
        <RouterProvider router={router} />
      </DataStoreProvider>
    </AuthProvider>
  </StrictMode>
);
