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
    // PERF: CSS separat per chunk → el CSS de pàgines no visitades no es carrega
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // PERF: chunks estratègics per maximitzar el cache del navegador
        manualChunks: (id) => {
          // xlsx és gran (≈750 KB) i només s'usa en accions explícites de l'usuari
          if (id.includes("node_modules/xlsx")) return "vendor-xlsx";
          // supabase és gran i necessari però estable → cache llarg
          if (id.includes("node_modules/@supabase")) return "vendor-supabase";
          // Radix UI + lucide junts: s'usen a totes les pàgines
          if (id.includes("node_modules/@radix-ui") || id.includes("node_modules/lucide-react")) return "vendor-ui";
          // React core: mai canvia entre deploys → cache màxim
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "vendor-react";
          // TanStack router: canvia poc
          if (id.includes("node_modules/@tanstack")) return "vendor-tanstack";
        },
        // PERF: noms de chunks estables per maximitzar cache del CDN
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    chunkSizeWarningLimit: 600,
    // PERF: esbuild és el minifier més ràpid i genera codi excel·lent
    minify: "esbuild",
    target: "es2020",
    // PERF: modulepreload automàtic (Vite 4+) precarga els chunks lazy en idle
    modulePreload: {
      polyfill: false, // tots els browsers moderns ho suporten nativament
    },
  },
  assetsInclude: ["**/*.gif", "**/*.png", "**/*.jpg", "**/*.svg", "**/*.webp"],
  // PERF: pre-bundle de deps usades a totes les pàgines
  // xlsx s'exclou: es carrega lazily, pre-bundlejar-lo no té sentit
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@supabase/supabase-js",
      "@tanstack/react-router",
      "sonner",
      "clsx",
      "tailwind-merge",
    ],
    exclude: ["xlsx"],
  },
});
