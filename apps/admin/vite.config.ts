import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envDir: path.resolve(__dirname, "../.."),
  envPrefix: ["VITE_", "API_"],
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    // Não calcular tamanho gzip de cada chunk: é a fase (após "modules transformed")
    // que segura toda a saída em memória e mais contribui para o OOM em VPS pequenas.
    reportCompressedSize: false,
    // esbuild consome muito menos memória que terser na minificação.
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // Menos operações de ficheiro em paralelo → menor pico de memória no write.
      maxParallelFileOps: 2,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
