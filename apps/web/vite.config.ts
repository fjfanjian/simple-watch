import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true, sourcemap: true },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:13900" } },
});
