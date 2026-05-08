import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "/",
  build: {
    outDir: "dist",
    sourcemap: false,
    // PERF: chunks separats per evitar que xlsx (gran) bloquegi la càrrega inicial
    rollupOptions: {
      output: {
        manualChunks: {
          // xlsx (~800KB) només es carrega quan s'importa/exporta, no a l'inici
          "vendor-xlsx": ["xlsx"],
          // supabase separat del bundle principal
          "vendor-supabase": ["@supabase/supabase-js"],
          // radix/shadcn — canvia poc, ben cacheable
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
          ],
        },
      },
    },
    // PERF: treeshaking agressiu
    minify: "esbuild",
    target: "es2020",
  },
  assetsInclude: ["**/*.gif", "**/*.png", "**/*.jpg", "**/*.svg", "**/*.webp"],
  // PERF: precàrrega de mòduls importants en dev
  optimizeDeps: {
    include: ["react", "react-dom", "@supabase/supabase-js"],
    // xlsx es carrega lazily, no pre-bundlem
    exclude: ["xlsx"],
  },
});
