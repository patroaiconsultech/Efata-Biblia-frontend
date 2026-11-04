import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
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
