import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        promotora: resolve(__dirname, "promotora.html"),
        visitaComercial: resolve(__dirname, "visita-comercial.html"),
        sorteioCupons: resolve(__dirname, "sorteio-cupons.html"),
      },
    },
  },
}));
