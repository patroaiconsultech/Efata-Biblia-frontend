import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 8: top-level input defines both HTML entry points.
export default defineConfig({
  plugins: [react()],
  input: {
    landing: resolve(import.meta.dirname, "index.html"),
    reader: resolve(import.meta.dirname, "app/index.html"),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.BIBLE_API_ORIGIN || "http://127.0.0.1:8080",
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: false,
  },
});
