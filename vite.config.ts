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
        manualChunks: (id) => {
          // Només separem vendors externs — deixem que Rollup gestioni els chunks de l'app
          // per evitar problemes de circular dependency en el codi propi.
          if (id.includes("node_modules/xlsx")) return "vendor-xlsx";
          if (id.includes("node_modules/@supabase")) return "vendor-supabase";
          if (id.includes("node_modules/@radix-ui")) return "vendor-ui";
          if (id.includes("node_modules/lucide-react")) return "vendor-ui";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "vendor-react";
        },
      },
    },
    chunkSizeWarningLimit: 600,
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
