import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0", port: 5173,
    proxy: {
      "/api": {
        target: process.env.BIBLE_API_ORIGIN || "http://127.0.0.1:8080",
        changeOrigin: false,
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        landing: resolve(process.cwd(), "index.html"),
        reader: resolve(process.cwd(), "app/index.html"),
      },
    },
  },
});
