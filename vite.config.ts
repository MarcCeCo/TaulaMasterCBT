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
          // Vendors pesants — sempre separats
          if (id.includes("node_modules/xlsx")) return "vendor-xlsx";
          if (id.includes("node_modules/@supabase")) return "vendor-supabase";
          if (id.includes("node_modules/@radix-ui")) return "vendor-ui";
          if (id.includes("node_modules/lucide-react")) return "vendor-ui";

          // Pàgines pesants de l'app — chunks propis per lazy loading efectiu
          if (id.includes("ProjectesEquipsPage")) return "page-projectes";
          if (id.includes("EquipmentsTable") || id.includes("EquipmentDetailDialog") || id.includes("EquipmentFormDialog")) return "page-equips";
          if (id.includes("Visualitzador3DPage")) return "page-visor3d";
          if (id.includes("RevitBimPage")) return "page-revit";
          if (id.includes("GubimClassManager")) return "page-gubim";
          if (id.includes("FieldsDictionaryDialog") || id.includes("AddFieldDialog") || id.includes("FieldPickerDialog")) return "page-fields";
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
