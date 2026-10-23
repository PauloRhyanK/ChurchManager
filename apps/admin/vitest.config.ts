import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Fuso fixo (UTC-3) para os testes de datas reproduzirem o recuo de dia em
    // qualquer máquina ou CI, inclusive as que correm em UTC.
    env: { TZ: "America/Sao_Paulo" },
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
